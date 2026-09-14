import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const api = {
    getCameras: () => axios.get(`${API_BASE}/cameras`).then(res => res.data),
    getVehicles: () => axios.get(`${API_BASE}/vehicles`).then(res => res.data),
    getEvents: (limit = 800) => axios.get(`${API_BASE}/events?limit=${limit}`).then(res => res.data),
    getAlerts: () => axios.get(`${API_BASE}/alerts`).then(res => res.data),
    resolveAlert: (id: string) => axios.post(`${API_BASE}/alerts/${id}/resolve`).then(res => res.data),
    getTrajectories: () => axios.get(`${API_BASE}/trajectories`).then(res => res.data),
    getTrajectory: (id: string) => axios.get(`${API_BASE}/trajectories/${id}`).then(res => res.data),
    getState: () => axios.get(`${API_BASE}/state`).then(res => res.data),
    
    startSim: () => axios.post(`${API_BASE}/simulation/start`),
    pauseSim: () => axios.post(`${API_BASE}/simulation/pause`),
    resetSim: () => axios.post(`${API_BASE}/simulation/reset`),
    setSpeed: (speed: number) => axios.post(`${API_BASE}/simulation/speed?speed=${speed}`),
    runDemo: () => axios.post(`${API_BASE}/simulation/demo`),
};
