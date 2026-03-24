# SmartSeat — Library Seat & Book Management System

A comprehensive web-based library management system built with **FastAPI + SQLite** that helps students find available seats and manage book borrowing efficiently. The system integrates seat reservation with entry/exit tracking to prevent misuse.

## 🎯 Problem Statement

In traditional college libraries, students waste valuable time walking around searching for empty seats, especially during peak hours. While entry/exit is logged via barcode scanners, there's no visibility into seat availability. This system solves that by providing a real-time seat map that shows exactly which seats are free, when they'll be available, and allows students to reserve seats right after entering the library.

## ✨ Features

### Seat Management
- **Real-time seat map** with ceiling-view layout (36 seats total)
  - 12 individual desks (T1-T12)
  - 24 table seats (A1L-A6R, B1L-B6R) arranged around study tables
- **Seat states**: Vacant (green), Occupied (red), Your Seat (blue)
- **Reservation system** with URN and name verification
- **Auto-expiry** after 1-3 hours (configurable)
- **Release verification** requiring URN to prevent others from freeing your seat
- **Entry/exit integration** — exit scan automatically releases your seat

### Book Management
- **Borrow tracking** with book title, author, student details
- **Quick return** functionality
- **Complete borrow history** with filterable views
- **Search** by URN or book title

### Admin Dashboard
- **Complete overview** of all active reservations
- **Full borrow history** with filters (All/Active/Returned)
- **Quick book return** section
- **Data management tools**:
  - Clear returned books history (keeps only active borrows)
  - Clear expired seat reservations
  - Export all data to CSV
  - Reset demo data for testing

### Live Statistics
- Vacant seats count
- Occupied seats count  
- Currently borrowed books
- Today's entries

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip package manager

### 1. Clone the Repository
```bash
git clone https://github.com/KiShuKyu/SmartSeat.git
cd smartseat
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Server
```bash
uvicorn main:app --reload --port 8000
```

### 4. Open in Browser
```
http://localhost:8000
```

## 📁 Project Structure

```
smartseat/
├── main.py                 # FastAPI backend with all endpoints
├── requirements.txt        # Python dependencies
├── smartseat.db           # SQLite database (auto-created)
├── static/
│   ├── index.html         # Main HTML structure
│   ├── css/
│   │   └── style.css      # All styling and animations
│   └── js/
│       ├── api.js         # API communication utilities
│       ├── seats.js       # Seat map, reservation, release logic
│       ├── books.js       # Book borrow/return functionality
│       ├── admin.js       # Admin dashboard and data management
│       └── app.js         # Tab switching and polling
└── README.md              # This file
```

## 🗄️ API Endpoints

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/api/seats` | Get all seats with current status | - |
| POST | `/api/reserve` | Reserve a seat | `{seat_id, urn, student_name, duration_hours}` |
| POST | `/api/release` | Release a seat (URN verified) | `{seat_id, urn}` |
| GET | `/api/reservations` | Get active seat reservations | - |
| GET | `/api/stats` | Get live statistics | - |
| POST | `/api/borrow` | Log a book borrow | `{urn, student_name, book_title, author}` |
| POST | `/api/return` | Mark book as returned | `{record_id}` |
| GET | `/api/borrows` | Get all borrow records | - |
| POST | `/api/entry` | Log library entry (mock) | `{urn}` |
| POST | `/api/admin/clear-returned` | Clear returned books history | - |
| POST | `/api/admin/clear-expired` | Clear expired reservations | - |
| POST | `/api/admin/reset-demo` | Reset all demo data | - |

## 🗃️ Database Schema

### seats
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Seat identifier (T1, A1L, etc.) |
| status | TEXT | vacant / occupied / mine |
| student_name | TEXT | Name of student occupying seat |
| urn | INTEGER | Student's university roll number |
| reserved_until | TIMESTAMP | When reservation expires |

### borrows
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-incrementing ID |
| urn | INTEGER | Student's university roll number |
| student_name | TEXT | Student's full name |
| book_title | TEXT | Title of the borrowed book |
| author | TEXT | Book author (optional) |
| borrow_time | TIMESTAMP | When book was borrowed |
| returned | BOOLEAN | Whether book has been returned |
| return_time | TIMESTAMP | When book was returned |

### entries
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-incrementing ID |
| urn | INTEGER | Student's university roll number |
| entry_time | TIMESTAMP | When student entered the library |

## 🎨 Design Philosophy

The system follows a pragmatic approach that avoids complex sensors or surveillance:

1. **No fake confirmation buttons** — Students reserve seats immediately after entry
2. **Entry scan as proof of presence** — Only students who scanned in can reserve seats
3. **Exit scan auto-releases** — Leaving the library frees up the seat
4. **URN verification for release** — Prevents others from removing your reservation
5. **Time-based auto-release** — Max duration prevents indefinite holding

This design relies on existing infrastructure (entry logs) and simple policy rules rather than expensive hardware.

## 📊 Usage Guide

### For Students

1. **Enter the library** — Scan your barcode at the entrance (mocked in this version)
2. **Open the seat map** — See all 36 seats with availability
3. **Tap a vacant seat** (black/green) — Enter your URN and name
4. **Select study duration** — 1, 2, or 3 hours
5. **Confirm reservation** — Seat turns red and timer starts
6. **To release early** — Tap your blue seat and enter URN
7. **Borrow books** — Go to Book Borrow tab, enter details

### For Librarians (Admin)

1. **View active reservations** — See who's sitting where and when they'll leave
2. **Quick book return** — Search by URN or title and return books
3. **View complete history** — Filter by all/active/returned records
4. **Export data** — Download CSV of all borrow records
5. **Maintain database** — Clear returned history or expired reservations
6. **Reset for testing** — Use demo reset to start fresh


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Inspired by real-world library management challenges
- Built with FastAPI and SQLite for simplicity and performance
- UI/UX designed for college students' needs


## Author

**Krishna Dhiman** - First year CS student.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/krishna-dhiman-3669a0300/)

---