# SmartSeat — Library Seat & Book Management System

A web-based library management system built with FastAPI + SQLite.

## Features
- Real-time seat map (ceiling-view layout)
- Seat reservation with URN + name (no fake presence confirmation)
- Seat release verified by URN (prevents others from freeing your seat)
- Auto-release when timer expires or on exit scan
- Book borrow tracking with return management
- Admin dashboard for all reservations and borrow records
- Live stats (vacant seats, occupied, books borrowed, entries today)

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the server
```bash
uvicorn main:app --reload --port 8000
```

### 3. Open in browser
```
http://localhost:8000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/seats | All seats with reservation info |
| POST | /api/reserve | Reserve a seat |
| POST | /api/release | Release a seat (URN verified) |
| GET | /api/reservations | All reservation history |
| POST | /api/borrow | Log a book borrow |
| POST | /api/return | Mark book as returned |
| GET | /api/borrows | All borrow records |
| POST | /api/entry | Log barcode entry/exit |
| GET | /api/stats | Live stats summary |

## Database Schema

**seats** — seat_id, section, status  
**reservations** — seat_id, urn, student_name, start_time, end_time, active  
**borrow_records** — urn, student_name, book_title, author, borrow_time, return_time, returned  
**entry_log** — urn, event (entry/exit), timestamp  

## Design Decisions
- No sensors or cameras required
- Seat claim only possible if inside library (barcode entry as proof)
- Max reservation: 3 hours
- Exit scan auto-releases active reservation
- URN required to release seat — prevents others from freeing your seat
