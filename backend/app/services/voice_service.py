import os
import json
import logging
import requests
from typing import Dict, Any, Optional
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

# Vobiz Credentials from Environment
VOBIZ_AUTH_ID = os.getenv("VOBIZ_AUTH_ID", "").strip()
VOBIZ_AUTH_TOKEN = os.getenv("VOBIZ_AUTH_TOKEN", "").strip()
VOBIZ_FROM_NUMBER = os.getenv("VOBIZ_FROM_NUMBER", "").strip()
# Public URL (e.g., ngrok tunnel or hosted domain) where Vobiz can fetch answer XML
VOBIZ_PUBLIC_URL = os.getenv("VOBIZ_PUBLIC_URL", "").strip().rstrip("/")


def is_vobiz_configured() -> bool:
    return bool(VOBIZ_AUTH_ID and VOBIZ_AUTH_TOKEN and VOBIZ_FROM_NUMBER)


def build_voice_script(
    call_type: str,
    student_name: str,
    book_title: Optional[str] = None,
    days_overdue: Optional[int] = None,
    fine_amount: Optional[float] = None,
    seat_code: Optional[str] = None,
    floor_name: Optional[str] = None,
    slot_time: Optional[str] = None
) -> str:
    """
    Constructs a crisp, professional, human-friendly Indian English script
    strictly tailored to the specific student and event.
    Designed to complete within 20-25 seconds to minimize telephony costs.
    """
    name = (student_name or "Student").strip()

    if call_type == "seat_cancelled":
        seat = seat_code or "your reserved desk"
        floor = floor_name or "Ground Floor"
        slot = slot_time or "scheduled time"
        return (
            f"Hello {name}. This is an automated update from Smart Library. "
            f"Your reservation for Seat {seat} on {floor} for the {slot} slot has automatically expired and has been cancelled. "
            f"The 15-minute check-in deadline passed without a barcode scan. "
            f"The seat has now been released for other students. "
            f"You may book another available seat from the student portal whenever you arrive at the library. Thank you."
        )
    else:
        # Default: Overdue Book and Fine Notice
        book = book_title or "your borrowed library book"
        days = days_overdue if days_overdue is not None else 3
        fine = f"{int(fine_amount)}" if fine_amount is not None else f"{days * 25}"
        return (
            f"Hello {name}. This is an urgent notification from Smart Library. "
            f"Your borrowed book, {book}, is now {days} days overdue. "
            f"An accumulated fine of {fine} rupees has been charged to your library record at 25 rupees per day. "
            f"Please visit the library circulation counter immediately to return the book and settle your pending dues. Thank you."
        )


def generate_vobiz_xml(
    call_type: str,
    student_name: str,
    book_title: Optional[str] = None,
    days_overdue: Optional[int] = None,
    fine_amount: Optional[float] = None,
    seat_code: Optional[str] = None,
    floor_name: Optional[str] = None,
    slot_time: Optional[str] = None
) -> str:
    """
    Generates standard VobizXML / Plivo-compliant response with Indian English TTS voice.
    """
    script = build_voice_script(
        call_type=call_type,
        student_name=student_name,
        book_title=book_title,
        days_overdue=days_overdue,
        fine_amount=fine_amount,
        seat_code=seat_code,
        floor_name=floor_name,
        slot_time=slot_time
    )

    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">{script}</Speak>
