"""
Library Operating Hours and Access Rules
Rules:
- Mon to Sat (Male):   08:00 AM to 12:00 AM (Midnight) / 08:00 to 24:00
- Mon to Sat (Female): 08:00 AM to 09:00 PM / 08:00 to 21:00
- Sunday (All):        11:00 AM to 05:00 PM / 11:00 to 17:00
"""

from datetime import datetime, time, date, timedelta, timezone
from typing import Tuple, Optional, Union
import re

IST = timezone(timedelta(hours=5, minutes=30))


def get_library_operating_hours(current_date: date, gender: Optional[str] = None) -> Tuple[time, time, str]:
    weekday = current_date.weekday()
    gender_norm = (gender or "Female").strip().capitalize()

    # Sunday
    if weekday == 6:
        return time(11, 0), time(17, 0), "Sunday (All Students): 11:00 AM - 05:00 PM (11:00 - 17:00)"

    # Monday to Saturday
    if gender_norm == "Male":
        return time(8, 0), time(23, 59, 59), "Mon - Sat (Male): 08:00 AM - 12:00 AM (08:00 - 24:00)"
    else:
        return time(8, 0), time(21, 0), "Mon - Sat (Female): 08:00 AM - 09:00 PM (08:00 - 21:00)"


def parse_datetime_to_ist(dt_or_str: Union[datetime, time, str]) -> datetime:
    """Convert any datetime, ISO timestamp, or 24h/12h time string into an IST datetime."""
    now_ist = datetime.now(IST)

    if isinstance(dt_or_str, datetime):
        if dt_or_str.tzinfo is not None:
            return dt_or_str.astimezone(IST)
        # If naive datetime, in our backend UTC is stored / used for utcnow.
        # Check if dt_or_str is closer to utcnow or ist_now:
        # Default naive datetime to UTC and convert to IST.
        return dt_or_str.replace(tzinfo=timezone.utc).astimezone(IST)

    if isinstance(dt_or_str, time):
        return datetime.combine(now_ist.date(), dt_or_str, tzinfo=IST)

    if isinstance(dt_or_str, str):
        val = dt_or_str.strip()
        # ISO timestamp: 2026-10-07T15:30:00 or with Z/+offset
        if "T" in val or ("-" in val and len(val) >= 10):
            try:
                cleaned = val.replace("Z", "+00:00")
                parsed = datetime.fromisoformat(cleaned)
                if parsed.tzinfo is not None:
                    return parsed.astimezone(IST)
                return parsed.replace(tzinfo=timezone.utc).astimezone(IST)
            except Exception:
                pass

        # 24-hour clock string: "21:00", "08:30", "21:00:00"
        m24 = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", val)
        if m24:
            hh = int(m24.group(1))
            mm = int(m24.group(2))
            ss = int(m24.group(3) or 0)
            if 0 <= hh <= 23 and 0 <= mm <= 59:
                return datetime.combine(now_ist.date(), time(hh, mm, ss), tzinfo=IST)

        # 12-hour clock string: "9:00 PM", "08:00 AM", "12:00 AM"
        m12 = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$", val)
        if m12:
            hh = int(m12.group(1))
            mm = int(m12.group(2))
            ss = int(m12.group(3) or 0)
            ampm = m12.group(4).upper()
            if ampm == "PM" and hh < 12:
                hh += 12
            elif ampm == "AM" and hh == 12:
                hh = 0
            if 0 <= hh <= 23 and 0 <= mm <= 59:
                return datetime.combine(now_ist.date(), time(hh, mm, ss), tzinfo=IST)

    return now_ist


def is_time_within_library_hours(
    check_datetime: Union[datetime, time, str],
    gender: Optional[str] = None
) -> Tuple[bool, str]:
    ist_dt = parse_datetime_to_ist(check_datetime)
    op_start, op_end, schedule_label = get_library_operating_hours(ist_dt.date(), gender)
    check_time = ist_dt.time()

    if op_start <= check_time <= op_end:
        return True, f"Library is Open. ({schedule_label})"

    start_str = f"{op_start.strftime('%I:%M %p')} ({op_start.strftime('%H:%M')})"
    if op_end.hour == 23 and op_end.minute == 59:
        end_str = "12:00 AM (24:00)"
    else:
        end_str = f"{op_end.strftime('%I:%M %p')} ({op_end.strftime('%H:%M')})"

    return False, (
        f"Library is currently closed. Operating hours for today ({schedule_label}) "
        f"are {start_str} to {end_str}."
    )


def get_library_schedule_payload(dt: Union[datetime, str], gender: Optional[str] = None) -> dict:
    """Return the dashboard-friendly schedule shape with full 12-hour and 24-hour details."""
    ist_dt = parse_datetime_to_ist(dt)
    start, end, label = get_library_operating_hours(ist_dt.date(), gender)
    check_time = ist_dt.time()
    is_open = start <= check_time <= end

    open_12 = start.strftime("%I:%M %p")
    close_12 = "12:00 AM" if (end.hour == 23 and end.minute == 59) else end.strftime("%I:%M %p")
    open_24 = start.strftime("%H:%M")
    close_24 = "24:00" if (end.hour == 23 and end.minute == 59) else end.strftime("%H:%M")

    return {
        "libraryHours": label,
        "scheduleRule": label,
        "targetGroup": (gender or "Female").strip().capitalize(),
        "gender": (gender or "Female").strip().capitalize(),
        "isOpen": is_open,
        "isSunday": ist_dt.weekday() == 6,
        "openTime": open_12,
        "closeTime": close_12,
        "openTime24": open_24,
        "closeTime24": close_24,
        "startHour": start.hour,
        "startMinute": start.minute,
        "endHour": 24 if (end.hour == 23 and end.minute == 59) else end.hour,
        "endMinute": 0 if (end.hour == 23 and end.minute == 59) else end.minute,
        "currentHour24": ist_dt.hour,
        "currentMinute": ist_dt.minute,
        "currentTimeIST": ist_dt.strftime("%H:%M:%S"),
        "currentTime12": ist_dt.strftime("%I:%M:%S %p"),
        "currentTimeDisplay": f"{ist_dt.strftime('%I:%M %p')} ({ist_dt.strftime('%H:%M')})"
    }