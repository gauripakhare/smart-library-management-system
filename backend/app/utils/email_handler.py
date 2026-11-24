import os
import uuid
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import make_msgid, formatdate

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER") or os.getenv("MAIL_FROM")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD") or os.getenv("MAIL_PASSWORD")
MAIL_FROM = os.getenv("MAIL_FROM") or SMTP_USER or "noreply@cetguru.com"
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Smart Library")


def is_valid_config_val(val: str | None) -> bool:
    if not val:
        return False
    val_str = str(val).strip().lower()
    return val_str not in ["none", "null", "todo", "change_me", "", "your_email@gmail.com"]


EMAIL_CONFIGURED = is_valid_config_val(SMTP_USER) and is_valid_config_val(SMTP_PASSWORD)

if not EMAIL_CONFIGURED:
    logging.warning(
        "[email_handler] Gmail SMTP configuration missing or incomplete in .env (SMTP_USER / SMTP_PASSWORD). "
        "Running in development dummy mode."
    )


def send_html_email(recipient_email: str, subject: str, html_content: str, plain_content: str = "") -> bool:
    """
    Sends a rich multipart HTML email using configured Gmail SMTP.
    Falls back gracefully to development printout if SMTP credentials fail.
    """
    if not recipient_email or not recipient_email.strip():
        logging.warning("[email_handler] No recipient email specified.")
        return False

    recipient_email = recipient_email.strip()

    if not EMAIL_CONFIGURED:
        print(f"\n========================================================")
        print(f"[DEV MODE EMAIL] To: {recipient_email}")
        print(f"Subject: {subject}")
        print(f"Content:\n{plain_content or html_content}")
        print(f"========================================================\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"
        msg["To"] = recipient_email
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="smartlibrary.edu")
        msg["X-Entity-Ref-ID"] = str(uuid.uuid4())

        if plain_content:
            msg.attach(MIMEText(plain_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(MAIL_FROM, [recipient_email], msg.as_string())

        logging.info(f"[email_handler] Email successfully sent to {recipient_email}: {subject}")
        return True
    except Exception as e:
        print(f"\n[DEV MODE FALLBACK] Failed to send email via Gmail SMTP: {str(e)}")
        print(f"[DEV MODE EMAIL] To: {recipient_email} | Subject: {subject}\n")
        logging.error(f"[email_handler] Gmail SMTP failed for {recipient_email}: {str(e)}")
        return False


def send_otp_email(recipient_email: str, otp_code: str):
    subject = "Smart Library - Password Reset OTP Code"
    plain_text = f"""Hello,

Your Smart Library password reset verification code is: {otp_code}

This code is valid for 15 minutes. If you did not request a password reset, please ignore this email.

Regards,
{MAIL_FROM_NAME} Team
"""
    html_text = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1E3A8A; margin-bottom: 8px;">Smart Library System</h2>
        <p style="color: #475569; font-size: 14px;">Password Reset Verification Code</p>
        <div style="margin: 24px 0; padding: 16px; background: #EFF6FF; border-left: 4px solid #2563EB; border-radius: 8px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1D4ED8;">{otp_code}</span>
        </div>
        <p style="color: #64748B; font-size: 13px;">This code is valid for 15 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #F1F5F9; margin: 20px 0;" />
        <p style="color: #94A3B8; font-size: 11px; text-align: center;">&copy; Smart Library Management System</p>
    </div>
    """
    return send_html_email(recipient_email, subject, html_text, plain_text)
