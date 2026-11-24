import uuid
from decimal import Decimal
from sqlalchemy import select
from .models import Seat, User, GeofenceSetting
from .utils.password_handler import hash_password
from .utils.geofence import DEFAULT_LIBRARY_LAT, DEFAULT_LIBRARY_LON, DEFAULT_RADIUS_METERS


def seed_seats(db):
    """
    Seed initial seats inventory and default geofence settings.
    """
    # 1. Seed Seats if empty
    existing = db.execute(select(Seat.id).limit(1)).first()
    if not existing:
        seats = []

        # Ground floor: 9 Departments (16 seats each: 8 rows x 2 cols A & B) = 144 seats
        ground_depts = [
            (9, "REL", "Religious Section"),
            (8, "COMP2", "Computer/IT Engineering"),
            (7, "COMP1", "Computer/IT Engineering"),
            (6, "SCI", "Pure Science"),
            (5, "ELEC", "Electrical Engineering"),
            (4, "ENTC2", "Electronics and Telecommunications Engineering"),
            (3, "ENTC1", "Electronics and Telecommunications Engineering"),
            (2, "MECH", "Mechanical Engineering"),
            (1, "MBA", "Master of Business Administration")
        ]
        for num, code_prefix, name in ground_depts:
            for r in range(1, 8):
                for pos in ("A", "B"):
                    seats.append(Seat(
                        id=uuid.uuid4(),
                        seat_code=f"G-{code_prefix}-{pos}{r}",
                        floor="GROUND",
                        section=name,
                        area=pos,
                        row_number=r,
                        is_active=True
                    ))

        # First floor: 8 Departments (6 seats each) + 4 Side Sections (8, 12, 12, 4) = 84 seats
        first_floor_depts = [
            ("COMP", "Computer & IT"),
            ("ET", "Electronics & Tele"),
            ("ENTC", "Electronic & Telecommunications"),
            ("ELEC", "Electrical Engineering"),
            ("MECH", "Mechanical Engineering"),
            ("MBA", "Master of Business Administration"),
            ("SCI", "Pure Science"),
            ("NTJ", "Non Technical Journal")
        ]
        for code_prefix, name in first_floor_depts:
            for r in range(1, 4):
                for pos in ("A", "B"):
                    seats.append(Seat(
                        id=uuid.uuid4(),
                        seat_code=f"F-{code_prefix}-{pos}{r}",
                        floor="FIRST",
                        section=name,
                        area=pos,
                        row_number=r,
                        is_active=True
                    ))

        # Side sections
        # IEEE Back Volume Section (16 seats: 8 rows x 2 cols A & B)
        for r in range(1, 9):
            for pos in ("A", "B"):
                seats.append(Seat(
                    id=uuid.uuid4(),
                    seat_code=f"F-IEEE-{pos}{r}",
                    floor="FIRST",
                    section="IEEE Back Volume Section",
                    area=pos,
                    row_number=r,
                    is_active=True
                ))

        # Career Awareness Section (12 seats: 6 x 2)
        for r in range(1, 7):
            for pos in ("A", "B"):
                seats.append(Seat(
                    id=uuid.uuid4(),
                    seat_code=f"F-CAS-{pos}{r}",
                    floor="FIRST",
                    section="Career Awareness Section",
                    area=pos,
                    row_number=r,
                    is_active=True
                ))

        # PhD Cell (4 seats: 2 x 2)
        for r in range(1, 3):
            for pos in ("A", "B"):
                seats.append(Seat(
                    id=uuid.uuid4(),
                    seat_code=f"F-PHD-{pos}{r}",
                    floor="FIRST",
                    section="PhD Cell",
                    area=pos,
                    row_number=r,
                    is_active=True
                ))

        db.add_all(seats)
        db.commit()

    # 2. Seed Geofence Settings if empty
    geo_exists = db.execute(select(GeofenceSetting.id).limit(1)).first()
    if not geo_exists:
        default_geo = GeofenceSetting(
            id=uuid.uuid4(),
            library_name="Main Library",
            latitude=Decimal(str(DEFAULT_LIBRARY_LAT)),
            longitude=Decimal(str(DEFAULT_LIBRARY_LON)),
            radius_meters=Decimal(str(DEFAULT_RADIUS_METERS)),
            is_active=True
        )
        db.add(default_geo)
        db.commit()



from sqlalchemy import select
from .models import Seat, User, Book
from .utils.password_handler import hash_password


