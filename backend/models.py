from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Camera(BaseModel):
    id: str
    name: str
    location: str
    lat: float
    lng: float
    status: str = "ONLINE"

class Vehicle(BaseModel):
    id: str
    plate: str
    type: str
    color: str
    status: str = "ACTIVE"

class DetectionEvent(BaseModel):
    id: str
    camera_id: str
    vehicle_id: str
    plate: str
    vehicle_type: str
    color: str
    detection_confidence: float
    anpr_confidence: float
    match_confidence: Optional[float] = None
    timestamp: str  # ISO string for frontend compatibility
    speed: float

class MatchResult(BaseModel):
    from_camera: str
    to_camera: str
    confidence: float
    reason: str

class Alert(BaseModel):
    id: str
    type: str
    title: str
    message: str
    timestamp: str
    reference_id: Optional[str] = None # e.g. vehicle ID or camera ID
    status: str = "ACTIVE"

class TrajectoryNode(BaseModel):
    camera_id: str
    timestamp: str
    speed: float

class Trajectory(BaseModel):
    vehicle_id: str
    path: List[TrajectoryNode]

class SystemState(BaseModel):
    status: str
    is_simulating: bool
    simulation_speed: float
    simulation_time: str
    active_vehicles_count: int
    total_vehicles_detected: int
