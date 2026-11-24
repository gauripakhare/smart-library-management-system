import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from openai import OpenAI

from ..utils.email_handler import send_html_email

logger = logging.getLogger(__name__)

# Initialize OpenAI client with key from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
_openai_client = None

def get_openai_client() -> Optional[OpenAI]:
    global _openai_client
    if _openai_client is None and OPENAI_API_KEY and OPENAI_API_KEY.startswith("sk-"):
        try:
            _openai_client = OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            logger.warning(f"[email_agent] Could not initialize OpenAI client: {e}")
            _openai_client = None
    return _openai_client


# =========================================================================
# AI EMAIL DRAFTER: OVERDUE BOOK & FINE
# =========================================================================

def draft_overdue_book_email_ai(
    student_name: str,
    book_title: str,
    days_overdue: int,
    fine_amount: float,
    due_date_str: str
) -> Dict[str, str]:
    """
    Intelligent, personalized context-aware overdue message generator.
    Calibrates tone based on how many days overdue the book is.
    Generates rich, fully populated notification copy without latency.
    """
    name = (student_name or "Student").strip()
    book = (book_title or "Library Book").strip()
    fine = float(fine_amount) if fine_amount is not None else float(days_overdue * 25)
    days = max(1, int(days_overdue))
    due_date = due_date_str or "the scheduled date"

    if days <= 3:
        ai_body = (
            f"This is a friendly reminder from the Smart Library team. Our records show that your borrowed copy of "
            f"'{book}' was due on {due_date} and is currently {days} day(s) overdue. "
            f"As per library circulation policy, an overdue fine of ₹25 per day has been charged (current total: ₹{fine:.0f}). "
            f"Other students and faculty members may have placed holds on this title, so we kindly request you to return it as soon as possible."
        )
        action_guidance = "Please return the book to the library circulation desk today to prevent further daily fines."
    else:
        ai_body = (
            f"This is an urgent and formal notice from the Smart Library administration regarding your borrowed book '{book}', "
            f"which was due on {due_date}. The book is now {days} days overdue, and an accumulated fine of ₹{fine:.0f} "
            f"has been charged to your student library account (calculated at ₹25 per day overdue). "
            f"Failure to return the book promptly may lead to temporary suspension of your library borrowing privileges and campus clearance."
        )
        action_guidance = "Please visit the library circulation desk immediately to return the physical book and clear your pending dues."

    return {
        "subject": f"⚠️ Overdue Notice: '{book}' (₹{fine:.0f} Fine) [Ref: #{datetime.now().strftime('%H%M%S')}]",
        "greeting": f"Dear {name},",
        "ai_body": ai_body,
        "action_guidance": action_guidance
    }


