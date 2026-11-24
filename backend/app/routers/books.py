import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..database import get_db
from ..models import Book
from ..schemas import CreateBookSchema, UpdateBookSchema

router = APIRouter(prefix="/api/admin/books", tags=["Book Management"])
public_router = APIRouter(prefix="/api/books", tags=["Public Books"])
student_books_router = APIRouter(prefix="/api/student/books", tags=["Student Books"])

SAMPLE_BOOKS = [
    {
        "title": "Clean Code",
        "subtitle": "A Handbook of Agile Software Craftsmanship",
        "author": "Robert C. Martin",
        "co_author": "",
        "isbn": "978-0132350884",
        "publisher": "Prentice Hall",
        "category": "Computer Science",
        "language": "English",
        "pub_year": "2008",
        "edition": "1st Edition",
        "total_copies": 10,
        "available_copies": 7,
        "status": "Available",
        "shelf": "A-01-04",
        "rack": "02",
        "pages": "464",
        "dimensions": "17.8 x 2.8 x 23.4 cm",
        "weight": "0.75 kg",
        "cover_url": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%230B1736'/><rect x='10' y='10' width='100' height='140' fill='none' stroke='%233B82F6' stroke-width='2'/><text x='60' y='65' fill='%23FFFFFF' font-size='13' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CLEAN</text><text x='60' y='85' fill='%2360A5FA' font-size='13' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CODE</text><text x='60' y='120' fill='%2394A3B8' font-size='8' text-anchor='middle' font-family='sans-serif'>Robert C. Martin</text></svg>",
        "description": "Even bad code can function. But if code isn't clean, it can bring a development organization to its knees.",
    },
    {
        "title": "Atomic Habits",
        "subtitle": "Tiny Changes, Remarkable Results",
        "author": "James Clear",
        "co_author": "",
        "isbn": "978-0735211292",
        "publisher": "Avery",
        "category": "Self Help",
        "language": "English",
        "pub_year": "2018",
        "edition": "1st Edition",
        "total_copies": 8,
        "available_copies": 5,
        "status": "Available",
        "shelf": "A-05-02",
        "rack": "05",
        "pages": "320",
        "dimensions": "13.5 x 20.5 cm",
        "weight": "0.35 kg",
        "cover_url": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23FFFDF7'/><rect x='8' y='8' width='104' height='144' fill='none' stroke='%23E2E8F0' stroke-width='1'/><circle cx='60' cy='80' r='35' fill='%23FEF3C7' opacity='0.6'/><text x='60' y='65' fill='%23B45309' font-size='12' font-weight='bold' text-anchor='middle' font-family='sans-serif'>ATOMIC</text><text x='60' y='85' fill='%23D97706' font-size='12' font-weight='bold' text-anchor='middle' font-family='sans-serif'>HABITS</text><text x='60' y='125' fill='%2378350F' font-size='8' text-anchor='middle' font-family='sans-serif'>James Clear</text></svg>",
        "description": "A practical guide to building good habits, breaking bad ones, and mastering the tiny behaviors that lead to remarkable results.",
    },
    {
        "title": "The Alchemist",
        "subtitle": "A Fable About Following Your Dream",
        "author": "Paulo Coelho",
        "co_author": "",
        "isbn": "978-0062315007",
        "publisher": "HarperOne",
        "category": "Fiction",
        "language": "English",
        "pub_year": "1988",
        "edition": "25th Anniversary Edition",
        "total_copies": 6,
        "available_copies": 0,
        "status": "Issued",
        "shelf": "B-03-01",
        "rack": "01",
        "pages": "208",
        "dimensions": "13.3 x 1.3 x 20.3 cm",
        "weight": "0.22 kg",
        "cover_url": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23991B1B'/><circle cx='60' cy='70' r='25' fill='%23F59E0B'/><text x='60' y='68' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>THE</text><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>ALCHEMIST</text><text x='60' y='130' fill='%23FDE68A' font-size='8' text-anchor='middle' font-family='sans-serif'>Paulo Coelho</text></svg>",
        "description": "Combining magic, mysticism, wisdom and wonder into an inspiring tale of self-discovery.",
    },
    {
        "title": "Database System Concepts",
        "subtitle": "Comprehensive introduction to database management",
        "author": "Abraham Silberschatz",
        "co_author": "Henry F. Korth",
        "isbn": "978-0078022159",
        "publisher": "McGraw-Hill Education",
        "category": "Computer Science",
        "language": "English",
        "pub_year": "2019",
        "edition": "7th Edition",
        "total_copies": 5,
        "available_copies": 1,
        "status": "Low Stock",
        "shelf": "A-02-05",
        "rack": "03",
        "pages": "1376",
        "dimensions": "20.3 x 4.6 x 25.4 cm",
        "weight": "1.85 kg",
        "cover_url": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%230F172A'/><rect x='15' y='40' width='90' height='60' fill='none' stroke='%2338BDF8' stroke-width='2'/><text x='60' y='65' fill='%2338BDF8' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>DATABASE</text><text x='60' y='80' fill='%23FFFFFF' font-size='9' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CONCEPTS</text><text x='60' y='125' fill='%2394A3B8' font-size='7' text-anchor='middle' font-family='sans-serif'>Silberschatz</text></svg>",
        "description": "Intended for a first course in databases at the junior or senior undergraduate, or first-year graduate level.",
    }
]


