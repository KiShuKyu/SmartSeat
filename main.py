from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import aiosqlite
import asyncio
from datetime import datetime, timedelta
import os

app = FastAPI(title="SmartSeat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB = "smartseat.db"

# ── DB init ──────────────────────────────────────────────
async def init_db():
    async with aiosqlite.connect(DB) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS seats (
                id TEXT PRIMARY KEY,
                section TEXT NOT NULL,
                status TEXT DEFAULT 'vacant'
            )""")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seat_id TEXT NOT NULL,
                urn TEXT NOT NULL,
                student_name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_hours INTEGER NOT NULL,
                active INTEGER DEFAULT 1
            )""")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS borrow_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                urn TEXT NOT NULL,
                student_name TEXT NOT NULL,
                book_title TEXT NOT NULL,
                author TEXT,
                borrow_time TEXT NOT NULL,
                return_time TEXT,
                returned INTEGER DEFAULT 0
            )""")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS entry_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                urn TEXT NOT NULL,
                event TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )""")

        # Seed seats if empty
        cur = await db.execute("SELECT COUNT(*) FROM seats")
        count = (await cur.fetchone())[0]
        if count == 0:
            seats = []
            for i in range(1, 13):
                seats.append((f"T{i}", "top"))
            for cl in ["A", "B"]:
                for r in range(1, 7):
                    seats.append((f"{cl}{r}L", f"table_{cl}"))
                    seats.append((f"{cl}{r}R", f"table_{cl}"))
            await db.executemany("INSERT INTO seats(id,section) VALUES(?,?)", seats)
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(auto_release_loop())

# ── Auto-release expired reservations ────────────────────
async def auto_release_loop():
    while True:
        await asyncio.sleep(60)
        now = datetime.now().isoformat()
        async with aiosqlite.connect(DB) as db:
            cur = await db.execute(
                "SELECT seat_id FROM reservations WHERE active=1 AND end_time <= ?", (now,))
            expired = await cur.fetchall()
            for (sid,) in expired:
                await db.execute(
                    "UPDATE reservations SET active=0 WHERE seat_id=? AND active=1", (sid,))
                await db.execute(
                    "UPDATE seats SET status='vacant' WHERE id=?", (sid,))
            if expired:
                await db.commit()

# ── Models ────────────────────────────────────────────────
class ReserveRequest(BaseModel):
    seat_id: str
    urn: str
    student_name: str
    duration_hours: int

class ExitRequest(BaseModel):
    seat_id: str
    urn: str

class BorrowRequest(BaseModel):
    urn: str
    student_name: str
    book_title: str
    author: Optional[str] = None

class ReturnRequest(BaseModel):
    record_id: int

class EntryRequest(BaseModel):
    urn: str
    event: str  # "entry" or "exit"

# ── Seat endpoints ─────────────────────────────────────────
@app.get("/api/seats")
async def get_seats():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT s.id, s.section, s.status,
                   r.urn, r.student_name, r.end_time, r.duration_hours
            FROM seats s
            LEFT JOIN reservations r ON s.id = r.seat_id AND r.active = 1
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]