def seed_seats(db):
    """Create the seat inventory that matches the seat map the frontend
    renders (5x5 grid x 2 seats = 50 on Ground, 5 tables x 3 rows x 2
    seats = 30 on First), only if the table is empty."""

    existing = db.execute(select(Seat.id).limit(1)).first()
    if not existing:
        seats = []

        # Ground floor: 5 rows x 5 columns x (A, B) = 50 seats
        for row in range(1, 6):
            for col in range(1, 6):
                for pos in ("A", "B"):
                    seats.append(Seat(
                        seat_code=f"G-R{row}-C{col}-{pos}",
                        floor="GROUND",
                        section=f"C{col}",
                        area=pos,
                        row_number=row,
                        is_active=True
                    ))

        # First floor: 5 tables x 3 rows x (L, R) = 30 seats
        for row in range(1, 4):
            for table in range(1, 6):
                for pos in ("L", "R"):
                    seats.append(Seat(
                        seat_code=f"F-T{table}-R{row}-{pos}",
                        floor="FIRST",
                        section=f"T{table}",
                        area=pos,
                        row_number=row,
                        is_active=True
                    ))

        db.add_all(seats)
        db.commit()

    # Seed Default Admin and Demo Student if users table is empty
    user_exists = db.execute(select(User.id).limit(1)).first()
    if not user_exists:
        default_pwd = hash_password("Ssgmce@1234")
        admin_user = User(
            username="admin",
            email="admin@cetguru.com",
            roll_number="ADMIN001",
            password=default_pwd,
            full_name="Library Admin",
            role="admin"
        )
        demo_student = User(
            username="2024CSE001",
            email="student@cetguru.com",
            roll_number="2024CSE001",
            password=default_pwd,
            full_name="Rahul Patil",
            class_name="B.Tech CSE",
            academic_year="2024-2025",
            contact_number="9876543210",
            role="student"
        )
        db.add_all([admin_user, demo_student])
        db.commit()

    # Seed Default Books if books table is empty
    book_exists = db.execute(select(Book.id).limit(1)).first()
    if not book_exists:
        default_books = [
            Book(
                id="ACC-1001",
                title="Atomic Habits",
                author="James Clear",
                isbn="9780735211292",
                accession_number="ACC-1001",
                class_number="158.1 CLE",
                price=499.0,
                publisher="Avery",
                category="Self Help",
                language="English",
                pub_year="2018",
                total_copies=5,
                available_copies=4,
                shelf="Rack B-4",
                rack="Shelf 2",
                description="An easy & proven way to build good habits & break bad ones."
            ),
            Book(
                id="ACC-1002",
                title="Sapiens: A Brief History of Humankind",
                author="Yuval Noah Harari",
                isbn="9780062316097",
                accession_number="ACC-1002",
                class_number="909 HAR",
                price=599.0,
                publisher="Harper",
                category="History",
                language="English",
                pub_year="2014",
                total_copies=3,
                available_copies=2,
                shelf="Rack H-1",
                rack="Shelf 3",
                description="How Homo sapiens conquered the planet through shared myths, money, and religion."
            ),
            Book(
                id="ACC-1003",
                title="Ikigai: The Japanese Secret to a Long and Happy Life",
                author="Héctor García",
                isbn="9780143130727",
                accession_number="ACC-1003",
                class_number="128 GAR",
                price=350.0,
                publisher="Penguin Life",
                category="Philosophy",
                language="English",
                pub_year="2016",
                total_copies=6,
                available_copies=5,
                shelf="Rack P-2",
                rack="Shelf 1",
                description="Discover your reason for being and the Japanese secrets to daily purpose and mindfulness."
            ),
            Book(
                id="ACC-1004",
                title="Project Hail Mary",
                author="Andy Weir",
                isbn="9780593135204",
                accession_number="ACC-1004",
                class_number="813.6 WEI",
                price=650.0,
                publisher="Ballantine Books",
                category="Science Fiction",
                language="English",
                pub_year="2021",
                total_copies=4,
                available_copies=4,
                shelf="Rack S-1",
                rack="Shelf 4",
                description="A lone survivor on a desperate space mission to save Earth from a solar extinction event."
            ),
            Book(
                id="ACC-1005",
                title="Deep Work: Rules for Focused Success",
                author="Cal Newport",
                isbn="9781455586691",
                accession_number="ACC-1005",
                class_number="650.1 NEW",
                price=450.0,
                publisher="Grand Central Publishing",
                category="Productivity",
                language="English",
                pub_year="2016",
                total_copies=3,
                available_copies=2,
                shelf="Rack C-3",
                rack="Shelf 1",
                description="Rules for focused success in a distracted world."
            )
        ]
        db.add_all(default_books)
        db.commit()

