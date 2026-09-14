import React, { useEffect, useState, useMemo, useRef, Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import type { Camera, DetectionEvent } from '../types';
import { Play, Pause, RotateCcw, Search, Clock, MapPin, CheckCircle, Car } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

/* ── Leaflet default icon fix ── */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const vehicleIcon = L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 14px #3b82f6;font-size:11px;display:flex;align-items:center;justify-content:center;">🚗</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
});

const camIcon = (active: boolean) => L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${active ? '#3b82f6' : '#94a3b8'};border:2px solid white;border-radius:50%;box-shadow:0 0 8px ${active ? '#3b82f6' : 'transparent'};"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
});

/* ── Haversine distance (km) ── */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ── Inner map child that fits bounds after load ── */
function FitBoundsOnLoad({ coords }: { coords: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (coords.length >= 2) {
            map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], maxZoom: 14 });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coords.length]);
    return null;
}

/* ── Error boundary to prevent blank screen ── */
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; err: string }> {
    state = { hasError: false, err: '' };
    static getDerivedStateFromError(e: Error) { return { hasError: true, err: e.message }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 gap-4">
                    <Car size={36} className="text-slate-300" />
                    <h2 className="text-xl font-bold text-slate-700">Map failed to load</h2>
                    <p className="text-sm text-slate-400 font-mono max-w-sm text-center">{this.state.err}</p>
                    <button onClick={() => window.location.reload()} className="px-5 py-2 bg-blue-600 text-white rounded font-bold text-sm">Reload Page</button>
                </div>
            );
        }
        return this.props.children;
    }
}