def send_overdue_book_email(
    recipient_email: str,
    student_name: str,
    book_title: str,
    days_overdue: int,
    fine_amount: float,
    due_date_str: str
) -> bool:
    """
    Generates rich content and dispatches a high-contrast styled HTML email for an overdue book.
    Ensures complete information visibility across all email clients and devices.
    """
    name = (student_name or "Student").strip()
    book = (book_title or "Library Book").strip()
    days = max(1, int(days_overdue))
    fine = float(fine_amount) if fine_amount is not None else float(days * 25)
    due_date = due_date_str or "Scheduled Date"

    content = draft_overdue_book_email_ai(
        student_name=name,
        book_title=book,
        days_overdue=days,
        fine_amount=fine,
        due_date_str=due_date
    )

    html_email = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{content['subject']}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid #CBD5E1; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
    
    <!-- Top Header Banner -->
    <div style="background: #DC2626; padding: 24px 20px; text-align: center; color: #FFFFFF;">
      <div style="font-size: 30px; margin-bottom: 4px;">📚 ⚠️</div>
      <h1 style="margin: 0; font-size: 21px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px;">Overdue Book & Fine Notice</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #FEE2E2;">Smart Library Automated Notification System</p>
    </div>

    <!-- Main Content Area -->
    <div style="padding: 24px 22px; background-color: #FFFFFF;">
      <p style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;">{content['greeting']}</p>
      
      <p style="font-size: 14px; line-height: 1.65; color: #1E293B; margin: 0 0 18px 0;">
        {content['ai_body']}
      </p>

      <!-- Structured Information Box -->
      <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 5px solid #DC2626; border-radius: 8px; padding: 16px 18px; margin: 18px 0;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.5px;">Book Issue & Fine Details</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748B; width: 42%; font-weight: 600;">Student Name:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0F172A;">{name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-weight: 600;">Book Title:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0F172A;">{book}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-weight: 600;">Original Due Date:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0F172A;">{due_date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-weight: 600;">Days Overdue:</td>
            <td style="padding: 6px 0; font-weight: 800; color: #DC2626;">{days} day(s)</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-weight: 600;">Daily Fine Rate:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #475569;">₹25 / day</td>
          </tr>
          <tr style="border-top: 1px solid #FCA5A5;">
            <td style="padding: 8px 0 2px 0; font-size: 14px; font-weight: 700; color: #991B1B;">Total Overdue Fine:</td>
            <td style="padding: 8px 0 2px 0; font-size: 18px; font-weight: 900; color: #DC2626;">₹{fine:.0f}</td>
          </tr>
        </table>
      </div>

      <!-- Action Required Guidance Box -->
      <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-left: 5px solid #2563EB; border-radius: 8px; padding: 14px 16px; margin: 18px 0;">
        <p style="margin: 0; font-size: 13px; color: #1E3A8A; line-height: 1.5;">
          <strong>Action Required:</strong> {content['action_guidance']}
        </p>
      </div>

      <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 16px 0 0 0;">
        If you have already returned this book in the last 2 hours, please disregard this notice as database reconciliation may be in progress.
      </p>
    </div>

    <!-- Email Footer -->
    <div style="background-color: #F8FAFC; padding: 16px 20px; border-top: 1px solid #E2E8F0; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #64748B; line-height: 1.4;">
        Smart Library Management System • Automated Circulation Agent<br>
        This is an automated system notification. Please do not reply directly to this email.
      </p>
    </div>

  </div>
</body>
</html>"""

    plain_email = f"""{content['subject']}

{content['greeting']}

{content['ai_body']}

--------------------------------------------------
BOOK ISSUE & FINE DETAILS:
- Student Name: {name}
- Book Title: {book}
- Original Due Date: {due_date}
- Days Overdue: {days} day(s)
- Daily Fine Rate: Rs. 25/day
- Total Overdue Fine: Rs. {fine:.0f}
--------------------------------------------------

ACTION REQUIRED:
{content['action_guidance']}

--
Smart Library Management System - Automated Circulation Agent
"""

    return send_html_email(
        recipient_email=recipient_email,
        subject=content["subject"],
        html_content=html_email,
        plain_content=plain_email
    )


# =========================================================================
# AI EMAIL DRAFTER: SEAT RESERVATION CANCELLED / EXPIRED
# =========================================================================

def draft_seat_cancellation_email_ai(
    student_name: str,
    seat_code: str,
    floor_name: str,
    slot_time: str
) -> Dict[str, str]:
    """
    Uses OpenAI to draft an empathetic yet clear cancellation email
    explaining the 15-minute no-show policy and reassuring the student.
    """
    client = get_openai_client()

    prompt = f"""You are the Smart Library Seat Reservation AI Agent.
Draft a courteous notification email informing a student that their reserved library seat has been automatically released because they did not check in within the 15-minute window.

Details:
- Student Name: {student_name}
- Seat Reserved: {seat_code} ({floor_name})
- Scheduled Slot: {slot_time}
- Rule: 15-minute check-in grace period expired without barcode scan / check-in.
- Purpose: Reassure them that their account is fine, remind them of the policy so other students get seating, and encourage them to book again when ready.

