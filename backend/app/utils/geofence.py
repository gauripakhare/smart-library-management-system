import math
from decimal import Decimal
from sqlalchemy.orm import Session
from ..models import GeofenceSetting

# Earth radius in meters
EARTH_RADIUS_METERS = 6371000.0

DEFAULT_LIBRARY_LAT = 20.7929000
DEFAULT_LIBRARY_LON = 76.6949000
DEFAULT_RADIUS_METERS = 120.00


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points
    on the earth (specified in decimal degrees).
    Returns distance in meters.
    """
    lat1_rad = math.radians(float(lat1))
    lon1_rad = math.radians(float(lon1))
    lat2_rad = math.radians(float(lat2))
    lon2_rad = math.radians(float(lon2))

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_METERS * c


def get_active_geofence(db: Session):
    """
    Retrieve current active geofence setting.
    """
    return db.query(GeofenceSetting).filter(GeofenceSetting.is_active == True).first()


def check_geofence_status(db: Session, user_lat: float, user_lon: float) -> dict:
    """
    Validates if student's coordinates are inside the library geofence boundary.
    Computes exact relative distance in meters.
    """
    setting = get_active_geofence(db)
    if not setting or not setting.is_active or setting.latitude is None or setting.longitude is None:
        return {
            "inside": False,
            "configured": False,
            "relative_distance_meters": 0.0,
            "boundary_limit_meters": 0.0,
            "library_name": "Main Library",
            "library_lat": None,
            "library_lon": None,
            "user_lat": float(user_lat),
            "user_lon": float(user_lon),
            "status_text": "GEOFENCE UNSET",
            "verified_text": "Library geofence location is currently unset by administrator. Please ask admin to set location."
        }

    center_lat = float(setting.latitude)
    center_lon = float(setting.longitude)
    radius = float(setting.radius_meters)

    distance = haversine_distance(center_lat, center_lon, user_lat, user_lon)
    is_inside = distance <= radius

    return {
        "inside": is_inside,
        "configured": True,
        "relative_distance_meters": round(distance, 1),
        "boundary_limit_meters": round(radius, 1),
        "library_name": setting.library_name or "Main Library",
        "library_lat": center_lat,
        "library_lon": center_lon,
        "user_lat": float(user_lat),
        "user_lon": float(user_lon),
        "status_text": "INSIDE LIBRARY GEOFENCE" if is_inside else "OUTSIDE LIBRARY GEOFENCE",
        "verified_text": (
            f"HQ GEOFENCE VERIFIED. You are {round(distance, 1)}m away (inside allowed {int(radius)}m radius). You can submit check-in."
            if is_inside else
            f"You are currently {round(distance, 1)}m away from the library (Allowed boundary: {int(radius)}m). Please move inside the library radius to check in."
        )
    }
