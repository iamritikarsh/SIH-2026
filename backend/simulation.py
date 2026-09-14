import asyncio
import time
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

from models import Camera, Vehicle, DetectionEvent, Alert, Trajectory, TrajectoryNode, SystemState, MatchResult

CAMERAS = [
    Camera(id="CAM-01", name="Connaught Place",    location="Central Delhi",  lat=28.6304, lng=77.2177),
    Camera(id="CAM-02", name="ITO",                location="East Delhi",     lat=28.6271, lng=77.2415),
    Camera(id="CAM-03", name="India Gate",          location="Central Delhi",  lat=28.6129, lng=77.2295),
    Camera(id="CAM-04", name="Ring Road",           location="South Delhi",    lat=28.5830, lng=77.2486),
    Camera(id="CAM-05", name="Kashmere Gate",       location="North Delhi",    lat=28.6679, lng=77.2289),
    Camera(id="CAM-06", name="AIIMS Junction",      location="South Delhi",    lat=28.5670, lng=77.2069),
    Camera(id="CAM-07", name="Nehru Place",         location="South Delhi",    lat=28.5477, lng=77.2520),
    Camera(id="CAM-08", name="Dhaula Kuan",         location="West Delhi",     lat=28.5918, lng=77.1670),
    Camera(id="CAM-09", name="Lajpat Nagar",        location="South Delhi",    lat=28.5700, lng=77.2440),
    Camera(id="CAM-10", name="Rajouri Garden",      location="West Delhi",     lat=28.6480, lng=77.1218),
    Camera(id="CAM-11", name="Saket Metro",         location="South Delhi",    lat=28.5244, lng=77.2085),
    Camera(id="CAM-12", name="Akshardham Bridge",   location="East Delhi",     lat=28.6127, lng=77.2773),
]

# Generate additional cameras to reach 10000 total live cameras across Delhi NCR & UP/HR
_zones = [
    'Delhi (Central)', 'Delhi (South)', 'Delhi (North)', 'Delhi (East)', 'Delhi (West)', 
    'Noida (UP)', 'Greater Noida', 'Gurugram (HR)', 'Faridabad (HR)', 'Agra (UP)', 'Ghaziabad (UP)'
]

_real_places = [
    'Connaught Place Inner Circle', 'Rajiv Chowk', 'India Gate Hexagon', 'ITO Junction', 
    'Kashmere Gate ISBT', 'AIIMS Flyover', 'Nehru Place Ring Road', 'Dhaula Kuan Interchange',
    'Lajpat Nagar Central Market', 'Rajouri Garden Metro', 'Saket District Centre',
    'Akshardham Flyover', 'Vasant Kunj Nelson Mandela Marg', 'Hauz Khas Village',
    'Chandni Chowk Red Fort', 'Karol Bagh Pusa Road', 'Okhla Phase 1', 'Janakpuri District Centre',
    'Sector 18 Noida', 'Noida City Centre', 'Yamuna Expressway Toll', 'Noida Expressway Mahamaya',
    'Knowledge Park Greater Noida', 'Pari Chowk', 'Sector 62 Noida IT Park',
    'Cyber Hub Gurugram', 'IFFCO Chowk', 'MG Road Metro Station', 'Rajiv Chowk Gurugram',
    'Golf Course Road', 'Sohna Road Intersection', 'Ambience Mall NH8',
    'Badarpur Border', 'Bata Chowk Faridabad', 'NIT Faridabad', 'Surajkund Road',
    'Taj Mahal East Gate', 'Sikandra Crossing Agra', 'Agra Fort Bypass', 'Fatehabad Road',
    'Indirapuram Habitat Centre', 'Kaushambi Metro', 'Raj Nagar Extension', 'Mohan Nagar Junction'
]