@app.post("/api/reserve")
async def reserve_seat(req: ReserveRequest):
    if req.duration_hours < 1 or req.duration_hours > 3:
        raise HTTPException(400, "Duration must be 1–3 hours")
    async with aiosqlite.connect(DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT status FROM seats WHERE id=?", (req.seat_id,))
        seat = await cur.fetchone()
        if not seat:
            raise HTTPException(404, "Seat not found")
        if seat["status"] != "vacant":
            raise HTTPException(409, "Seat already occupied")
        # One active reservation per URN
        cur2 = await db.execute(
            "SELECT seat_id FROM reservations WHERE urn=? AND active=1", (req.urn,))
        existing = await cur2.fetchone()
        if existing:
            raise HTTPException(409, f"You already have seat {existing['seat_id']} reserved")
        now = datetime.now()
        end = now + timedelta(hours=req.duration_hours)
        await db.execute(
            "INSERT INTO reservations(seat_id,urn,student_name,start_time,end_time,duration_hours) VALUES(?,?,?,?,?,?)",
            (req.seat_id, req.urn, req.student_name, now.isoformat(), end.isoformat(), req.duration_hours))
        await db.execute("UPDATE seats SET status='occupied' WHERE id=?", (req.seat_id,))
        await db.commit()
        return {"message": "Reserved", "seat_id": req.seat_id, "end_time": end.isoformat()}

@app.post("/api/release")
async def release_seat(req: ExitRequest):
    async with aiosqlite.connect(DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT id, urn FROM reservations WHERE seat_id=? AND active=1", (req.seat_id,))
        res = await cur.fetchone()
        if not res:
            raise HTTPException(404, "No active reservation for this seat")
        if res["urn"].upper() != req.urn.upper():
            raise HTTPException(403, "URN does not match")
        await db.execute("UPDATE reservations SET active=0 WHERE id=?", (res["id"],))
        await db.execute("UPDATE seats SET status='vacant' WHERE id=?", (req.seat_id,))
        await db.commit()
        return {"message": "Seat released"}

@app.get("/api/reservations")
async def get_reservations():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM reservations ORDER BY id DESC LIMIT 100")
        return [dict(r) for r in await cur.fetchall()]

# ── Book endpoints ─────────────────────────────────────────
@app.post("/api/borrow")
async def borrow_book(req: BorrowRequest):
    async with aiosqlite.connect(DB) as db:
        now = datetime.now().isoformat()
        await db.execute(
            "INSERT INTO borrow_records(urn,student_name,book_title,author,borrow_time) VALUES(?,?,?,?,?)",
            (req.urn, req.student_name, req.book_title, req.author, now))
        await db.commit()
        return {"message": "Borrow recorded"}

@app.post("/api/return")
async def return_book(req: ReturnRequest):
    async with aiosqlite.connect(DB) as db:
        now = datetime.now().isoformat()
        cur = await db.execute("SELECT id FROM borrow_records WHERE id=?", (req.record_id,))
        if not await cur.fetchone():
            raise HTTPException(404, "Record not found")
        await db.execute(
            "UPDATE borrow_records SET returned=1, return_time=? WHERE id=?",
            (now, req.record_id))
        await db.commit()
        return {"message": "Book returned"}

@app.get("/api/borrows")
async def get_borrows():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM borrow_records ORDER BY id DESC")
        return [dict(r) for r in await cur.fetchall()]

# ── Entry log ──────────────────────────────────────────────
@app.post("/api/entry")
async def log_entry(req: EntryRequest):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "INSERT INTO entry_log(urn,event,timestamp) VALUES(?,?,?)",
            (req.urn, req.event, datetime.now().isoformat()))
        if req.event == "exit":
            cur = await db.execute(
                "SELECT seat_id FROM reservations WHERE urn=? AND active=1", (req.urn,))
            res = await cur.fetchone()
            if res:
                await db.execute("UPDATE reservations SET active=0 WHERE urn=? AND active=1", (req.urn,))
                await db.execute("UPDATE seats SET status='vacant' WHERE id=?", (res[0],))
        await db.commit()
        return {"message": f"{req.event} logged"}

@app.get("/api/stats")
async def get_stats():
    async with aiosqlite.connect(DB) as db:
        async def scalar(q, *a):
            c = await db.execute(q, a)
            return (await c.fetchone())[0]
        total = await scalar("SELECT COUNT(*) FROM seats")
        occupied = await scalar("SELECT COUNT(*) FROM seats WHERE status='occupied'")
        active_borrows = await scalar("SELECT COUNT(*) FROM borrow_records WHERE returned=0")
        today = datetime.now().date().isoformat()
        today_entries = await scalar(
            "SELECT COUNT(*) FROM entry_log WHERE event='entry' AND timestamp LIKE ?", f"{today}%")
        return {
            "total_seats": total,
            "occupied": occupied,
            "vacant": total - occupied,
            "active_borrows": active_borrows,
            "today_entries": today_entries
        }

# ── Serve frontend ─────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")
