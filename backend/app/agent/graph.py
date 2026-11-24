import uuid
from datetime import datetime, timedelta
from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from ..models import Seat, SeatReservation, AttendanceLog, GeofenceSetting, Notification
from ..utils.geofence import check_geofence_status
from ..services import reservation_service as svc


class ReservationWorkflowState(TypedDict, total=False):
    user_id: str
    action: str  # "get_seats", "book_seat", "verify_geofence", "checkin", "checkout", "get_status"
    seat_code: Optional[str]
    floor: Optional[str]
    start_time: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    reservation_id: Optional[str]
    query: Optional[str]
    is_inside_geofence: bool
    relative_distance_meters: float
    boundary_limit_meters: float
    success: bool
    status_code: int
    message: str
    data: Optional[Dict[str, Any]]


def build_library_workflow(db: Session):
    """
    Constructs a LangGraph state graph for the complete Seat Reservation,
    Geofence Verification, Attendance Check-In, and Check-Out lifecycle.
    """

    def seats_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        floor = state.get("floor") or "ground"
        start_time_iso = state.get("start_time")
        parsed_start = None
        if start_time_iso:
            try:
                parsed_start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        now, _ = svc.get_booking_window()
        matrix = svc.get_seat_matrix(db, floor, parsed_start or now)
        return {
            **state,
            "success": True,
            "status_code": 200,
            "message": f"Retrieved {len(matrix)} seats for {floor} floor.",
            "data": {
                "floor": floor,
                "startTime": (parsed_start or now).isoformat(),
                "seats": matrix
            }
        }

    def booking_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        user_uuid = uuid.UUID(state["user_id"])
        seat_code = state.get("seat_code")
        if not seat_code:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": "Missing seat_code for booking."
            }

        seat = db.query(Seat).filter(Seat.seat_code == seat_code).first()
        if not seat:
            return {
                **state,
                "success": False,
                "status_code": 404,
                "message": f"Seat {seat_code} not found."
            }

        start_time_iso = state.get("start_time")
        parsed_start = None
        if start_time_iso:
            try:
                parsed_start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        try:
            res = svc.book_seat(db, user_id=user_uuid, seat_id=seat.id, start_time=parsed_start)
            serialized = svc.serialize_reservation(db, res)
            return {
                **state,
                "success": True,
                "status_code": 200,
                "reservation_id": str(res.id),
                "message": f"Seat {seat.seat_code} booked successfully! Check-in window opens at scheduled start time.",
                "data": {"reservation": serialized}
            }
        except Exception as e:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": str(e)
            }

    def geofence_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        lat = state.get("latitude")
        lon = state.get("longitude")
        if lat is None or lon is None:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": "Missing latitude and longitude."
            }

        geo_status = check_geofence_status(db, float(lat), float(lon))
        return {
            **state,
            "success": True,
            "status_code": 200,
            "is_inside_geofence": geo_status["inside"],
            "relative_distance_meters": geo_status["relative_distance_meters"],
            "boundary_limit_meters": geo_status["boundary_limit_meters"],
            "message": geo_status["verified_text"],
            "data": geo_status
        }

    def checkin_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        user_uuid = uuid.UUID(state["user_id"])
        lat = state.get("latitude")
        lon = state.get("longitude")
        res_id_str = state.get("reservation_id")
        res_uuid = uuid.UUID(res_id_str) if res_id_str else None

        # Rule: student must have an active booking
        active_res = svc.get_active_reservation(db, user_uuid)
        if not active_res:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": "No active seat reservation found for this student. Seat must be booked first before check-in is permitted."
            }

        target_id = res_uuid or active_res.id

        try:
            res = svc.check_in(
                db,
                reservation_id=target_id,
                user_id=user_uuid,
                latitude=float(lat) if lat is not None else None,
                longitude=float(lon) if lon is not None else None
            )
            serialized = svc.serialize_reservation(db, res)
            return {
                **state,
                "success": True,
                "status_code": 200,
                "reservation_id": str(res.id),
                "message": "Check-in successful! Attendance marked as PRESENT and seat is occupied.",
                "data": {"reservation": serialized}
            }
        except Exception as e:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": str(e)
            }

    def checkout_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        user_uuid = uuid.UUID(state["user_id"])
        res_id_str = state.get("reservation_id")
        if not res_id_str:
            active_res = svc.get_active_reservation(db, user_uuid)
            if not active_res:
                return {
                    **state,
                    "success": False,
                    "status_code": 400,
                    "message": "No active booking found to check out from."
                }
            res_uuid = active_res.id
        else:
            res_uuid = uuid.UUID(res_id_str)

        try:
            res = svc.check_out(db, reservation_id=res_uuid, user_id=user_uuid)
            return {
                **state,
                "success": True,
                "status_code": 200,
                "message": "Checked out successfully and seat is now released and available for other students.",
                "data": {"reservationId": str(res_uuid)}
            }
        except Exception as e:
            return {
                **state,
                "success": False,
                "status_code": 400,
                "message": str(e)
            }

    def status_node(state: ReservationWorkflowState) -> ReservationWorkflowState:
        user_uuid = uuid.UUID(state["user_id"])
        active_res = svc.get_active_reservation(db, user_uuid)
        serialized = svc.serialize_reservation(db, active_res) if active_res else None
        return {
            **state,
            "success": True,
            "status_code": 200,
            "message": "Fetched active reservation status.",
            "data": {"reservation": serialized}
        }

    # Router logic
    def route_action(state: ReservationWorkflowState) -> str:
        act = state.get("action", "").lower()
        if act in ("seats", "get_seats", "seat_matrix"):
            return "seats"
        elif act in ("book", "book_seat", "reserve"):
            return "book"
        elif act in ("geofence", "verify_geofence", "validate_geofence"):
            return "geofence"
        elif act in ("checkin", "check_in"):
            return "checkin"
        elif act in ("checkout", "check_out"):
            return "checkout"
        return "status"

    workflow = StateGraph(ReservationWorkflowState)

    workflow.add_node("seats", seats_node)
    workflow.add_node("book", booking_node)
    workflow.add_node("geofence", geofence_node)
    workflow.add_node("checkin", checkin_node)
    workflow.add_node("checkout", checkout_node)
    workflow.add_node("status", status_node)

    # Entry point conditional routing
    workflow.set_conditional_entry_point(
        route_action,
        {
            "seats": "seats",
            "book": "book",
            "geofence": "geofence",
            "checkin": "checkin",
            "checkout": "checkout",
            "status": "status"
        }
    )

    workflow.add_edge("seats", END)
    workflow.add_edge("book", END)
    workflow.add_edge("geofence", END)
    workflow.add_edge("checkin", END)
    workflow.add_edge("checkout", END)
    workflow.add_edge("status", END)

    return workflow.compile()


def run_agent_workflow(db: Session, initial_state: ReservationWorkflowState) -> ReservationWorkflowState:
    """
    Executes the LangGraph reservation workflow for the given state.
    """
    app = build_library_workflow(db)
    return app.invoke(initial_state)
