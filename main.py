from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import sqlite3
import datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SmartSeat", version="2.0.0")

DB_PATH = "smartseat.db"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN")

# Database 

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # better concurrency
    return conn

def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS seats (
            id            TEXT PRIMARY KEY,
            status        TEXT DEFAULT 'vacant',
            student_name  TEXT,
            urn           INTEGER,
            reserved_until TIMESTAMP
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS borrows (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            urn          INTEGER NOT NULL,
            student_name TEXT    NOT NULL,
            book_title   TEXT    NOT NULL,
            author       TEXT,
            borrow_time  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            returned     BOOLEAN   DEFAULT 0,
            return_time  TIMESTAMP
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS entries (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            urn        INTEGER NOT NULL,
            entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Seed seats if empty
    cur.execute("SELECT COUNT(*) FROM seats")
    if cur.fetchone()[0] == 0:
        seats = [f"T{i}" for i in range(1, 13)]
        for table in ['A', 'B']:
            for row in range(1, 7):
                seats += [f"{table}{row}L", f"{table}{row}R"]
        cur.executemany(
            "INSERT INTO seats (id, status) VALUES (?, 'vacant')", 
            [(s,) for s in seats]
        )

    conn.commit()
    conn.close()

# Helpers 

def _expire_seats(cur):
    """Auto-vacate seats whose reservation time has passed."""
    now = datetime.datetime.now().isoformat()
    cur.execute("""
        UPDATE seats
        SET status='vacant', student_name=NULL, urn=NULL, reserved_until=NULL
        WHERE status='occupied' AND reserved_until < ?
    """, (now,))

# Request Models 

class ReserveRequest(BaseModel):
    seat_id: str
    urn: int
    student_name: str
    duration_hours: int = 2

class ReleaseRequest(BaseModel):
    seat_id: str
    urn: int

class BorrowRequest(BaseModel):
    urn: int
    student_name: str
    book_title: str
    author: Optional[str] = None

class ReturnRequest(BaseModel):
    record_id: int
class AdminLoginRequest(BaseModel):
    password: str

# API Endpoints

@app.get("/api/seats")
async def get_seats():
    conn = get_conn()
    cur = conn.cursor()
    _expire_seats(cur)
    conn.commit()

    cur.execute("SELECT * FROM seats ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    return [
        {
            "id":           r["id"],
            "status":       r["status"],
            "student_name": r["student_name"],
            "urn":          r["urn"],
            "end_time":     r["reserved_until"],
        }
        for r in rows
    ]


@app.post("/api/reserve")
async def reserve_seat(req: ReserveRequest):
    # Validate inputs
    if not req.seat_id or not req.student_name.strip():
        raise HTTPException(400, "seat_id and student_name are required")
    if req.urn <= 0:
        raise HTTPException(400, "URN must be a positive integer")

    duration = max(1, min(req.duration_hours, 3))   # clamp 1–3 hrs

    conn = get_conn()
    cur = conn.cursor()
    _expire_seats(cur)

    # Check seat exists and is vacant
    cur.execute("SELECT status FROM seats WHERE id=?", (req.seat_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, f"Seat '{req.seat_id}' does not exist")
    if row["status"] != "vacant":
        conn.close()
        raise HTTPException(400, "Seat is not available right now")

    # One active reservation per student
    cur.execute("""
        SELECT id FROM seats
        WHERE urn=? AND status='occupied' AND reserved_until > ?
    """, (req.urn, datetime.datetime.now().isoformat()))
    if cur.fetchone():
        conn.close()
        raise HTTPException(400, "You already have an active seat reservation")

    # Log entry
    cur.execute("INSERT INTO entries (urn) VALUES (?)", (req.urn,))

    # Reserve
    end_time = datetime.datetime.now() + datetime.timedelta(hours=duration)
    cur.execute("""
        UPDATE seats
        SET status='occupied', student_name=?, urn=?, reserved_until=?
        WHERE id=?
    """, (req.student_name.strip(), req.urn, end_time.isoformat(), req.seat_id))

    conn.commit()
    conn.close()
    return {"message": "Seat reserved successfully", "reserved_until": end_time.isoformat()}


@app.post("/api/release")
async def release_seat(req: ReleaseRequest):
    if req.urn <= 0:
        raise HTTPException(400, "URN must be a positive integer")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT urn, status FROM seats WHERE id=?", (req.seat_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(404, f"Seat '{req.seat_id}' does not exist")
    if row["status"] != "occupied":
        conn.close()
        raise HTTPException(400, "Seat is not currently reserved")
    if row["urn"] != req.urn:
        conn.close()
        raise HTTPException(403, "URN does not match — you can only release your own seat")

    cur.execute("""
        UPDATE seats
        SET status='vacant', student_name=NULL, urn=NULL, reserved_until=NULL
        WHERE id=?
    """, (req.seat_id,))
    conn.commit()
    conn.close()
    return {"message": "Seat released successfully"}


@app.get("/api/stats")
async def get_stats():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM seats WHERE status='vacant'")
    vacant = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM seats WHERE status='occupied'")
    occupied = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM borrows WHERE returned=0")
    active_borrows = cur.fetchone()[0]
    today = datetime.date.today().isoformat()
    cur.execute("SELECT COUNT(*) FROM entries WHERE date(entry_time)=?", (today,))
    today_entries = cur.fetchone()[0]

    conn.close()
    return {
        "vacant":        vacant,
        "occupied":      occupied,
        "active_borrows": active_borrows,
        "today_entries": today_entries,
    }


@app.get("/api/reservations")
async def get_reservations():
    conn = get_conn()
    cur = conn.cursor()
    _expire_seats(cur)
    conn.commit()

    cur.execute("""
        SELECT id AS seat_id, student_name, urn, reserved_until AS end_time
        FROM seats
        WHERE status='occupied'
        ORDER BY reserved_until
    """)
    rows = cur.fetchall()
    conn.close()

    now = datetime.datetime.now()
    return [
        {
            "seat_id":      r["seat_id"],
            "urn":          r["urn"],
            "student_name": r["student_name"],
            "end_time":     r["end_time"],
            "active":       datetime.datetime.fromisoformat(r["end_time"]) > now
                            if r["end_time"] else False,
        }
        for r in rows
    ]


@app.get("/api/borrows")
async def get_borrows():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM borrows ORDER BY borrow_time DESC")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/borrow")
async def borrow_book(req: BorrowRequest):
    if req.urn <= 0:
        raise HTTPException(400, "URN must be a positive integer")
    if not req.student_name.strip():
        raise HTTPException(400, "student_name is required")
    if not req.book_title.strip():
        raise HTTPException(400, "book_title is required")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO borrows (urn, student_name, book_title, author)
        VALUES (?, ?, ?, ?)
    """, (req.urn, req.student_name.strip(), req.book_title.strip(), req.author))
    conn.commit()
    conn.close()
    return {"message": "Book borrowed successfully"}


@app.post("/api/return")
async def return_book(req: ReturnRequest):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE borrows
        SET returned=1, return_time=CURRENT_TIMESTAMP
        WHERE id=? AND returned=0
    """, (req.record_id,))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(400, "Record not found or already returned")
    conn.commit()
    conn.close()
    return {"message": "Book returned successfully"}


@app.post("/api/entry")
async def log_entry(data: dict):
    urn = data.get("urn")
    if not urn:
        raise HTTPException(400, "urn is required")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO entries (urn) VALUES (?)", (urn,))
    conn.commit()
    conn.close()
    return {"message": "Entry logged"}


# Admin Endpoints 
@app.post("/api/admin/clear-expired")
async def clear_expired_reservations(request: Request):
    _require_admin(request)
    conn = get_conn()
    cur = conn.cursor()
    _expire_seats(cur)
    cleared = cur.rowcount
    conn.commit()
    conn.close()
    return {"message": f"Cleared {cleared} expired seat reservations"}


@app.post("/api/admin/reset-demo")
async def reset_demo_data(request: Request):
    _require_admin(request)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM borrows")
    cur.execute("DELETE FROM entries")
    cur.execute("""
        UPDATE seats
        SET status='vacant', student_name=NULL, urn=NULL, reserved_until=NULL
    """)
    conn.commit()
    conn.close()
    return {"message": "All data reset successfully"}
@app.post("/api/admin/clear-returned")
async def clear_returned_books(request: Request):
    _require_admin(request)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM borrows WHERE returned=1")
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return {"message": f"Cleared {deleted} returned book records"}
@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid admin credentials")
    return {"token": ADMIN_TOKEN}


#Static files & root 

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.on_event("startup")
async def startup_event():
    init_db()

def _require_admin(request: Request):
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401, "Admin authorization required")
    token = auth.split(" ", 1)[1]
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Invalid admin token")