/* ════════════════════════════════════════════════════════════ */
export default function VehicleJourneyReplay() {
    const location  = useLocation();
    const navigate  = useNavigate();
    const query     = new URLSearchParams(location.search).get('vehicle') ?? '';

    const [searchInput, setSearchInput] = useState(query);
    const [cameras,     setCameras]     = useState<Camera[]>([]);
    const [allEvents,   setAllEvents]   = useState<DetectionEvent[]>([]);

    const [isPlaying,   setIsPlaying]   = useState(false);
    const [progress,    setProgress]    = useState(0);   // 0–1
    const [speed,       setSpeed]       = useState(1);
    const [hasFinished, setHasFinished] = useState(false);

    const rafRef      = useRef<number>();
    const lastTimeRef = useRef<number>();

    /* ── Load cameras + events once ── */
    useEffect(() => {
        api.getCameras().then(setCameras).catch(() => {});
        api.getEvents().then(setAllEvents).catch(() => {});
    }, []);

    /* ── Reset playback when vehicle changes ── */
    useEffect(() => {
        setIsPlaying(false);
        setProgress(0);
        setHasFinished(false);
        setSearchInput(query);
    }, [query]);

    /* ── Build journey (pure derivation — no side effects!) ── */
    const journey = useMemo(() => {
        if (!query || allEvents.length === 0 || cameras.length === 0) return null;

        const vehicleEvents = allEvents
            .filter(e => e.plate === query || e.vehicle_id === query)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (vehicleEvents.length === 0) {
            return { error: 'VEHICLE NOT FOUND', msg: 'No replay data is available for this vehicle.' } as const;
        }

        // Deduplicate: keep only first event per consecutive camera run
        const collapsed: DetectionEvent[] = [];
        for (const ev of vehicleEvents) {
            if (!collapsed.length || collapsed[collapsed.length - 1].camera_id !== ev.camera_id) {
                collapsed.push(ev);
            }
        }

        if (collapsed.length < 2) {
            return { error: 'JOURNEY TOO SHORT', msg: 'This vehicle was seen at only one camera.' } as const;
        }

        const first = collapsed[0];
        const last  = collapsed[collapsed.length - 1];
        const t1    = new Date(first.timestamp).getTime();
        const t2    = new Date(last.timestamp).getTime();
        const durationSec = Math.max(1, (t2 - t1) / 1000);

        const pathCoords: [number, number][] = [];
        const nodes: { event: DetectionEvent; cam: Camera }[] = [];

        for (const ev of collapsed) {
            const cam = cameras.find(c => c.id === ev.camera_id);
            if (cam) {
                pathCoords.push([cam.lat, cam.lng]);
                nodes.push({ event: ev, cam });
            }
        }

        if (nodes.length < 2) {
            return { error: 'JOURNEY TOO SHORT', msg: 'Camera coordinates are unavailable.' } as const;
        }

        let distance = 0;
        for (let i = 0; i < nodes.length - 1; i++) {
            distance += haversine(nodes[i].cam.lat, nodes[i].cam.lng, nodes[i+1].cam.lat, nodes[i+1].cam.lng);
        }

        const avgSpeed = collapsed.reduce((s, e) => s + e.speed, 0) / collapsed.length;

        return {
            nodes, pathCoords,
            plate: first.plate,
            type:  first.vehicle_type ?? 'Vehicle',
            color: first.color        ?? 'Unknown',
            id:    first.vehicle_id,
            distance, durationSec, avgSpeed,
            firstTime: first.timestamp, lastTime: last.timestamp,
        };
    }, [query, allEvents, cameras]);

    /* ── Playback rAF loop ── */
    useEffect(() => {
        if (!isPlaying || !journey || 'error' in journey || hasFinished) return;
        const durationMs = 15000 / speed;

        const tick = (time: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const delta = time - lastTimeRef.current;
            lastTimeRef.current = time;
            setProgress(p => {
                const next = p + delta / durationMs;
                if (next >= 1) { setIsPlaying(false); setHasFinished(true); return 1; }
                return next;
            });
            rafRef.current = requestAnimationFrame(tick);
        };

        lastTimeRef.current = performance.now();
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isPlaying, speed, journey, hasFinished]);

    /* ── Interpolated vehicle position (pure) ── */
    const animState = useMemo(() => {
        if (!journey || 'error' in journey || journey.nodes.length < 2) return null;
        const nodes = journey.nodes;
        const clamped = Math.max(0, Math.min(1, progress));
        const totalSeg = nodes.length - 1;
        const scaled = clamped * totalSeg;
        const idx = Math.min(Math.floor(scaled), totalSeg - 1);
        const frac = scaled - idx;
        const nextIdx = Math.min(idx + 1, totalSeg);
        const { lat: lat1, lng: lng1 } = nodes[idx].cam;
        const { lat: lat2, lng: lng2 } = nodes[nextIdx].cam;
        return {
            pos: [lat1 + (lat2 - lat1) * frac, lng1 + (lng2 - lng1) * frac] as [number, number],
            currentIdx: clamped >= 1 ? totalSeg : idx,
        };
    }, [progress, journey]);

    /* ── Helpers ── */
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const v = searchInput.trim();
        if (v) navigate(`/replay?vehicle=${v}`);
    };

    const fmt = (secs: number) => `${Math.floor(secs / 60)}m ${Math.floor(secs % 60)}s`;

    const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProgress(parseFloat(e.target.value));
        setHasFinished(false);
    };

    /* ════════════ RENDER ════════════ */
    return (
        <div className="flex flex-col h-[calc(100vh-80px)] -m-6 bg-slate-50">

            {/* ── Header ── */}
            <div className="bg-[#0f172a] text-white p-4 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center"><RotateCcw size={16} /></div>
                    <div>
                        <h1 className="text-sm font-bold tracking-widest uppercase">Vehicle Journey Replay</h1>
                        <p className="text-[10px] text-slate-400">Reconstruct and replay a vehicle's movement across the city.</p>
                    </div>
                </div>
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                            placeholder="SEARCH VEHICLE ID / LICENSE PLATE"
                            className="bg-slate-900 border border-slate-700 text-sm rounded pl-9 pr-4 py-1.5 focus:border-blue-500 focus:outline-none w-72 transition-colors placeholder:text-[10px] font-mono"
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded text-sm font-bold tracking-wide transition-colors">SEARCH VEHICLE</button>
                </form>
            </div>

            {/* ── Journey loaded ── */}
            {journey && !('error' in journey) ? (
                <>
                    {/* Summary bar */}
                    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-mono font-bold text-slate-900 bg-slate-100 px-2 rounded border border-slate-300">{journey.plate}</span>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-semibold text-slate-700 capitalize">{journey.color} {journey.type}</span>
                                <span className="text-[9px] font-mono text-slate-500">{journey.id}</span>
                            </div>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" /> TRACKED
                            </span>
                        </div>
                        <div className="flex gap-7">
                            {[
                                ['First Seen', `${journey.nodes[0].cam.id}  ${new Date(journey.firstTime).toLocaleTimeString()}`],
                                ['Last Seen',  `${journey.nodes[journey.nodes.length-1].cam.id}  ${new Date(journey.lastTime).toLocaleTimeString()}`],
                                ['Cameras',    `${journey.nodes.length}`],
                                ['Journey',    fmt(journey.durationSec)],
                                ['Distance',   `${journey.distance.toFixed(1)} km`],
                                ['Avg Speed',  `${journey.avgSpeed.toFixed(0)} km/h`],
                            ].map(([k, v]) => (
                                <div key={k} className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{k}</span>
                                    <span className="text-[11px] font-bold text-slate-800 font-mono">{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {/* ── Map ── */}
                        <div className="flex-1 relative">
                            <ErrorBoundary>
                                <MapContainer
                                    center={[28.6139, 77.2090]}
                                    zoom={12}
                                    className="w-full h-full"
                                    zoomControl={false}
                                >
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    />

                                    {/* Fit map to route once coords are available */}
                                    {journey.pathCoords.length >= 2 && (
                                        <FitBoundsOnLoad coords={journey.pathCoords} />
                                    )}

                                    {/* Dashed full route */}
                                    <Polyline
                                        positions={journey.pathCoords}
                                        pathOptions={{ color: '#cbd5e1', weight: 4, opacity: 0.8, dashArray: '10, 10' }}
                                    />

                                    {/* Solid blue progress line */}
                                    {animState && animState.currentIdx > 0 && (
                                        <Polyline
                                            positions={[
                                                ...journey.pathCoords.slice(0, animState.currentIdx),
                                                animState.pos,
                                            ]}
                                            pathOptions={{ color: '#3b82f6', weight: 6, opacity: 0.9, lineCap: 'round' }}
                                        />
                                    )}

                                    {/* Camera markers */}
                                    {journey.nodes.map((n, i) => {
                                        const active = animState ? i <= animState.currentIdx : false;
                                        return (
                                            <Marker key={i} position={[n.cam.lat, n.cam.lng]} icon={camIcon(active)}>
                                                <Popup closeButton={false}>
                                                    <div className="p-1 min-w-[160px]">
                                                        <div className="font-mono text-[9px] text-slate-500 font-bold">{n.cam.id}</div>
                                                        <div className="font-bold text-[13px] text-slate-800 mb-2">{n.cam.name}</div>
                                                        <img src={`/cameras/${n.cam.id.toLowerCase()}.jpg`} className="w-full h-20 object-cover rounded mb-2 border" onError={e => (e.currentTarget.style.display = 'none')} />
                                                        <div className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 text-center font-bold">
                                                            {new Date(n.event.timestamp).toLocaleTimeString()}
                                                        </div>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        );
                                    })}

                                    {/* Animated vehicle marker — position derived from state, no ref needed */}
                                    {animState && (
                                        <Marker position={animState.pos} icon={vehicleIcon} zIndexOffset={1000} />
                                    )}
                                </MapContainer>
                            </ErrorBoundary>

                            {/* Replay Controls */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-[#0f172a]/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-2xl flex items-center gap-4 w-[580px]">
                                <div className="flex gap-2">
                                    <button onClick={() => { setProgress(0); setIsPlaying(false); setHasFinished(false); }} className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                                        <RotateCcw size={14} />
                                    </button>
                                    <button onClick={() => { if (hasFinished) { setProgress(0); setHasFinished(false); } setIsPlaying(p => !p); }} className="w-12 h-8 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow">
                                        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                                    </button>
                                </div>
                                <div className="flex-1 flex items-center gap-3">
                                    <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{fmt(progress * journey.durationSec)}</span>
                                    <input type="range" min="0" max="1" step="0.001" value={progress} onChange={seek}
                                        className="flex-1 accent-blue-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                                    <span className="text-[10px] font-mono text-slate-400 w-10">{fmt(journey.durationSec)}</span>
                                </div>
                                <div className="flex bg-slate-800 p-0.5 rounded gap-0.5">
                                    {[0.5, 1, 2, 4].map(s => (
                                        <button key={s} onClick={() => setSpeed(s)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                            {s}×
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Current location panel */}
                            {animState && !hasFinished && (
                                <div className="absolute top-4 left-4 z-[400] bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-xl w-56 pointer-events-none">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Current Location</span>
                                    <div className="flex items-start gap-2 mb-3">
                                        <div className="w-7 h-7 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><MapPin size={14} /></div>
                                        <div>
                                            <div className="text-[10px] font-mono font-bold text-slate-500">{journey.nodes[animState.currentIdx]?.cam.id}</div>
                                            <div className="text-[13px] font-bold text-slate-800 leading-tight">{journey.nodes[animState.currentIdx]?.cam.name}</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Speed</span>
                                            <span className="text-[12px] font-mono font-bold text-amber-600">{journey.nodes[animState.currentIdx]?.event.speed} km/h</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Status</span>
                                            <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5">
                                                <CheckCircle size={10} /> {animState.currentIdx === 0 ? 'DETECTED' : 'MATCHED'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Journey complete overlay */}
                            {hasFinished && (
                                <div className="absolute inset-0 z-[400] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                                    <div className="bg-white/98 p-7 rounded-2xl border border-slate-200 shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
                                        <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4"><CheckCircle size={24} /></div>
                                        <h2 className="text-xl font-bold text-slate-800 mb-1">JOURNEY REPLAY COMPLETE</h2>
                                        <p className="text-sm text-slate-500 mb-6 font-mono bg-slate-100 px-3 py-1 rounded">{journey.plate}</p>
                                        <div className="grid grid-cols-2 gap-4 mb-7 w-full">
                                            {[
                                                ['Distance',  `${journey.distance.toFixed(1)} km`],
                                                ['Duration',  fmt(journey.durationSec)],
                                                ['First Cam', journey.nodes[0].cam.id],
                                                ['Last Cam',  journey.nodes[journey.nodes.length-1].cam.id],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex flex-col items-center p-3 bg-slate-50 rounded border border-slate-100">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k}</span>
                                                    <span className="text-base font-mono font-bold text-slate-700">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button onClick={() => { setProgress(0); setHasFinished(false); setIsPlaying(true); }}
                                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold tracking-widest uppercase rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                                            <RotateCcw size={16} /> REPLAY AGAIN
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right timeline sidebar ── */}
                        <div className="w-[320px] bg-white border-l border-slate-200 flex flex-col shrink-0">
                            <div className="p-4 border-b border-slate-100 bg-slate-50">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={13} className="text-blue-500" />
                                    Camera Journey Timeline
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 relative">
                                {/* vertical connector */}
                                <div className="absolute top-4 bottom-4 left-[1.65rem] w-0.5 bg-slate-200 z-0" />

                                {journey.nodes.map((n, i) => {
                                    const isActive = animState?.currentIdx === i;
                                    const isPassed = animState ? animState.currentIdx > i : false;
                                    return (
                                        <div key={i} className="relative pl-10 mb-5 last:mb-0 z-10">
                                            <div className={`absolute left-0 w-5 h-5 rounded-full border-4 border-white shadow transition-all ${isActive ? 'bg-blue-500 ring-2 ring-blue-200 ring-offset-1 scale-110' : isPassed ? 'bg-slate-400' : 'bg-slate-200'}`} style={{ top: 6 }} />
                                            <div className="flex justify-between mb-1">
                                                <span className="text-[10px] font-mono text-slate-500">{new Date(n.event.timestamp).toLocaleTimeString()}</span>
                                                {i === 0 && <span className="text-[9px] bg-slate-100 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">START</span>}
                                                {i === journey.nodes.length - 1 && <span className="text-[9px] bg-slate-100 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">END</span>}
                                            </div>
                                            <div className={`p-3 rounded-lg border transition-all ${isActive ? 'bg-blue-50/60 border-blue-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                                                <div className={`font-mono text-[10px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{n.cam.id}</div>
                                                <div className={`font-bold text-[13px] leading-tight mb-2 ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{n.cam.name}</div>
                                                <div className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded inline-flex items-center gap-1 mb-3 border border-green-100 uppercase">
                                                    <CheckCircle size={9} /> {i === 0 ? 'Vehicle Detected' : 'Same Vehicle Matched'}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                                    <div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">ANPR</span>
                                                        <span className="text-[11px] font-mono font-bold text-slate-700">{n.event.anpr_confidence}%</span>
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
            ) : journey && 'error' in journey ? (
                /* ── Error states ── */
                <div className="flex-1 flex flex-col items-center justify-center bg-white p-6 gap-4">
                    <Car size={36} className="text-slate-300" />
                    <h2 className="text-xl font-bold text-slate-700">{journey.error}</h2>
                    <p className="text-slate-500 text-sm">{journey.msg}</p>
                    <button onClick={() => { setSearchInput(''); navigate('/replay'); }}
                        className="px-6 py-2 bg-slate-900 hover:bg-black text-white text-sm font-bold tracking-widest uppercase rounded">
                        Search Another Vehicle
                    </button>
                </div>
            ) : (
                /* ── Empty / landing state ── */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-lg w-full">
                        <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6 mx-auto"><RotateCcw size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Vehicle Journey Replay</h2>
                        <p className="text-slate-500 text-center mb-10 leading-relaxed">Search for a vehicle license plate to reconstruct its complete journey across the city's camera network.</p>
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Recent Demo Vehicles</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {['DL01AB1234', 'HR26EF7890', 'DL03CD4567', 'UP16MN8901'].map(v => (
                                    <button key={v} onClick={() => { setSearchInput(v); navigate(`/replay?vehicle=${v}`); }}
                                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group">
                                        <div className="flex items-center gap-2">
                                            <Car size={15} className="text-slate-400 group-hover:text-blue-500" />
                                            <span className="font-mono font-bold text-slate-700 text-sm">{v}</span>
                                        </div>
                                        <Play size={11} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
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
