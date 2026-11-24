import uuid
from datetime import datetime
from typing import Optional
from langchain_core.tools import tool
from sqlalchemy.orm import Session

from ..models import Seat, SeatReservation, User
from ..utils.geofence import check_geofence_status
from ..services import reservation_service as svc


def create_library_tools(db: Session, user_id: uuid.UUID):
    """
    Creates LangChain tools bound to the current database session and student.
    """

    @tool
    def get_available_seats_tool(floor: str = "ground", start_time_iso: Optional[str] = None) -> list:
        """
        Find currently available library seats on the requested floor ('ground' or 'first')
        for the given start time.
        """
        parsed_start = None
        if start_time_iso:
            try:
                parsed_start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        seats = svc.get_available_seats(db, floor, parsed_start)
        return [
            {
                "id": str(s.id),
                "seat_code": s.seat_code,
                "floor": s.floor,
                "section": s.section,
                "area": s.area
            }
            for s in seats
        ]

    @tool
    def book_seat_tool(seat_code: str, start_time_iso: Optional[str] = None) -> dict:
        """
        Book a seat for the student. The booking start time MUST be within 30 minutes
        from the current time. Booking duration is 30 minutes.
        No check-in timer starts immediately if booked for the future;
        the 15-minute check-in window opens only when the scheduled start time arrives.
        """
        seat = db.query(Seat).filter(Seat.seat_code == seat_code).first()
        if not seat:
            return {"success": False, "message": f"Seat {seat_code} does not exist."}

        parsed_start = None
        if start_time_iso:
            try:
                parsed_start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        try:
            res = svc.book_seat(db, user_id=user_id, seat_id=seat.id, start_time=parsed_start)
            return {
                "success": True,
                "reservation_id": str(res.id),
                "seat_code": seat.seat_code,
                "start_time": res.start_time.isoformat(),
                "end_time": res.end_time.isoformat(),
                "status": res.status,
                "message": f"Seat {seat.seat_code} reserved successfully! Check-in window will open at {res.start_time.strftime('%I:%M %p')}."
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    @tool
    def verify_geofence_tool(latitude: float, longitude: float) -> dict:
        """
        Validates whether student GPS coordinates are inside the library geofence boundary.
        Returns distance in meters and boundary limit.
        """
        return check_geofence_status(db, latitude, longitude)

    @tool
    def check_in_tool(latitude: float, longitude: float, reservation_id: Optional[str] = None) -> dict:
        """
        Performs library check-in for the student's active booking.
        Validates:
        1. Student must have an active reserved seat.
        2. Student must be physically inside library geofence.
        3. Scheduled booking start time must have arrived and 15-minute window must not be expired.
        Saves check-in to seat_reservations and logs attendance to attendance_logs.
        """
        try:
            res_uuid = uuid.UUID(reservation_id) if reservation_id else None
            res = svc.check_in(db, reservation_id=res_uuid, user_id=user_id, latitude=latitude, longitude=longitude)
            return {
                "success": True,
                "reservation_id": str(res.id),
                "status": res.status,
                "check_in_time": res.check_in_time.isoformat() if res.check_in_time else None,
                "message": "Check-in successful! Attendance marked as PRESENT and seat occupied."
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    @tool
    def check_out_tool(reservation_id: str) -> dict:
        """
        Performs library check-out, updates attendance_logs and frees the seat
        immediately so other students can book it.
        """
        try:
            res_uuid = uuid.UUID(reservation_id)
            res = svc.check_out(db, reservation_id=res_uuid, user_id=user_id)
            return {
                "success": True,
                "reservation_id": str(res.id),
                "message": "Checked out successfully and seat is now available for others."
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    return [
        get_available_seats_tool,
        book_seat_tool,
        verify_geofence_tool,
        check_in_tool,
        check_out_tool
    ]


from langchain.tools import tool


def create_tools(db, user_id):

    @tool
    def get_available_seats(floor: str):
        """
        Find currently available library seats
        on the requested floor.
        """

        from ..services.reservation_service import (
            get_available_seats as service
        )

        seats = service(
            db,
            floor
        )

        return [
            {
                "id": seat.id,
                "seat_code": seat.seat_code,
                "floor": seat.floor,
                "section": seat.section,
                "area": seat.area
            }
            for seat in seats
        ]

    @tool
    def book_seat(seat_id: int):
        """
        Book the requested seat for the authenticated student.
        Booking duration is 30 minutes.
        """

        from ..services.reservation_service import (
            book_seat as service
        )

        reservation = service(
            db,
            user_id,
            seat_id
        )

        return {
            "success": True,
            "reservation_id": reservation.id,
            "seat_id": reservation.seat_id,
            "start_time": reservation.start_time.isoformat(),
            "end_time": reservation.end_time.isoformat()
        }

    return [
        get_available_seats,
        book_seat
    ]