def try_parse_uuid(val: str):
    try:
        return uuid.UUID(val)
    except Exception:
        return None


def _find_book_query(db: Session, book_id: str):
    parsed_uuid = try_parse_uuid(book_id)
    filters = [
        Book.isbn == book_id,
        Book.accession_number == book_id
    ]
    if parsed_uuid:
        filters.append(Book.id == parsed_uuid)
    return db.query(Book).filter(or_(*filters))


def _format_book(b: Book) -> dict:
    created_at = getattr(b, "created_at", None)
    created_str = created_at.strftime("%d %b %Y") if created_at else "-"

    updated_at = getattr(b, "updated_at", None) or created_at
    updated_str = updated_at.strftime("%d %b %Y") if updated_at else "-"

    price_val = getattr(b, "price", 0.0)

    return {
        "id": str(b.id),
        "title": getattr(b, "title", None) or "Untitled Book",
        "subtitle": getattr(b, "subtitle", "") or "",
        "author": getattr(b, "author", None) or "Unknown Author",
        "coAuthor": getattr(b, "co_author", "") or "",
        "isbn": getattr(b, "isbn", None) or "-",
        "accessionNumber": getattr(b, "accession_number", None) or "-",
        "classNumber": getattr(b, "class_number", None) or "-",
        "price": float(price_val) if price_val is not None else 0.0,
        "publisher": getattr(b, "publisher", None) or "-",
        "category": getattr(b, "category", None) or "General",
        "language": getattr(b, "language", None) or "English",
        "pubYear": getattr(b, "pub_year", None) or getattr(b, "publication_year", None) or "-",
        "edition": getattr(b, "edition", None) or "-",
        "totalCopies": getattr(b, "total_copies", 1) or 1,
        "availableCopies": getattr(b, "available_copies", 1) or 1,
        "status": getattr(b, "status", None) or ("Available" if getattr(b, "available_copies", 1) > 2 else "Low Stock"),
        "shelf": getattr(b, "shelf", None) or getattr(b, "shelf_location", None) or "-",
        "rack": getattr(b, "rack", None) or "-",
        "pages": getattr(b, "pages", None) or "-",
        "dimensions": getattr(b, "dimensions", None) or "-",
        "weight": getattr(b, "weight", None) or "-",
        "cover": getattr(b, "cover_image_url", None) or "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>",
        "description": getattr(b, "description", None) or "",
        "addedOn": created_str,
        "lastUpdated": updated_str,
        "addedBy": getattr(b, "added_by", None) or "Admin User"
    }