for i in range(13, 10001):
    # Expanded bounds for Agra (27.17) to Delhi
    _lat = round(random.uniform(27.00, 28.88), 4)
    # Expanded bounds for Agra (78.00)
    _lng = round(random.uniform(76.84, 78.05), 4)
    
    _place = random.choice(_real_places)
    _suffix = random.choice(['Junction', 'Signal', 'Flyover', 'Underpass', 'Toll', 'Exit', 'Entry', 'Crossroad', 'Main Road'])
    
    # Mix exact known places with slightly randomized generic realistic names
    if random.random() > 0.3:
        name = f"{_place} - CCTV-{random.randint(1, 9)}"
    else:
        name = f"{random.choice(['NH-8', 'Ring Road', 'Expressway', 'State Highway', 'Main Street'])} {_suffix} CCTV-{random.randint(10, 99)}"

    CAMERAS.append(Camera(
        id=f"CAM-{i}",
        name=name,
        location=random.choice(_zones),
        lat=_lat, lng=_lng
    ))

# Predefined routes with approximate time offsets (in seconds) between points
ROUTES = {
    # Speeding vehicle route
    "V-7433": [
        {"cam": "CAM-736", "offset": 0},
        {"cam": "CAM-983", "offset": 5},
        {"cam": "CAM-1024", "offset": 10},
    ],
    # Wanted vehicle route
    "V-7672": [
        {"cam": "CAM-054", "offset": 0},
        {"cam": "CAM-902", "offset": 20},
        {"cam": "CAM-334", "offset": 45},
        {"cam": "CAM-812", "offset": 70},
    ],
    # Suspicious loitering vehicle
    "V-4468": [
        {"cam": "CAM-560", "offset": 0},
        {"cam": "CAM-926", "offset": 30},
        {"cam": "CAM-111", "offset": 60},
        {"cam": "CAM-560", "offset": 90}, 
    ],
    # VIP Convoy (multiple vehicles, same route)
    "V-6004": [{"cam": "CAM-559", "offset": 0}, {"cam": "CAM-908", "offset": 15}, {"cam": "CAM-772", "offset": 30}],
    "V-6005": [{"cam": "CAM-559", "offset": 1}, {"cam": "CAM-908", "offset": 16}, {"cam": "CAM-772", "offset": 31}],
}

# Generate 20000 background vehicles so random traffic across 10000 cameras doesn't cause teleportation
_types = ["Sedan", "SUV", "Hatchback", "Truck", "Motorcycle", "Van", "Bus"]
_colors = ["White", "Black", "Silver", "Grey", "Red", "Blue", "Yellow", "Green"]
_states = ["DL", "HR", "UP", "CH", "PB", "RJ"]

VEHICLES = [
    Vehicle(id="V-101", plate="DL01AB1234", type="Sedan",      color="White"),
    Vehicle(id="V-102", plate="DL03CD4567", type="SUV",        color="Black"),
    Vehicle(id="V-103", plate="HR26EF7890", type="Hatchback",  color="Red"),
    Vehicle(id="V-104", plate="DL08GH2468", type="Sedan",      color="Blue"),
    Vehicle(id="V-105", plate="DL05JK1357", type="SUV",        color="Silver"),
    Vehicle(id="V-106", plate="UP16MN8901", type="Truck",      color="Yellow"),
    Vehicle(id="V-107", plate="DL10XY5678", type="Hatchback",  color="White"),
    Vehicle(id="V-108", plate="HR29KL3456", type="Sedan",      color="Black"),
    Vehicle(id="V-109", plate="DL04QW1234", type="Motorcycle", color="Red"),
    Vehicle(id="V-110", plate="DL07RS9012", type="SUV",        color="Blue"),
    Vehicle(id="V-111", plate="UP32TU3456", type="Sedan",      color="Silver"),
    Vehicle(id="V-112", plate="HR55VW7890", type="Hatchback",  color="White"),
]

# Predefined routes with approximate time offsets (in seconds) between points

# Generate 10000 background vehicles so random traffic across 1000 cameras doesn't cause teleportation
_types = ["Sedan", "SUV", "Hatchback", "Truck", "Motorcycle", "Van", "Bus"]
_colors = ["White", "Black", "Silver", "Grey", "Red", "Blue", "Yellow", "Green"]
_states = ["DL", "HR", "UP", "CH", "PB", "RJ"]

