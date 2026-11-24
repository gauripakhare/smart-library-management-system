# What changed / how to run

## 1. Backend setup
```
cd backend
pip install -r requirements.txt
```

## 2. Point it at your Supabase database
Open `backend/.env` and replace `[YOUR-PASSWORD]` in `DATABASE_URL` with your
actual Supabase database password (Project Settings -> Database -> you can
reset it there if you don't have it saved). The project ref is already
filled in for you (`ybtjgwjtcaorltartyyv`).

If the direct connection (`db.ybtjgwjtcaorltartyyv.supabase.co:5432`) times
out on your network, copy the "Transaction pooler" string instead from the
same Supabase page and use that.

Until the password is filled in, the backend automatically falls back to a
local SQLite file (`library.db`) so you can still run and test everything
end to end without Supabase.

## 3. Run the backend
```
uvicorn app.main:app --reload
```
On startup it will print which database it connected to, create the
`seats` / `reservations` tables if they don't exist yet, and seed 50 Ground
Floor + 30 First Floor seats (matching the seat map the frontend renders) —
only if the seats table is currently empty.

API will be live at http://127.0.0.1:8000 (docs at /docs).

## 4. Run the frontend
The frontend is static HTML/JS/CSS — serve `frontend/student/` with any
static file server (e.g. VS Code "Live Server", or `python -m http.server`
from inside that folder) and open `book-seat.html`.

CORS is already open on the backend for local development.

## 5. Try the flow
1. `book-seat.html` — pick a floor and a start time (any time from "now" to
   30 minutes from now, refreshes automatically), pick an available seat.
2. `booking-summary.html` — confirm, which actually creates the reservation.
3. `confirm-booking.html` — see it under "Upcoming" with a live check-in
   countdown badge.
4. `check-in.html` — shows the 15-minute countdown from your chosen start
   time and lets you check in.

## Notes / limitations
- There's no login system in this project yet, so all bookings are made
  under one demo student identity (`backend/app/deps.py`). Swap that out
  once real auth exists — nothing else in the booking flow needs to change.
- Rotate the OpenAI/Supabase secret keys that were in the uploaded `.env` —
  since they were shared in this chat, treat them as no longer private.
