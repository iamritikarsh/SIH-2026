from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict
import asyncio
from contextlib import asynccontextmanager

from models import Camera, Vehicle, DetectionEvent, SystemState, Trajectory, Alert
from simulation import simulator, CAMERAS, VEHICLES

async def simulation_loop():
    while True:
        simulator.tick()
        await asyncio.sleep(0.5)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(simulation_loop())
    yield
    # Shutdown
    task.cancel()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "city-traffic-engine",
        "version": "1.0.0"
    }

@app.get("/api/cameras", response_model=List[Camera])
async def get_cameras():
    return CAMERAS

@app.get("/api/vehicles", response_model=List[Vehicle])
async def get_vehicles():
    return VEHICLES

@app.get("/api/events", response_model=List[DetectionEvent])
async def get_events(limit: int = 50):
    return simulator.events[:limit]
    
@app.get("/api/alerts", response_model=List[Alert])
async def get_alerts(limit: int = 20):
    return simulator.alerts[:limit]

@app.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    for alert in simulator.alerts:
        if alert.id == alert_id:
            alert.status = "RESOLVED"
            return {"status": "resolved"}
    return {"status": "not_found"}

@app.get("/api/trajectories", response_model=Dict[str, Trajectory])
async def get_trajectories():
    return simulator.trajectories

@app.get("/api/trajectories/{vehicle_id}", response_model=Trajectory)
async def get_trajectory(vehicle_id: str):
    return simulator.trajectories.get(vehicle_id, Trajectory(vehicle_id=vehicle_id, path=[]))

@app.get("/api/state", response_model=SystemState)
async def get_state():
    return simulator.get_state()

@app.post("/api/simulation/start")
async def start_sim():
    simulator.start()
    return {"status": "started"}

@app.post("/api/simulation/pause")
async def pause_sim():
    simulator.pause()
    return {"status": "paused"}

@app.post("/api/simulation/reset")
async def reset_sim():
    simulator.reset()
    return {"status": "reset"}

@app.post("/api/simulation/speed")
async def set_speed(speed: float = Query(...)):
    simulator.set_speed(speed)
    return {"status": "speed_updated"}

@app.post("/api/simulation/demo")
async def run_demo():
    simulator.run_sih_demo()
    return {"status": "demo_prepared"}
