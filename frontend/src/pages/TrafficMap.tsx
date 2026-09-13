import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import type { Camera, DetectionEvent, SystemState, Alert, Trajectory } from '../types';
import { Activity, Radio, AlertTriangle, Crosshair, Navigation2, Search, Map } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCamIcon = (color: string) => L.divIcon({
    className: 'custom-cam-marker',
    html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 12px ${color};"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

function TrafficZone({ cam, color, radius = 400, dim = false }: { cam: Camera, color: string, radius?: number, dim?: boolean }) {
    return (
        <Circle
            center={[cam.lat, cam.lng]}
            pathOptions={{ color: color, fillColor: color, fillOpacity: dim ? 0.05 : 0.15, weight: dim ? 1 : 2, className: 'pulse-circle' }}
            radius={radius}
        />
    );
}

export default function TrafficMap() {
    const navigate = useNavigate();
    const location = useLocation();
    const query = new URLSearchParams(location.search).get('q');
    
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [events, setEvents] = useState<DetectionEvent[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [state, setState] = useState<SystemState | null>(null);
    const [filter, setFilter] = useState<'ALL' | 'FREE' | 'MODERATE' | 'HEAVY'>('ALL');
    const [selectedCam, setSelectedCam] = useState<string | null>(null);
    const [trajectory, setTrajectory] = useState<Trajectory | null>(null);

    useEffect(() => {
        api.getCameras().then(setCameras);
    }, []);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [st, evts, alts] = await Promise.all([api.getState(), api.getEvents(), api.getAlerts()]);
                setState(st); setEvents(evts); setAlerts(alts);
                
                if (query) {
                    try {
                        const trj = await api.getTrajectory(query);
                        setTrajectory(trj);
                    } catch (e) { setTrajectory(null); }
                } else {
                    setTrajectory(null);
                }
            } catch (err) {}
        };
        fetchAll();
        const iv = setInterval(fetchAll, 1000);
        return () => clearInterval(iv);
    }, [query]);

    const camStats = useMemo(() => {
        const stats: Record<string, any> = {};
        const sysTime = events.length > 0 ? new Date(events[0].timestamp).getTime() : Date.now();
        
        cameras.forEach(c => {
            const recentForCam = events.filter(e => e.camera_id === c.id && (sysTime - new Date(e.timestamp).getTime()) <= 30000);
            const count = recentForCam.length;
            const avgSpeed = count > 0 ? recentForCam.reduce((acc, curr) => acc + curr.speed, 0) / count : 60;
                
            let status = 'FREE'; let color = '#22c55e';
            if (avgSpeed < 35 || count >= 6) { status = 'HEAVY'; color = '#ef4444'; }
            else if (avgSpeed < 50 || count >= 3) { status = 'MODERATE'; color = '#eab308'; }
            
            stats[c.id] = { id: c.id, name: c.name, lat: c.lat, lng: c.lng, count, avgSpeed, status, color };
        });
        return stats;
    }, [cameras, events]);

    const congestedList = useMemo(() => {
        return Object.values(camStats)
            .filter(c => filter === 'ALL' || c.status === filter)
            .sort((a, b) => a.avgSpeed - b.avgSpeed);
    }, [camStats, filter]);

    const liveFeed = useMemo(() => events.slice(0, 20), [events]);
    
    // Build trajectory path coordinates
    const trajCoords = useMemo(() => {
        if (!trajectory || !trajectory.path) return [];
        return trajectory.path.map(node => {
            const c = cameras.find(cam => cam.id === node.camera_id);
            return c ? [c.lat, c.lng] : null;
        }).filter(Boolean) as [number, number][];
    }, [trajectory, cameras]);

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] -m-6 relative bg-slate-50">
            <div className="absolute top-4 left-4 right-4 z-[400] flex justify-between pointer-events-none">
                <div className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/50 p-3 rounded-lg shadow-2xl pointer-events-auto flex items-center gap-6 text-white min-w-[400px]">
                    <div>
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-blue-400" />
                            <span className="font-bold tracking-widest text-[11px] text-blue-400">CITY TRAFFIC MAP</span>
                        </div>
                        <h2 className="text-lg font-bold mt-1">LIVE CONDITIONS</h2>
                    </div>
                    <div className="flex gap-5 ml-auto">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Status</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[11px] font-bold text-green-400">SYSTEM ONLINE</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Active Nodes</span>
                            <span className="text-[12px] font-bold font-mono">{cameras.length} CAMERAS</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Simulation</span>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${state?.is_simulating ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className={`text-[11px] font-bold ${state?.is_simulating ? 'text-blue-400' : 'text-slate-400'}`}>
                                    {state?.is_simulating ? 'ACTIVE' : 'PAUSED'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full h-full z-0 relative">
                <MapContainer center={[28.6139, 77.2090]} zoom={12} className="w-full h-full" zoomControl={false}>
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {/* Background Road Network Corridors */}
                    {!trajectory && cameras.length > 0 && [
                        ['CAM-01', 'CAM-02'], ['CAM-02', 'CAM-03'], ['CAM-03', 'CAM-04'], 
                        ['CAM-04', 'CAM-05'], ['CAM-05', 'CAM-06'], ['CAM-06', 'CAM-07'],
                        ['CAM-07', 'CAM-08'], ['CAM-08', 'CAM-09'], ['CAM-09', 'CAM-10'],
                        ['CAM-10', 'CAM-11'], ['CAM-11', 'CAM-12'], ['CAM-12', 'CAM-01'],
                        ['CAM-01', 'CAM-06'], ['CAM-03', 'CAM-08']
                    ].map((edge, i) => {
                        const c1 = cameras.find(c => c.id === edge[0]);
                        const c2 = cameras.find(c => c.id === edge[1]);
                        if (!c1 || !c2) return null;
                        
                        const s1 = camStats[c1.id];
                        const s2 = camStats[c2.id];
                        if (!s1 || !s2) return null;
                        
                        let routeColor = '#22c55e'; // Green
                        if (s1.status === 'HEAVY' || s2.status === 'HEAVY') routeColor = '#ef4444';
                        else if (s1.status === 'MODERATE' || s2.status === 'MODERATE') routeColor = '#eab308';
                        
                        if (filter !== 'ALL' && s1.status !== filter && s2.status !== filter) return null;

                        return (
                            <Polyline 
                                key={i}
                                positions={[[c1.lat, c1.lng], [c2.lat, c2.lng]]}
                                pathOptions={{ color: routeColor, weight: 3, opacity: 0.6, lineCap: 'round', className: 'traffic-route-line' }}
                            />
                        );
                    })}

                    {/* Active Trajectory */}
                    {trajectory && trajCoords.length > 1 && (
                        <Polyline 
                            positions={trajCoords}
                            pathOptions={{ color: '#3b82f6', weight: 6, opacity: 0.9, lineCap: 'round', className: 'animate-pulse' }}
                        />
                    )}

                    {Object.values(camStats)
                        .filter(c => filter === 'ALL' || c.status === filter)
                        .map(cam => {
                            const isVisited = trajectory?.path.some(p => p.camera_id === cam.id);
                            const dim = trajectory ? !isVisited : false;
                            const color = trajectory && isVisited ? '#3b82f6' : cam.color;
                            
                            return (
                                <React.Fragment key={cam.id}>
                                    <TrafficZone 
                                        cam={cameras.find(c => c.id === cam.id)!} 
                                        color={color} 
                                        radius={cam.status === 'HEAVY' ? 700 : cam.status === 'MODERATE' ? 500 : 350} 
                                        dim={dim}
                                    />
                                    <Marker position={[cam.lat, cam.lng]} icon={createCamIcon(dim ? '#94a3b8' : color)} eventHandlers={{ click: () => setSelectedCam(cam.id) }}>
                                        <Popup className="custom-traffic-popup" closeButton={false}>
                                            <div className="p-1 min-w-[200px]">
                                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                                                    <Radio size={14} className="text-blue-600" />
                                                    <div>
                                                        <div className="font-mono text-[10px] text-slate-500 font-bold">{cam.id}</div>
                                                        <div className="font-bold text-[14px] text-slate-800 leading-tight">{cam.name}</div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-y-3 mb-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Status</span>
                                                        <span className="text-[11px] font-bold text-green-600">● ONLINE</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Traffic</span>
                                                        <span className="text-[11px] font-bold" style={{color: cam.color}}>{cam.status}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Active Veh.</span>
                                                        <span className="text-[13px] font-bold font-mono text-slate-800">{cam.count}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Avg Speed</span>
                                                        <span className="text-[13px] font-bold font-mono text-slate-800">{cam.avgSpeed.toFixed(0)} <span className="text-[10px]">km/h</span></span>
                                                    </div>
                                                </div>
                                                <button onClick={() => navigate('/cameras')} className="w-full py-2 bg-slate-900 hover:bg-black text-white text-[11px] font-bold tracking-wider rounded transition-colors shadow mb-2">
                                                    VIEW CAMERA
                                                </button>
                                                {trajectory && isVisited && (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => navigate(`/tracking?q=${query}`)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold tracking-wider rounded transition-colors shadow">
                                                            TRACK
                                                        </button>
                                                        <button onClick={() => navigate(`/replay?vehicle=${query}`)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold tracking-wider rounded transition-colors shadow">
                                                            REPLAY
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    </Marker>
                                </React.Fragment>
                            );
                    })}
                </MapContainer>
            </div>

            {trajectory && (
                <div className="absolute top-24 left-4 z-[400] bg-blue-600/95 backdrop-blur-md p-3 rounded-lg border border-blue-400 shadow-2xl flex flex-col gap-2 pointer-events-auto">
                    <div className="flex items-center gap-2 text-white">
                        <Map size={16} />
                        <span className="text-[11px] font-bold tracking-widest uppercase">Tracking on Map</span>
                    </div>
                    <div className="font-mono text-xl text-white font-bold">{query}</div>
                    <div className="text-[11px] text-blue-100">{trajectory.path.length} camera sightings</div>
                    <button onClick={() => navigate('/traffic-map')} className="mt-2 text-[10px] text-blue-200 hover:text-white uppercase font-bold tracking-wider text-left">
                        ← Clear Search
                    </button>
                </div>
            )}

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-[#0f172a]/95 backdrop-blur-md p-1.5 rounded-full border border-slate-700/50 shadow-2xl flex items-center gap-1">
                <button onClick={() => setFilter('ALL')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors ${filter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>ALL ZONES</button>
                <div className="w-px h-4 bg-slate-700 mx-1" />
                <button onClick={() => setFilter('FREE')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors flex items-center gap-2 ${filter === 'FREE' ? 'bg-slate-800 text-green-400' : 'text-slate-400 hover:text-white'}`}><div className="w-2 h-2 rounded-full bg-green-500"/>FREE FLOW</button>
                <button onClick={() => setFilter('MODERATE')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors flex items-center gap-2 ${filter === 'MODERATE' ? 'bg-slate-800 text-yellow-400' : 'text-slate-400 hover:text-white'}`}><div className="w-2 h-2 rounded-full bg-yellow-500"/>MODERATE</button>
                <button onClick={() => setFilter('HEAVY')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors flex items-center gap-2 ${filter === 'HEAVY' ? 'bg-slate-800 text-red-400' : 'text-slate-400 hover:text-white'}`}><div className="w-2 h-2 rounded-full bg-red-500"/>HEAVY</button>
            </div>

            <div className="absolute top-4 right-4 bottom-24 z-[400] w-[320px] flex flex-col gap-4 pointer-events-none">
                <div className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/50 rounded-lg shadow-2xl flex flex-col pointer-events-auto max-h-[40%] overflow-hidden">
                    <div className="p-3 border-b border-slate-700/50 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-amber-400" />
                        <h3 className="text-[11px] font-bold text-slate-200 tracking-widest uppercase">Most Congested</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2">
                        {congestedList.slice(0,4).map((cam, idx) => (
                            <div key={cam.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors" onClick={() => setSelectedCam(cam.id)}>
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-700">{idx+1}</div>
                                    <div>
                                        <div className="text-[12px] font-bold text-slate-200">{cam.name}</div>
                                        <div className="text-[10px] font-mono text-slate-400">{cam.avgSpeed.toFixed(0)} km/h avg</div>
                                    </div>
                                </div>
                                <div className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border" style={{backgroundColor: `${cam.color}20`, color: cam.color, borderColor: `${cam.color}40`}}>
                                    {cam.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/50 rounded-lg shadow-2xl flex flex-col pointer-events-auto flex-1 overflow-hidden">
                    <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Crosshair size={14} className="text-blue-400" />
                            <h3 className="text-[11px] font-bold text-slate-200 tracking-widest uppercase">Live Traffic Events</h3>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {liveFeed.map(evt => {
                            const cam = cameras.find(c => c.id === evt.camera_id);
                            return (
                                <div key={evt.id} className="p-3 border-b border-slate-700/50 hover:bg-slate-800/80 cursor-pointer transition-colors" onClick={() => navigate(`/traffic-map?q=${evt.plate}`)}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] font-mono text-slate-400">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                                        <span className="text-[9px] font-bold text-blue-400 tracking-wider flex items-center gap-1"><Search size={10} /> TRACK ON MAP</span>
                                    </div>
                                    <div className="text-[11px] text-slate-300">
                                        Vehicle <span className="font-mono text-white bg-slate-800 px-1 rounded">{evt.plate}</span> detected at 
                                        <span className="font-semibold text-white ml-1">{cam?.name || evt.camera_id}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                                            {evt.speed} km/h
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-mono text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                                            {evt.anpr_confidence}% ANPR
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