</Response>"""
    return xml_content


def _get_or_create_public_answer_url(xml_content: str, fallback_params: dict) -> str:
    """
    Returns a publicly accessible URL where Vobiz cloud can fetch the answer XML.
    Uses VOBIZ_PUBLIC_URL if defined, otherwise provisions an instant webhook.site endpoint.
    """
    if VOBIZ_PUBLIC_URL:
        return f"{VOBIZ_PUBLIC_URL}/api/voice/vobiz/answer?{urlencode(fallback_params)}"

    try:
        r = requests.post("https://webhook.site/token", timeout=6)
        if r.status_code in (200, 201):
            token_id = r.json().get("uuid")
            if token_id:
                # Set content on this webhook
                requests.put(
                    f"https://webhook.site/token/{token_id}",
                    json={
                        "default_content": xml_content,
                        "default_status": 200,
                        "default_content_type": "application/xml"
                    },
                    timeout=6
                )
                logger.info(f"[voice_service] Auto-provisioned public answer_url: https://webhook.site/{token_id}")
                return f"https://webhook.site/{token_id}"
    except Exception as e:
        logger.warning(f"[voice_service] Failed to auto-provision dynamic webhook: {e}")

    return f"https://webhook.site/e0922092-c39d-4386-89c8-17c211c568af"


def trigger_vobiz_outbound_call(
    phone_number: str,
    student_name: str,
    call_type: str = "overdue",
    book_title: Optional[str] = None,
    days_overdue: Optional[int] = None,
    fine_amount: Optional[float] = None,
    seat_code: Optional[str] = None,
    floor_name: Optional[str] = None,
    slot_time: Optional[str] = None,
    mode: str = "live"
) -> Dict[str, Any]:
    """
    Dispatches a targeted outbound phone call via Vobiz API.
    Supports:
    - 'live': Real phone rings via Vobiz.
    - 'simulation': Completely free safe dry-run that prints script and logs simulated call.
    """
    clean_phone = phone_number.strip().replace(" ", "").replace("-", "")
    if not clean_phone.startswith("+"):
        if len(clean_phone) == 10:
            clean_phone = "+91" + clean_phone
        elif clean_phone.startswith("91") and len(clean_phone) == 12:
            clean_phone = "+" + clean_phone

    script = build_voice_script(
        call_type=call_type,
        student_name=student_name,
        book_title=book_title,
        days_overdue=days_overdue,
        fine_amount=fine_amount,
        seat_code=seat_code,
        floor_name=floor_name,
        slot_time=slot_time
    )

    # 1. SIMULATION / DRY-RUN MODE (Zero credits spent)
    if mode == "simulation" or not is_vobiz_configured():
        reason = "Mode is set to 'simulation'" if mode == "simulation" else "Vobiz credentials not yet configured in .env"
        print("\n========================================================")
        print(f"📞 [VOBIZ VOICE CALL - SIMULATION / DRY RUN]")
        print(f"To: {clean_phone} ({student_name})")
        print(f"Type: {call_type.upper()}")
        print(f"Reason: {reason}")
        print(f"Spoken Voice Script:\n\"{script}\"")
        print(f"Estimated Duration: ~20 seconds (₹0 credits spent)")
        print("========================================================\n")
        return {
            "success": True,
            "status": "simulated",
            "mode": "simulation",
            "phone": clean_phone,
            "student_name": student_name,
            "call_type": call_type,
            "message": f"Simulation call logged successfully for {student_name} ({clean_phone}). Zero credits used.",
            "spoken_script": script
        }

    # 2. LIVE MODE: Actual Vobiz API Outbound Call
    params = {
        "call_type": call_type,
        "name": student_name,
        "book": book_title or "",
        "days": days_overdue or 0,
        "fine": fine_amount or 0.0,
        "seat": seat_code or "",
        "floor": floor_name or "",
        "slot": slot_time or ""
    }

    xml_content = generate_vobiz_xml(
        call_type=call_type,
        student_name=student_name,
        book_title=book_title,
        days_overdue=days_overdue,
        fine_amount=fine_amount,
        seat_code=seat_code,
        floor_name=floor_name,
        slot_time=slot_time
    )

    answer_url = _get_or_create_public_answer_url(xml_content, params)

    api_url = f"https://api.vobiz.ai/api/v1/Account/{VOBIZ_AUTH_ID}/Call/"
    headers = {
        "Content-Type": "application/json",
        "X-Auth-ID": VOBIZ_AUTH_ID,
        "X-Auth-Token": VOBIZ_AUTH_TOKEN
    }
    payload = {
        "from": VOBIZ_FROM_NUMBER,
        "to": clean_phone,
        "answer_url": answer_url,
        "answer_method": "GET"
    }

    try:
        resp = requests.post(api_url, headers=headers, json=payload, timeout=12)
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"text": resp.text}

        if resp.status_code in (200, 201, 202):
            call_uuid = data.get("request_uuid") or data.get("call_uuid") or "live_call_placed"
            logger.info(f"[voice_service] Vobiz outbound call initiated to {clean_phone}: {call_uuid}")
            return {
                "success": True,
                "status": "initiated",
                "mode": "live",
                "call_uuid": call_uuid,
                "phone": clean_phone,
                "student_name": student_name,
                "call_type": call_type,
                "message": f"Live call initiated via Vobiz to {clean_phone}! Phone should ring in 5-10 seconds.",
                "spoken_script": script,
                "vobiz_response": data
            }
        else:
            err = data.get("message") or data.get("error") or str(data)
            logger.error(f"[voice_service] Vobiz API returned error {resp.status_code}: {err}")
            return {
                "success": False,
                "status": "error",
                "mode": "live",
                "status_code": resp.status_code,
                "error": f"Vobiz API Error: {err}",
                "spoken_script": script
            }
    except Exception as e:
        logger.error(f"[voice_service] Failed to call Vobiz API: {e}")
        return {
            "success": False,
            "status": "error",
            "mode": "live",
            "error": str(e),
            "spoken_script": script
        }
