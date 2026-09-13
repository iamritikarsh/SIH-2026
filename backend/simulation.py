import asyncio
import time
import random
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional

from models import Camera, Vehicle, DetectionEvent, Alert, Trajectory, TrajectoryNode, SystemState, MatchResult

CAMERAS = [
    Camera(id="CAM-01", name="Connaught Place", location="Central Delhi", lat=28.6304, lng=77.2177),
    Camera(id="CAM-02", name="ITO", location="East Delhi", lat=28.6271, lng=77.2415),
    Camera(id="CAM-03", name="India Gate", location="Central Delhi", lat=28.6129, lng=77.2295),
    Camera(id="CAM-04", name="Ring Road", location="South Delhi", lat=28.5830, lng=77.2486),
    Camera(id="CAM-05", name="Kashmere Gate", location="North Delhi", lat=28.6679, lng=77.2289),
    Camera(id="CAM-06", name="AIIMS Junction", location="South Delhi", lat=28.5670, lng=77.2069),
]

VEHICLES = [
    Vehicle(id="V-101", plate="DL01AB1234", type="Sedan", color="White"),
    Vehicle(id="V-102", plate="DL03CD4567", type="SUV", color="Black"),
    Vehicle(id="V-103", plate="HR26EF7890", type="Hatchback", color="Red"),
    Vehicle(id="V-104", plate="DL08GH2468", type="Sedan", color="Blue"),
    Vehicle(id="V-105", plate="DL05JK1357", type="SUV", color="Silver"),
    Vehicle(id="V-106", plate="UP16MN8901", type="Truck", color="Yellow"),
    Vehicle(id="V-107", plate="DL10XY5678", type="Hatchback", color="White"),
    Vehicle(id="V-108", plate="HR29KL3456", type="Sedan", color="Black"),
    Vehicle(id="V-109", plate="DL04QW1234", type="Motorcycle", color="Red"),
]

# Predefined routes with approximate time offsets (in seconds) between points
ROUTES = {
    "V-101": [
        {"cam": "CAM-01", "offset": 10},
        {"cam": "CAM-03", "offset": 45},
        {"cam": "CAM-05", "offset": 90},
        {"cam": "CAM-06", "offset": 130},
    ],
    "V-102": [
        {"cam": "CAM-02", "offset": 20},
        {"cam": "CAM-04", "offset": 60},
        {"cam": "CAM-05", "offset": 110},
    ],
    "V-103": [
        {"cam": "CAM-01", "offset": 30},
        {"cam": "CAM-02", "offset": 70},
        {"cam": "CAM-04", "offset": 120},
    ],
    "V-104": [
        {"cam": "CAM-06", "offset": 15},
        {"cam": "CAM-03", "offset": 50},
        {"cam": "CAM-01", "offset": 85},
    ],
    "V-105": [
        {"cam": "CAM-05", "offset": 5},
        {"cam": "CAM-03", "offset": 40},
        {"cam": "CAM-04", "offset": 80},
    ]
}