@router.get("")
@router.get("/")
@public_router.get("")
@public_router.get("/")
@student_books_router.get("")
@student_books_router.get("/")
def get_all_books(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Book)
    if q and q.strip():
        search_str = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Book.title.ilike(search_str),
                Book.author.ilike(search_str),
                Book.isbn.ilike(search_str),
                Book.category.ilike(search_str),
                Book.accession_number.ilike(search_str),
                Book.description.ilike(search_str)
            )
        )
    if category and category.strip() and category.lower() != "all":
        query = query.filter(Book.category.ilike(f"%{category.strip()}%"))
    if author and author.strip() and author.lower() != "all":
        query = query.filter(Book.author.ilike(f"%{author.strip()}%"))
    if status and status.strip() and status.lower() != "all":
        if status.lower() == "available":
            query = query.filter(Book.available_copies > 0)
        elif status.lower() in ["out of stock", "issued"]:
            query = query.filter(Book.available_copies == 0)

    books = query.order_by(Book.created_at.desc()).all()
    formatted = [_format_book(b) for b in books]

    all_books = db.query(Book).all()
    all_formatted = [_format_book(b) for b in all_books]
    total_books = len(all_formatted)
    available_cnt = sum(b["availableCopies"] for b in all_formatted)
    issued_cnt = sum(b["totalCopies"] - b["availableCopies"] for b in all_formatted)
    low_stock_cnt = sum(1 for b in all_formatted if b["status"] == "Low Stock" or b["availableCopies"] <= 2)

    categories = [
        c[0]
        for c in db.query(Book.category)
        .filter(Book.category.isnot(None), Book.category != "")
        .distinct()
        .order_by(Book.category.asc())
        .all()
    ]
    authors = [
        a[0]
        for a in db.query(Book.author)
        .filter(Book.author.isnot(None), Book.author != "")
        .distinct()
        .order_by(Book.author.asc())
        .all()
    ]
    languages = [
        l[0]
        for l in db.query(Book.language)
        .filter(Book.language.isnot(None), Book.language != "")
        .distinct()
        .order_by(Book.language.asc())
        .all()
    ]

    return {
        "success": True,
        "books": formatted,
        "categories": categories,
        "authors": authors,
        "languages": languages,
        "stats": {
            "total": total_books,
            "available": available_cnt,
            "issued": issued_cnt,
            "lowStock": low_stock_cnt
        }
    }


@router.get("/{book_id}")
def get_book_by_id(book_id: str, db: Session = Depends(get_db)):
    book = _find_book_query(db, book_id).first()

    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )

    return _format_book(book)


@router.post("")
@router.post("/")
def create_book(payload: CreateBookSchema, db: Session = Depends(get_db)):
    existing = db.query(Book).filter(Book.isbn == payload.isbn.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A book with this ISBN already exists"
        )

    if payload.totalCopies < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Total copies must be at least 1"
        )

    # Calculate initial status and availability
    total = payload.totalCopies if payload.totalCopies > 0 else 1
    avail = total
    book_status = "Available" if avail > 0 else "Out of Stock"
    acc_num = payload.accessionNumber.strip() if payload.accessionNumber else None
    if not acc_num:
        count = db.query(Book).count() + 1001
        acc_num = f"BK-{count:05d}"

    new_book = Book(
        id=uuid.uuid4(),
        title=payload.title.strip(),
        subtitle=payload.subtitle.strip() if payload.subtitle else None,
        author=payload.author.strip(),
        co_author=payload.coAuthor.strip() if payload.coAuthor else None,
        isbn=payload.isbn.strip(),
        accession_number=acc_num,
        class_number=payload.classNumber.strip() if payload.classNumber else None,
        price=Decimal(str(payload.price)) if payload.price is not None else Decimal("0.0"),
        publisher=payload.publisher.strip() if payload.publisher else None,
        category=payload.category,
        language=payload.language or "English",
        pub_year=payload.pubYear,
        edition=payload.edition,
        total_copies=total,
        available_copies=avail,
        status=book_status,
        shelf=payload.shelf,
        shelf_location=payload.shelf,
        rack=payload.rack,
        description=payload.description,
        pages=str(payload.pages) if payload.pages else None,
        dimensions=payload.dimensions,
        weight=payload.weight,
        cover_image_url=payload.cover,
        added_by="Admin User"
    )

    db.add(new_book)
    db.commit()
    db.refresh(new_book)

    return {
        "success": True,
        "message": f"Book '{new_book.title}' added successfully!",
        "book": _format_book(new_book)
    }