for i in range(113, 10113):
    _plate = f"{random.choice(_states)}{random.randint(10,99)}{random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}{random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}{random.randint(1000,9999)}"
    VEHICLES.append(Vehicle(
        id=f"V-{i}",
        plate=_plate,
        type=random.choice(_types),
        color=random.choice(_colors)
    ))

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
    ],
    "V-106": [
        {"cam": "CAM-08", "offset": 10},
        {"cam": "CAM-10", "offset": 55},
        {"cam": "CAM-01", "offset": 100},
    ],
    "V-107": [
        {"cam": "CAM-12", "offset": 8},
        {"cam": "CAM-02", "offset": 45},
        {"cam": "CAM-09", "offset": 90},
        {"cam": "CAM-07", "offset": 135},
    ],
    "V-108": [
        {"cam": "CAM-11", "offset": 12},
        {"cam": "CAM-06", "offset": 50},
        {"cam": "CAM-09", "offset": 95},
    ],
    "V-109": [
        {"cam": "CAM-10", "offset": 20},
        {"cam": "CAM-08", "offset": 60},
        {"cam": "CAM-03", "offset": 110},
    ],
    "V-110": [
        {"cam": "CAM-07", "offset": 15},
        {"cam": "CAM-11", "offset": 55},
        {"cam": "CAM-06", "offset": 100},
        {"cam": "CAM-04", "offset": 150},
    ],
    "V-111": [
        {"cam": "CAM-05", "offset": 25},
        {"cam": "CAM-01", "offset": 65},
        {"cam": "CAM-08", "offset": 115},
        {"cam": "CAM-10", "offset": 160},
    ],
    "V-112": [
        {"cam": "CAM-03", "offset": 18},
        {"cam": "CAM-12", "offset": 55},
        {"cam": "CAM-02", "offset": 90},
    ],
}