class TrafficSimulator:
    def __init__(self):
        self.is_simulating = False
        self.simulation_speed = 1.0
        self.start_real_time = 0
        self.start_sim_time = datetime.now()
        self.current_sim_time = self.start_sim_time
        
        self.events: List[DetectionEvent] = []
        self.alerts: List[Alert] = []
        self.trajectories: Dict[str, Trajectory] = {}
        self.scheduled_detections = []
        
        self.reset()
        
    def reset(self):
        self.is_simulating = False
        self.events = []
        self.alerts = []
        self.trajectories = {v.id: Trajectory(vehicle_id=v.id, path=[]) for v in VEHICLES}
        self.start_sim_time = datetime.now()
        self.current_sim_time = self.start_sim_time
        self.schedule_initial_traffic()
        
    def schedule_initial_traffic(self):
        self.scheduled_detections = []
        for v_id, route in ROUTES.items():
            for node in route:
                self.scheduled_detections.append({
                    "vehicle_id": v_id,
                    "camera_id": node["cam"],
                    "trigger_time": self.start_sim_time + timedelta(seconds=node["offset"])
                })
                
        # Add some random traffic
        for _ in range(20):
            v = random.choice(VEHICLES)
            cam = random.choice(CAMERAS).id
            offset = random.randint(10, 300)
            self.scheduled_detections.append({
                "vehicle_id": v.id,
                "camera_id": cam,
                "trigger_time": self.start_sim_time + timedelta(seconds=offset)
            })
            
        self.scheduled_detections.sort(key=lambda x: x["trigger_time"])

    def start(self):
        if not self.is_simulating:
            self.is_simulating = True
            # Adjust start times so we continue from where we left off
            now = datetime.now().timestamp()
            self.start_real_time = now
            # We don't change start_sim_time, but we will calculate current_sim_time based on delta
            self.last_tick_time = now
            
    def pause(self):
        self.is_simulating = False
        
    def set_speed(self, speed: float):
        self.simulation_speed = speed
        
    def tick(self):
        if not self.is_simulating:
            return
            
        now = datetime.now().timestamp()
        delta_real = now - self.last_tick_time
        self.last_tick_time = now
        
        delta_sim = delta_real * self.simulation_speed
        self.current_sim_time += timedelta(seconds=delta_sim)
        
        self._process_scheduled_events()
        self._generate_random_alerts()
        
    def _process_scheduled_events(self):
        while self.scheduled_detections and self.scheduled_detections[0]["trigger_time"] <= self.current_sim_time:
            det = self.scheduled_detections.pop(0)
            self._trigger_detection(det["vehicle_id"], det["camera_id"], det["trigger_time"])
            
    def _trigger_detection(self, v_id: str, cam_id: str, ts: datetime):
        v = next((v for v in VEHICLES if v.id == v_id), None)
        if not v:
            return
            
        speed = random.uniform(30.0, 80.0)
        
        # Calculate match confidence if this vehicle was seen before
        match_conf = None
        traj = self.trajectories.get(v_id)
        if traj and len(traj.path) > 0:
            last_node = traj.path[-1]
            # Simple simulation: high confidence
            match_conf = round(random.uniform(92.0, 99.5), 1)
            
        event = DetectionEvent(
            id=f"evt-{uuid.uuid4().hex[:8]}",
            camera_id=cam_id,
            vehicle_id=v_id,
            plate=v.plate,
            vehicle_type=v.type,
            color=v.color,
            detection_confidence=round(random.uniform(90.0, 99.9), 1),
            anpr_confidence=round(random.uniform(85.0, 99.5), 1),
            match_confidence=match_conf,
            timestamp=ts.isoformat(),
            speed=round(speed, 1)
        )
        self.events.insert(0, event) # newest first
        if len(self.events) > 500:
            self.events = self.events[:500]
            
        if traj:
            traj.path.append(TrajectoryNode(camera_id=cam_id, timestamp=ts.isoformat(), speed=speed))
            
        if speed > 75:
            self.alerts.insert(0, Alert(
                id=f"al-{uuid.uuid4().hex[:8]}",
                type="HIGH_SPEED",
                title="HIGH SPEED DETECTED",
                message=f"Vehicle {v.plate} traveling at {round(speed)} km/h",
                timestamp=ts.isoformat(),
                reference_id=v_id
            ))
            
        if match_conf and match_conf > 90:
            if random.random() < 0.3: # Don't spam, just some of them
                from_cam = traj.path[-1].camera_id if traj and len(traj.path) > 0 else "Unknown"
                self.alerts.insert(0, Alert(
                    id=f"al-{uuid.uuid4().hex[:8]}",
                    type="VEHICLE_MATCHED",
                    title="VEHICLE MATCHED",
                    message=f"{v.plate} {from_cam} → {cam_id} ({match_conf}% match)",
                    timestamp=ts.isoformat(),
                    reference_id=v_id
                ))
                
        # Unusual route detection (skipping cameras in a known sequence or jumping far)
        if traj and len(traj.path) >= 1:
            last_cam = traj.path[-1].camera_id
            # Just a simple heuristic for the simulation
            if last_cam == "CAM-01" and cam_id == "CAM-06" and random.random() < 0.5:
                self.alerts.insert(0, Alert(
                    id=f"al-{uuid.uuid4().hex[:8]}",
                    type="UNUSUAL_ROUTE",
                    title="UNUSUAL ROUTE",
                    message=f"{v.plate} made unexpected transition {last_cam} → {cam_id}",
                    timestamp=ts.isoformat(),
                    reference_id=v_id
                ))

    def _generate_random_alerts(self):
        # Calculate congestion based on recent events (last 100)
        now_ts = self.current_sim_time.timestamp()
        
        if random.random() < 0.05 * self.simulation_speed: 
            cam = random.choice(CAMERAS)
            recent_cam_events = [e for e in self.events[:100] if e.camera_id == cam.id]
            if len(recent_cam_events) > 8:
                avg_speed = sum(e.speed for e in recent_cam_events) / len(recent_cam_events)
                if avg_speed < 40:
                    self.alerts.insert(0, Alert(
                        id=f"al-{uuid.uuid4().hex[:8]}",
                        type="CONGESTION",
                        title="HIGH CONGESTION",
                        message=f"{cam.name} traffic volume increased. Avg speed: {round(avg_speed)} km/h",
                        timestamp=self.current_sim_time.isoformat(),
                        reference_id=cam.id
                    ))
            
        if len(self.alerts) > 100:
            self.alerts = self.alerts[:100]
            
    def run_sih_demo(self):
        """Pre-populates a specific demo sequence for the judges."""
        self.reset()
        base_time = self.start_sim_time
        
        v_id = "V-101"
        route = [
            {"cam": "CAM-01", "offset": 0, "speed": 42},
            {"cam": "CAM-03", "offset": 120, "speed": 46},
            {"cam": "CAM-05", "offset": 300, "speed": 38},
            {"cam": "CAM-06", "offset": 450, "speed": 31},
        ]
        
        for i, node in enumerate(route):
            ts = base_time + timedelta(seconds=node["offset"])
            match_conf = round(random.uniform(94.0, 98.0), 1) if i > 0 else None
            v = VEHICLES[0] # V-101
            
            event = DetectionEvent(
                id=f"evt-demo-{i}",
                camera_id=node["cam"],
                vehicle_id=v.id,
                plate=v.plate,
                vehicle_type=v.type,
                color=v.color,
                detection_confidence=98.5,
                anpr_confidence=97.2,
                match_confidence=match_conf,
                timestamp=ts.isoformat(),
                speed=node["speed"]
            )
            self.events.insert(0, event)
            self.trajectories[v.id].path.append(TrajectoryNode(camera_id=node["cam"], timestamp=ts.isoformat(), speed=node["speed"]))
            
        self.current_sim_time = base_time + timedelta(seconds=500)
        self.is_simulating = False
        
    def get_state(self) -> SystemState:
        active = len([t for t in self.trajectories.values() if len(t.path) > 0])
        return SystemState(
            status="ONLINE",
            is_simulating=self.is_simulating,
            simulation_speed=self.simulation_speed,
            simulation_time=self.current_sim_time.isoformat(),
            active_vehicles_count=active,
            total_vehicles_detected=len(self.events)
        )

simulator = TrafficSimulator()
