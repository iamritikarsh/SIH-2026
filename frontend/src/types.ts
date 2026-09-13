export interface Camera {
    id: string;
    name: string;
    location: string;
    lat: number;
    lng: number;
    status: string;
}

export interface Vehicle {
    id: string;
    plate: string;
    type: string;
    color: string;
    status: string;
}

export interface DetectionEvent {
    id: string;
    camera_id: string;
    vehicle_id: string;
    plate: string;
    vehicle_type: string;
    color: string;
    detection_confidence: number;
    anpr_confidence: number;
    match_confidence?: number;
    timestamp: string;
    speed: number;
}

export interface Alert {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: string;
    reference_id?: string;
}

export interface TrajectoryNode {
    camera_id: string;
    timestamp: string;
    speed: number;
}

export interface Trajectory {
    vehicle_id: string;
    path: TrajectoryNode[];
}

export interface SystemState {
    status: string;
    is_simulating: boolean;
    simulation_speed: number;
    simulation_time: string;
    active_vehicles_count: number;
    total_vehicles_detected: number;
}