Respond ONLY with a JSON object in this exact format:
{{
  "subject": "Clear subject line with seat code and cancellation alert icon",
  "greeting": "Personalized greeting sentence",
  "ai_body": "2 to 3 concise, polite sentences explaining that the 15-minute window expired, the seat has been freed for others, and how they can easily re-book.",
  "tip": "1 helpful sentence about arriving on time or booking from inside the library"
}}
"""

    if client:
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a university library AI assistant. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.6,
                response_format={"type": "json_object"}
            )
            raw_text = response.choices[0].message.content
            parsed = json.loads(raw_text)
            return {
                "subject": parsed.get("subject", f"Notice: Your Library Seat Reservation ({seat_code}) Has Expired"),
                "greeting": parsed.get("greeting", f"Hello {student_name},"),
                "ai_body": parsed.get("ai_body", f"Your reservation for Seat {seat_code} for the {slot_time} slot has expired because check-in was not recorded within the 15-minute window. To ensure fair access for everyone, the seat has been released for other students."),
                "tip": parsed.get("tip", "You are welcome to book another available seat via the Student Portal whenever you arrive at the library.")
            }
        except Exception as e:
            logger.warning(f"[email_agent] OpenAI seat cancellation draft failed, using fallback: {e}")

    # Fallback template
    return {
        "subject": f"Notice: Your Seat Reservation ({seat_code}) Has Expired",
        "greeting": f"Hello {student_name},",
        "ai_body": (
            f"Your reservation for Seat {seat_code} ({floor_name}) scheduled for {slot_time} has automatically expired. "
            f"Under our library policy, seats are held for exactly 15 minutes after the slot start time. "
            f"Because no check-in was recorded within this window, the seat has been released to allow other students to study."
        ),
        "tip": "No penalty has been applied to your account. Feel free to open the Seat Map in your Student Portal and book any currently open desk."
    }


def send_seat_cancellation_email(
    recipient_email: str,
    student_name: str,
    seat_code: str,
    floor_name: str,
    slot_time: str
) -> bool:
    """
    Generates AI content and dispatches a styled HTML email for an expired seat reservation.
    """
    content = draft_seat_cancellation_email_ai(
        student_name=student_name,
        seat_code=seat_code,
        floor_name=floor_name,
        slot_time=slot_time
    )

    html_email = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{content['subject']}</title>
    </head>
    <body style="margin: 0; padding: 24px; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
      <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); padding: 28px 24px; text-align: center; color: #FFFFFF;">
          <div style="font-size: 32px; margin-bottom: 6px;">🪑⏱️</div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Seat Reservation Expired</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">15-Minute Check-in Window Elapsed</p>
        </div>

        <!-- Body -->
        <div style="padding: 28px 24px;">
          <p style="font-size: 15px; font-weight: 600; color: #0F172A; margin-top: 0;">{content['greeting']}</p>
          
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            {content['ai_body']}
          </p>

          <!-- Details Box -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #64748B; width: 35%;">Released Seat:</td>
                <td style="padding: 4px 0; font-weight: 700; color: #1E3A8A;">Seat {seat_code} ({floor_name})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748B;">Scheduled Slot:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #0F172A;">{slot_time}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748B;">Reason:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #EF4444;">15-Minute No-Show Expiration</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748B;">Seat Status:</td>
                <td style="padding: 4px 0; font-weight: 700; color: #10B981;">Released for Public Booking</td>
              </tr>
            </table>
          </div>

          <!-- Helpful Tip Box -->
          <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5;">
              💡 <strong>Next Steps:</strong> {content['tip']}
            </p>
          </div>

        </div>

        <!-- Footer -->
        <div style="background: #F8FAFC; padding: 16px 24px; border-top: 1px solid #E2E8F0; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #94A3B8;">
            Smart Library Management System • Powered by AI Agent<br>
            Automated notification — no response needed.
          </p>
        </div>

      </div>
    </body>
    </html>
    """

    plain_email = f"""
{content['subject']}

{content['greeting']}

{content['ai_body']}

Seat Details:
- Seat: {seat_code} ({floor_name})
- Scheduled Slot: {slot_time}
- Status: Released (15-minute check-in expired)

Next Step:
{content['tip']}

--
Smart Library Automated Notification Agent
"""

    return send_html_email(
        recipient_email=recipient_email,
        subject=content["subject"],
        html_content=html_email,
        plain_content=plain_email
    )