@router.put("/{book_id}")
def update_book(book_id: str, payload: UpdateBookSchema, db: Session = Depends(get_db)):
    book = _find_book_query(db, book_id).first()

    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book record not found"
        )

    if payload.isbn is not None:
        duplicate = db.query(Book).filter(
            Book.isbn == payload.isbn.strip(),
            Book.id != book.id
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A book with this ISBN already exists"
            )

    if payload.totalCopies is not None and payload.totalCopies < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Total copies must be at least 1"
        )

    if payload.title is not None:
        book.title = payload.title.strip()
    if payload.subtitle is not None:
        book.subtitle = payload.subtitle.strip()
    if payload.author is not None:
        book.author = payload.author.strip()
    if payload.coAuthor is not None:
        book.co_author = payload.coAuthor.strip()
    if payload.isbn is not None:
        book.isbn = payload.isbn.strip()
    if payload.accessionNumber is not None:
        book.accession_number = payload.accessionNumber.strip() or None
    if payload.classNumber is not None:
        book.class_number = payload.classNumber.strip() or None
    if payload.price is not None:
        book.price = Decimal(str(payload.price)) if payload.price is not None else Decimal("0.0")
    if payload.publisher is not None:
        book.publisher = payload.publisher.strip()
    if payload.category is not None:
        book.category = payload.category
    if payload.language is not None:
        book.language = payload.language
    if payload.pubYear is not None:
        book.pub_year = payload.pubYear
    if payload.edition is not None:
        book.edition = payload.edition

    if payload.totalCopies is not None and payload.totalCopies > 0:
        diff = payload.totalCopies - (book.total_copies or 0)
        book.total_copies = payload.totalCopies
        book.available_copies = max(0, (book.available_copies or 0) + diff)

    if payload.shelf is not None:
        book.shelf = payload.shelf
        book.shelf_location = payload.shelf
    if payload.rack is not None:
        book.rack = payload.rack
    if payload.description is not None:
        book.description = payload.description
    if payload.pages is not None:
        book.pages = str(payload.pages)
    if payload.dimensions is not None:
        book.dimensions = payload.dimensions
    if payload.weight is not None:
        book.weight = payload.weight
    if payload.cover is not None:
        book.cover_url = payload.cover

    # Re-evaluate status
    if (book.available_copies or 0) == 0:
        book.status = "Issued" if ((book.total_copies or 0) > 0) else "Out of Stock"
    elif (book.available_copies or 0) <= 2:
        book.status = "Low Stock"
    else:
        book.status = "Available"

    book.updated_at = datetime.utcnow()

    db.add(book)
    db.commit()
    db.refresh(book)

    return {
        "success": True,
        "message": f"Book '{book.title}' updated successfully!",
        "book": _format_book(book)
    }


@router.delete("/{book_id}")
def delete_book(book_id: str, db: Session = Depends(get_db)):
    book = _find_book_query(db, book_id).first()

    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book record not found"
        )

    title = book.title
    db.delete(book)
    db.commit()

    return {
        "success": True,
        "message": f"Book '{title}' deleted successfully!"
    }


@router.post("/import-csv")
def import_csv_books(books_list: List[CreateBookSchema], db: Session = Depends(get_db)):
    imported_count = 0
    base_count = db.query(Book).count() + 1001
    for payload in books_list:
        total = payload.totalCopies if payload.totalCopies > 0 else 1
        acc_num = payload.accessionNumber.strip() if payload.accessionNumber else f"BK-{(base_count + imported_count):05d}"
        new_book = Book(
            id=uuid.uuid4(),
            title=payload.title.strip(),
            subtitle=payload.subtitle.strip() if payload.subtitle else None,
            author=payload.author.strip(),
            co_author=payload.coAuthor.strip() if payload.coAuthor else None,
            isbn=payload.isbn.strip(),
            accession_number=acc_num,
            class_number=payload.classNumber.strip() if payload.classNumber else None,
            price=Decimal(str(payload.price)) if payload.price is not None else Decimal("0.0"),
            publisher=payload.publisher.strip() if payload.publisher else None,
            category=payload.category or "Computer Science",
            language=payload.language or "English",
            pub_year=payload.pubYear or "2024",
            edition=payload.edition or "1st Edition",
            total_copies=total,
            available_copies=total,
            status="Available",
            shelf=payload.shelf or "A-01-01",
            shelf_location=payload.shelf or "A-01-01",
            rack=payload.rack or "01",
            description=payload.description or "Imported via CSV upload.",
            pages=str(payload.pages) if payload.pages else "300",
            dimensions=payload.dimensions,
            weight=payload.weight,
            cover_image_url=payload.cover,
            added_by="Admin User"
        )
        db.add(new_book)
        imported_count += 1

    db.commit()

    return {
        "success": True,
        "message": f"Successfully imported {imported_count} books into database!",
        "count": imported_count
    }
