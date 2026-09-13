import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import type { Camera, DetectionEvent, SystemState, Alert } from '../types';
import { Play, Pause, FastForward, RotateCcw, Search, Clock, MapPin, CheckCircle, Car } from 'lucide-react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const vehicleIcon = L.divIcon({
    className: 'custom-vehicle-marker',
    html: `<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 15px #3b82f6;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;">🚗</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const createCamIcon = (active: boolean) => L.divIcon({
    className: 'custom-cam-marker',
    html: `<div style="width:14px;height:14px;background:${active ? '#3b82f6' : '#94a3b8'};border:2px solid white;border-radius:50%;box-shadow:0 0 10px ${active ? '#3b82f6' : 'transparent'};"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

// Helper: Haversine distance in km
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

export default function VehicleJourneyReplay() {
    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search).get('vehicle') || '';
    
    const [searchInput, setSearchInput] = useState(query);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [allEvents, setAllEvents] = useState<DetectionEvent[]>([]);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0); // 0 to 1
    const [speed, setSpeed] = useState(1);
    const [hasFinished, setHasFinished] = useState(false);
    
    const markerRef = useRef<L.Marker>(null);
    const mapRef = useRef<L.Map>(null);
    const rafRef = useRef<number>();
    const lastTimeRef = useRef<number>();

    useEffect(() => {
        api.getCameras().then(setCameras);
        api.getEvents().then(setAllEvents);
    }, []);

    // Load Journey
    const journey = useMemo(() => {
        if (!query || allEvents.length === 0 || cameras.length === 0) return null;
        
        // Filter and sort oldest to newest
        const vehicleEvents = allEvents
            .filter(e => e.plate === query || e.vehicle_id === query)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
        if (vehicleEvents.length === 0) return { error: 'VEHICLE NOT FOUND', msg: 'No replay data is available for this vehicle.' };
        
        // Collapse consecutive same-camera events
        const collapsed: DetectionEvent[] = [];
        for (const ev of vehicleEvents) {
            if (collapsed.length === 0) { collapsed.push(ev); continue; }
            if (collapsed[collapsed.length - 1].camera_id !== ev.camera_id) {
                collapsed.push(ev);
            }
        }
        
        if (collapsed.length < 2) return { error: 'JOURNEY TOO SHORT', msg: 'This vehicle has only one camera detection.', events: collapsed };
        
        // Calculate metrics
        const first = collapsed[0];
        const last = collapsed[collapsed.length - 1];
        const t1 = new Date(first.timestamp).getTime();
        const t2 = new Date(last.timestamp).getTime();
        const durationSec = (t2 - t1) / 1000;
        
        let distance = 0;
        const pathCoords: [number, number][] = [];
        const nodes = collapsed.map(ev => {
            const cam = cameras.find(c => c.id === ev.camera_id);
            if (cam) pathCoords.push([cam.lat, cam.lng]);
            return { event: ev, cam };
        }).filter(n => n.cam) as { event: DetectionEvent, cam: Camera }[];
        
        for (let i = 0; i < nodes.length - 1; i++) {
            distance += getDistance(nodes[i].cam.lat, nodes[i].cam.lng, nodes[i+1].cam.lat, nodes[i+1].cam.lng);
        }
        
        const avgSpeed = collapsed.reduce((a, b) => a + b.speed, 0) / collapsed.length;

        // Auto-center map
        if (mapRef.current && pathCoords.length > 0) {
            const bounds = L.latLngBounds(pathCoords);
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
        
        return {
            nodes,
            pathCoords,
            plate: first.plate,
            type: first.vehicle_type || 'Vehicle',
            color: first.color || 'Unknown',
            id: first.vehicle_id,
            distance,
            durationSec,
            avgSpeed,
            firstTime: first.timestamp,
            lastTime: last.timestamp
        };
    }, [query, allEvents, cameras]);

    // Handle Search
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchInput.trim()) {
            setIsPlaying(false);
            setProgress(0);
            setHasFinished(false);
            navigate(`/replay?vehicle=${searchInput.trim()}`);
        }
    };

    // Playback Loop
    useEffect(() => {
        if (!isPlaying || !journey || journey.error || hasFinished) return;
        
        const durationMs = 15000 / speed; // Base duration 15s for full replay
        
        const update = (time: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const delta = time - lastTimeRef.current;
            lastTimeRef.current = time;
            
            setProgress(p => {
                const next = p + (delta / durationMs);
                if (next >= 1) {
                    setIsPlaying(false);
                    setHasFinished(true);
                    return 1;
                }
                return next;
            });
            
            rafRef.current = requestAnimationFrame(update);
        };
        
        lastTimeRef.current = performance.now();
        rafRef.current = requestAnimationFrame(update);
        
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isPlaying, speed, journey, hasFinished]);

    // Derived Animation State
    const animState = useMemo(() => {
        if (!journey || !journey.nodes || journey.nodes.length < 2) return null;
        if (progress === 0) return { pos: [journey.nodes[0].cam.lat, journey.nodes[0].cam.lng], currentIdx: 0, nextIdx: 1, nodeProgress: 0 };
        if (progress >= 1) return { pos: [journey.nodes[journey.nodes.length-1].cam.lat, journey.nodes[journey.nodes.length-1].cam.lng], currentIdx: journey.nodes.length - 1, nextIdx: journey.nodes.length - 1, nodeProgress: 1 };
        
        const totalSegments = journey.nodes.length - 1;
        const scaledProgress = progress * totalSegments;
        const currentIdx = Math.floor(scaledProgress);
        const nodeProgress = scaledProgress - currentIdx;
        const nextIdx = Math.min(currentIdx + 1, totalSegments);
        
        const p1 = [journey.nodes[currentIdx].cam.lat, journey.nodes[currentIdx].cam.lng];
        const p2 = [journey.nodes[nextIdx].cam.lat, journey.nodes[nextIdx].cam.lng];
        
        const lat = p1[0] + (p2[0] - p1[0]) * nodeProgress;
        const lng = p1[1] + (p2[1] - p1[1]) * nodeProgress;
        
        return { pos: [lat, lng] as [number, number], currentIdx, nextIdx, nodeProgress };
    }, [progress, journey]);

    // Update marker physically to avoid map re-renders
    useEffect(() => {
        if (markerRef.current && animState) {
            markerRef.current.setLatLng(animState.pos);
        }
    }, [animState]);
    
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProgress(parseFloat(e.target.value));
        setHasFinished(false);
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}m ${s}s`;
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] -m-6 bg-slate-50">
            {/* Header & Search */}
            <div className="bg-[#0f172a] text-white p-4 border-b border-slate-800 flex items-center justify-between z-10 shrink-0 shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center"><RotateCcw size={16} /></div>
                    <div>
                        <h1 className="text-sm font-bold tracking-widest uppercase text-slate-100">Vehicle Journey Replay</h1>
                        <p className="text-[10px] text-slate-400">Reconstruct and replay a vehicle's movement across the city.</p>
                    </div>
                </div>
                
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            value={searchInput} 
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="SEARCH VEHICLE ID / LICENSE PLATE" 
                            className="bg-slate-900 border border-slate-700 text-sm rounded pl-9 pr-4 py-1.5 focus:border-blue-500 focus:outline-none w-72 transition-colors placeholder:text-[10px] font-mono"
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded text-sm font-bold tracking-wide transition-colors">SEARCH VEHICLE</button>
                </form>
            </div>

            {journey && !journey.error ? (
                <>
                    {/* Vehicle Summary Bar */}
                    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10 shrink-0 shadow-sm">
                        <div className="flex items-center gap-6">
                            <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vehicle Journey</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-mono font-bold text-slate-900 bg-slate-100 px-2 rounded border border-slate-300">{journey.plate}</span>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-semibold text-slate-700 capitalize">{journey.color} {journey.type}</span>
                                        <span className="text-[9px] font-mono text-slate-500">{journey.id}</span>
                                    </div>
                                    <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> TRACKED
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-8">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">First Seen</span>
                                <span className="text-[11px] font-bold text-slate-800">{journey.nodes[0].cam.id} <span className="text-slate-500 font-normal ml-1">{new Date(journey.firstTime).toLocaleTimeString()}</span></span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Last Seen</span>
                                <span className="text-[11px] font-bold text-slate-800">{journey.nodes[journey.nodes.length-1].cam.id} <span className="text-slate-500 font-normal ml-1">{new Date(journey.lastTime).toLocaleTimeString()}</span></span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Cameras</span>
                                <span className="text-[13px] font-bold text-slate-800 font-mono">{journey.nodes.length}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Journey Time</span>
                                <span className="text-[13px] font-bold text-slate-800 font-mono">{formatTime(journey.durationSec)}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Distance</span>
                                <span className="text-[13px] font-bold text-slate-800 font-mono">{journey.distance.toFixed(1)} km</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Avg Speed</span>
                                <span className="text-[13px] font-bold text-slate-800 font-mono">{journey.avgSpeed.toFixed(0)} km/h</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden relative">
                        {/* Map Area */}
                        <div className="flex-1 relative z-0">
                            <MapContainer center={[28.6139, 77.2090]} zoom={12} className="w-full h-full" zoomControl={false} ref={mapRef}>
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                
                                {/* Static Route Line */}
                                <Polyline 
                                    positions={journey.pathCoords}
                                    pathOptions={{ color: '#cbd5e1', weight: 4, opacity: 0.8, dashArray: '10, 10' }}
                                />
                                
                                {/* Progress Route Line */}
                                {animState && animState.currentIdx > 0 && (
                                    <Polyline 
                                        positions={[...journey.pathCoords.slice(0, animState.currentIdx), animState.pos]}
                                        pathOptions={{ color: '#3b82f6', weight: 6, opacity: 0.9, lineCap: 'round' }}
                                    />
                                )}
                                
                                {/* Camera Markers */}
                                {journey.nodes.map((n, i) => {
                                    const active = animState ? i <= animState.currentIdx : false;
                                    return (
                                        <Marker key={i} position={[n.cam.lat, n.cam.lng]} icon={createCamIcon(active)}>
                                            <Popup className="custom-traffic-popup" closeButton={false}>
                                                <div className="p-1">
                                                    <div className="font-mono text-[9px] text-slate-500 font-bold">{n.cam.id}</div>
                                                    <div className="font-bold text-[12px] text-slate-800 leading-tight mb-2">{n.cam.name}</div>
                                                    <img src={`/cameras/${n.cam.id.toLowerCase()}.jpg`} className="w-full h-24 object-cover rounded mb-2 border border-slate-200" onError={e => e.currentTarget.style.display='none'} />
                                                    <div className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 text-center font-bold">
                                                        DETECTED: {new Date(n.event.timestamp).toLocaleTimeString()}
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}

                                {/* Animated Vehicle Marker */}
                                {animState && (
                                    <Marker position={animState.pos} icon={vehicleIcon} ref={markerRef} zIndexOffset={1000} />
                                )}
                            </MapContainer>
                            
                            {/* Replay Control Bar */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-[#0f172a]/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-2xl flex flex-col gap-3 w-[600px]">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex gap-2">
                                        <button onClick={() => { setProgress(0); setIsPlaying(false); setHasFinished(false); }} className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"><RotateCcw size={14} /></button>
                                        <button onClick={() => { if(hasFinished){setProgress(0);setHasFinished(false);} setIsPlaying(!isPlaying); }} className="w-12 h-8 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow">
                                            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-1" />}
                                        </button>
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-3">
                                        <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{formatTime(progress * journey.durationSec)}</span>
                                        <input 
                                            type="range" 
                                            min="0" max="1" step="0.001" 
                                            value={progress} 
                                            onChange={handleSeek} 
                                            className="flex-1 accent-blue-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                                        />
                                        <span className="text-[10px] font-mono text-slate-400 w-10">{formatTime(journey.durationSec)}</span>
                                    </div>
                                    
                                    <div className="flex bg-slate-800 p-0.5 rounded gap-0.5">
                                        {[0.5, 1, 2, 4].map(s => (
                                            <button 
                                                key={s} 
                                                onClick={() => setSpeed(s)} 
                                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${speed === s ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            >{s}×</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Current Replay State Panel */}
                            {animState && !hasFinished && (
                                <div className="absolute top-4 left-4 z-[400] bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-xl w-64 pointer-events-none">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Current Location</span>
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><MapPin size={16} /></div>
                                        <div>
                                            <div className="text-[11px] font-mono font-bold text-slate-500">{journey.nodes[animState.currentIdx].cam.id}</div>
                                            <div className="text-[14px] font-bold text-slate-800 leading-tight">{journey.nodes[animState.currentIdx].cam.name}</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-3">
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Time</span>
                                            <span className="text-[12px] font-mono font-bold text-slate-700">{new Date(journey.nodes[animState.currentIdx].event.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Speed</span>
                                            <span className="text-[12px] font-mono font-bold text-amber-600">{journey.nodes[animState.currentIdx].event.speed} km/h</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Status</span>
                                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 uppercase inline-flex items-center gap-1">
                                                <CheckCircle size={10} /> {animState.currentIdx === 0 ? 'INITIAL DETECTION' : 'SAME VEHICLE MATCH'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* End Summary Panel */}
                            {hasFinished && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[400] bg-white/95 backdrop-blur-xl p-6 rounded-2xl border border-slate-200 shadow-2xl flex flex-col items-center pointer-events-auto">
                                    <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4"><CheckCircle size={24} /></div>
                                    <h2 className="text-xl font-bold text-slate-800 mb-1">JOURNEY REPLAY COMPLETE</h2>
                                    <p className="text-sm text-slate-500 mb-6 font-mono bg-slate-100 px-3 py-1 rounded">{journey.plate}</p>
                                    
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 w-full">
                                        <div className="flex flex-col items-center p-3 bg-slate-50 rounded border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Distance</span><span className="text-lg font-mono font-bold text-slate-700">{journey.distance.toFixed(1)} km</span></div>
                                        <div className="flex flex-col items-center p-3 bg-slate-50 rounded border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duration</span><span className="text-lg font-mono font-bold text-slate-700">{formatTime(journey.durationSec)}</span></div>
                                        <div className="flex flex-col items-center p-3 bg-slate-50 rounded border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">First Seen</span><span className="text-sm font-bold text-slate-700">{journey.nodes[0].cam.id}</span></div>
                                        <div className="flex flex-col items-center p-3 bg-slate-50 rounded border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Seen</span><span className="text-sm font-bold text-slate-700">{journey.nodes[journey.nodes.length-1].cam.id}</span></div>
                                    </div>
                                    
                                    <button onClick={() => { setProgress(0); setHasFinished(false); setIsPlaying(true); }} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold tracking-widest uppercase rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2">
                                        <RotateCcw size={16} /> REPLAY AGAIN
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right Sidebar - Camera Journey Timeline */}
                        <div className="w-[340px] bg-white border-l border-slate-200 flex flex-col z-10 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)]">
                            <div className="p-4 border-b border-slate-200 bg-slate-50">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={14} className="text-blue-500" />
                                    Camera Journey Timeline
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                                <div className="absolute top-4 bottom-4 left-6 w-0.5 bg-slate-200" />
                                
                                {journey.nodes.map((n, i) => {
                                    const isActive = animState?.currentIdx === i;
                                    const isPassed = animState ? animState.currentIdx > i : false;
                                    
                                    return (
                                        <div key={i} className="relative pl-10 mb-6 last:mb-0">
                                            <div className={`absolute left-0 w-5 h-5 rounded-full border-4 border-white shadow-sm flex items-center justify-center transition-colors ${isActive ? 'bg-blue-500 ring-2 ring-blue-200 ring-offset-2' : isPassed ? 'bg-slate-400' : 'bg-slate-200'}`} style={{ top: '6px' }} />
                                            
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-mono text-slate-500 font-semibold">{new Date(n.event.timestamp).toLocaleTimeString()}</span>
                                                {i === 0 && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">START</span>}
                                                {i === journey.nodes.length - 1 && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">END</span>}
                                            </div>
                                            
                                            <div className={`p-3 rounded-lg border transition-all ${isActive ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <div className={`font-mono text-[10px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>{n.cam.id}</div>
                                                        <div className={`font-bold text-[13px] leading-tight ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{n.cam.name}</div>
                                                    </div>
                                                </div>
                                                
                                                <div className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded inline-flex items-center gap-1 mb-3 border border-green-100 uppercase">
                                                    <CheckCircle size={10} /> {i === 0 ? 'Vehicle Detected' : 'Same Vehicle Matched'}
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100/80">
                                                    <div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Match</span>
                                                        <span className="text-[11px] font-mono font-bold text-slate-700">{n.event.match_confidence || n.event.anpr_confidence}%</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Speed</span>
                                                        <span className="text-[11px] font-mono font-bold text-slate-700">{n.event.speed} km/h</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            ) : journey?.error ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-white p-6">
                    <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-4"><Car size={32} /></div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">{journey.error}</h2>
                    <p className="text-slate-500 mb-8">{journey.msg}</p>
                    <button onClick={() => { setSearchInput(''); navigate('/replay'); }} className="px-6 py-2 bg-slate-900 hover:bg-black text-white text-sm font-bold tracking-widest uppercase rounded transition-colors">Search Another Vehicle</button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-lg w-full">
                        <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6 shadow-inner mx-auto"><RotateCcw size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Vehicle Journey Replay</h2>
                        <p className="text-slate-500 text-center mb-10 leading-relaxed">Search for a vehicle license plate to reconstruct its complete journey across the city's camera network using simulated historical data.</p>
                        
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Recent Demo Vehicles</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {['DL01AB1234', 'HR26EF7890', 'DL03CD4567', 'UP14YZ5678'].map(v => (
                                    <button 
                                        key={v} 
                                        onClick={() => { setSearchInput(v); navigate(`/replay?vehicle=${v}`); }}
                                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Car size={16} className="text-slate-400 group-hover:text-blue-500" />
                                            <span className="font-mono font-bold text-slate-700">{v}</span>
                                        </div>
                                        <Play size={12} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