class TrafficSimulator:
    def __init__(self):
        self.is_simulating = False
        self.simulation_speed = 1.0
        self.start_real_time = 0
        self.start_sim_time = datetime.now(timezone.utc)
        self.current_sim_time = self.start_sim_time
        
        self.events: List[DetectionEvent] = []
        self.alerts: List[Alert] = []
        self.trajectories: Dict[str, Trajectory] = {}
        self.scheduled_detections = []
        self.total_detected_count = 0
        
        self.reset()
        
    def reset(self):
        self.is_simulating = True
        now = datetime.now().timestamp()
        self.start_real_time = now
        self.last_tick_time = now
        
        self.events = []
        self.alerts = []
        self.total_detected_count = 0
        self.trajectories = {v.id: Trajectory(vehicle_id=v.id, path=[]) for v in VEHICLES}
        self.start_sim_time = datetime.now(timezone.utc)
        self.current_sim_time = self.start_sim_time
        
        # State for continuous route progression
        self.route_states = {}
        for v_id, route in ROUTES.items():
            if len(route) > 0:
                self.route_states[v_id] = {
                    "node_idx": 0,
                    "next_time": self.start_sim_time + timedelta(seconds=route[0]["offset"])
                }
                
        # State for background random traffic per camera
        self.cam_next_random = {
            cam.id: self.start_sim_time + timedelta(seconds=random.uniform(2, 8))
            for cam in CAMERAS
        }
        
        # Inject an initial snapshot so no camera is empty at load
        free_vehicles = [v for v in VEHICLES if v.id not in ROUTES]
        for cam in CAMERAS:
            num_vehicles = random.randint(1, 3)
            sampled = random.sample(free_vehicles, min(num_vehicles, len(free_vehicles)))
            for v in sampled:
                # Spread timestamps slightly backwards so they look like they just happened
                ts = self.start_sim_time - timedelta(seconds=random.uniform(0, 4))
                self._trigger_detection(v.id, cam.id, ts)
        
    def start(self):
        if not self.is_simulating:
            self.is_simulating = True
            now = datetime.now().timestamp()
            self.start_real_time = now
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
        
        self._process_continuous_traffic()
        
    def _process_continuous_traffic(self):
        # 1. Progress predefined routes (Demo vehicles)
        for v_id, state in list(self.route_states.items()):
            if state["next_time"] <= self.current_sim_time:
                route = ROUTES[v_id]
                idx = state["node_idx"]
                cam_id = route[idx]["cam"]
                
                self._trigger_detection(v_id, cam_id, state["next_time"])
                
                # Advance to next node in route
                if idx + 1 < len(route):
                    next_offset = route[idx + 1]["offset"] - route[idx]["offset"]
                    self.route_states[v_id] = {
                        "node_idx": idx + 1,
                        "next_time": state["next_time"] + timedelta(seconds=next_offset)
                    }
                else:
                    # Loop route after a delay
                    self.route_states[v_id] = {
                        "node_idx": 0,
                        "next_time": state["next_time"] + timedelta(seconds=random.uniform(60, 120))
                    }
                    # Clear trajectory so it draws fresh
                    self.trajectories[v_id].path = []
                    
        # 2. Continuous background traffic for ALL cameras so they are never "0 detections" for long
        # Precompute free vehicles once to save CPU during massive camera ticks
        if not hasattr(self, '_free_vehicles'):
            self._free_vehicles = [v for v in VEHICLES if v.id not in ROUTES]
            if not self._free_vehicles:
                self._free_vehicles = VEHICLES
                
        for cam_id, next_time in list(self.cam_next_random.items()):
            if next_time <= self.current_sim_time:
                v = random.choice(self._free_vehicles)
                self._trigger_detection(v.id, cam_id, next_time)
                
                # Schedule next random vehicle for this camera (dense traffic = short delay)
                # Vary delay to create "waves" of traffic
                delay = random.uniform(2.0, 12.0)
                self.cam_next_random[cam_id] = next_time + timedelta(seconds=delay)
            
    def _trigger_detection(self, v_id: str, cam_id: str, ts: datetime):
        if not hasattr(self, '_vehicle_dict'):
            self._vehicle_dict = {v.id: v for v in VEHICLES}
        v = self._vehicle_dict.get(v_id)
        if not v:
            return
            
        speed = random.uniform(35.0, 75.0)
        
        match_conf = None
        traj = self.trajectories.get(v_id)
        if traj and len(traj.path) > 0 and traj.path[-1].camera_id != cam_id:
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
        self.events.insert(0, event)
        self.total_detected_count += 1
        if len(self.events) > 800:
            self.events = self.events[:800]
            
        if traj:
            traj.path.append(TrajectoryNode(camera_id=cam_id, timestamp=ts.isoformat(), speed=speed))
            
        if speed > 70:
            self.alerts.insert(0, Alert(
                id=f"al-{uuid.uuid4().hex[:8]}",
                type="HIGH_SPEED",
                title="HIGH SPEED DETECTED",
                message=f"Vehicle {v.plate} traveling at {round(speed)} km/h",
                timestamp=ts.isoformat(),
                reference_id=v_id
            ))
            
        if match_conf and match_conf > 90:
            if random.random() < 0.4:
                from_cam = traj.path[-2].camera_id if len(traj.path) > 1 else "Unknown"
                self.alerts.insert(0, Alert(
                    id=f"al-{uuid.uuid4().hex[:8]}",
                    type="VEHICLE_MATCHED",
                    title="VEHICLE MATCHED",
                    message=f"{v.plate} {from_cam} → {cam_id} ({match_conf}% match)",
                    timestamp=ts.isoformat(),
                    reference_id=v_id
                ))

    def _generate_random_alerts(self):
        # Calculate congestion based on recent events (last 100)
        now_ts = self.current_sim_time.timestamp()
        
        if random.random() < 0.05 * self.simulation_speed: 
            if len(self.events) > 0:
                # Pick a camera that we know is currently active
                active_cam_id = random.choice(self.events[:100]).camera_id
                if not hasattr(self, '_camera_dict'):
                    self._camera_dict = {c.id: c for c in CAMERAS}
                cam = self._camera_dict.get(active_cam_id)
                if cam:
                    recent_cam_events = [e for e in self.events[:400] if e.camera_id == cam.id]
                    if len(recent_cam_events) > 2:
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
            
        if len(self.alerts) > 500:
            self.alerts = self.alerts[:500]
            
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
            self.total_detected_count += 1
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
            total_vehicles_detected=self.total_detected_count
        )

simulator = TrafficSimulator()
