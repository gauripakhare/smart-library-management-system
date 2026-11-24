from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Request, Response, Query, HTTPException

from ..services.voice_service import (
    trigger_vobiz_outbound_call,
    generate_vobiz_xml,
    is_vobiz_configured
)

router = APIRouter(prefix="/api/voice", tags=["Voice Calling Agent"])


class TriggerCallSchema(BaseModel):
    phone_number: str
    student_name: Optional[str] = "Student"
    call_type: Optional[str] = "overdue"  # "overdue" or "seat_cancelled"
    book_title: Optional[str] = "Atomic Habits"
    days_overdue: Optional[int] = 3
    fine_amount: Optional[float] = 75.0
    seat_code: Optional[str] = "G-R1-C1-A"
    floor_name: Optional[str] = "Ground Floor"
    slot_time: Optional[str] = "11:00 AM"
    mode: Optional[str] = "live"  # "live" or "simulation"


@router.post("/trigger-call")
def trigger_call(payload: TriggerCallSchema):
    """
    Triggers an outbound Voice Call (Live via Vobiz or Simulation dry-run).
    Dynamically speaks the student's name, book/seat details, and accumulated fine.
    """
    if not payload.phone_number or not payload.phone_number.strip():
        raise HTTPException(status_code=400, detail="Phone number is required.")

    result = trigger_vobiz_outbound_call(
        phone_number=payload.phone_number,
        student_name=payload.student_name or "Student",
        call_type=payload.call_type or "overdue",
        book_title=payload.book_title,
        days_overdue=payload.days_overdue,
        fine_amount=payload.fine_amount,
        seat_code=payload.seat_code,
        floor_name=payload.floor_name,
        slot_time=payload.slot_time,
        mode=payload.mode or "live"
    )
    return result


@router.api_route("/vobiz/answer", methods=["GET", "POST"])
def vobiz_answer_webhook(
    request: Request,
    call_type: Optional[str] = Query("overdue"),
    name: Optional[str] = Query("Student"),
    book: Optional[str] = Query(None),
    days: Optional[int] = Query(3),
    fine: Optional[float] = Query(75.0),
    seat: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    slot: Optional[str] = Query(None)
):
    """
    Webhook endpoint invoked by Vobiz when the recipient answers the phone.
    Returns valid VobizXML with Indian English Text-to-Speech instructions.
    """
    xml_content = generate_vobiz_xml(
        call_type=call_type or "overdue",
        student_name=name or "Student",
        book_title=book,
        days_overdue=days,
        fine_amount=fine,
        seat_code=seat,
        floor_name=floor,
        slot_time=slot
    )
    return Response(content=xml_content, media_type="application/xml")


@router.get("/status")
def get_voice_status():
    """
    Checks whether Vobiz credentials and public webhook URL are configured.
    """
    return {
        "configured": is_vobiz_configured(),
        "provider": "Vobiz Voice CPaaS",
        "supported_call_types": ["overdue", "seat_cancelled"],
        "default_mode": "live" if is_vobiz_configured() else "simulation"
    }
