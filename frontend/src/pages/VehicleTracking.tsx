import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
    Search, MapPin, Navigation, Clock, CheckCircle2,
    Car, Eye, ArrowDown
} from 'lucide-react';
import { api } from '../services/api';
import type { Camera, DetectionEvent, Trajectory, Vehicle } from '../types';

/* ── Fix Leaflet default icons ────────────────────────── */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function VehicleTracking() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const [searchInput, setSearchInput] = useState(query);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [vehicleEvents, setVehicleEvents] = useState<DetectionEvent[]>([]);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

    useEffect(() => { api.getCameras().then(setCameras); }, []);

    useEffect(() => {
        if (!query) return;
        const fetchTrackingData = async () => {
            try {
                const events = await api.getEvents();
                const targetEvents = events
                    .filter(e => e.plate.toLowerCase() === query.toLowerCase() || e.vehicle_id.toLowerCase() === query.toLowerCase())
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                setVehicleEvents(targetEvents);

                if (targetEvents.length > 0) {
                    const vId = targetEvents[0].vehicle_id;
                    const vehicles = await api.getVehicles();
                    setVehicle(vehicles.find(v => v.id === vId) || null);
                    setTrajectory(await api.getTrajectory(vId));
                } else {
                    setVehicle(null);
                    setTrajectory(null);
                }
            } catch {}
        };
        fetchTrackingData();
        const iv = setInterval(fetchTrackingData, 1000);
        return () => clearInterval(iv);
    }, [query]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchParams({ q: searchInput });
    };

    const camMap = Object.fromEntries(cameras.map(c => [c.id, c]));

    const trajectoryPositions = (trajectory?.path.map(n => {
        const c = camMap[n.camera_id];
        return c ? [c.lat, c.lng] as [number, number] : null;
    }).filter(Boolean) as [number, number][]) || [];

    /* Deduplicated journey nodes */
    const deduplicatedEvents = vehicleEvents.filter(
        (evt, i, arr) => i === 0 || evt.camera_id !== arr[i - 1].camera_id
    );

    const avgMatchConf = vehicleEvents.length > 1
        ? Math.round(vehicleEvents.slice(1).reduce((s, e) => s + (e.match_confidence || 0), 0) / (vehicleEvents.length - 1))
        : 0;

    const firstEvt = deduplicatedEvents[0];
    const lastEvt  = deduplicatedEvents[deduplicatedEvents.length - 1];

    return (
        <div className="flex flex-col gap-5 max-w-[1400px] mx-auto">

            {/* ── Search Bar ─────────────────────────────────── */}
            <div className="panel">
                <form onSubmit={handleSearch} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1">
                        <div className="label-xs mb-1 text-blue-400">TRACK A VEHICLE</div>
                        <p className="text-[var(--text-secondary)] text-[12px]">Enter a vehicle ID or license plate to reconstruct its city-wide trajectory.</p>
                    </div>
                    <div className="relative flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                        <input
                            type="text"
                            placeholder="e.g. DL01AB1234"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[13px] rounded pl-9 pr-4 py-2 focus:outline-none focus:border-[var(--blue)] w-72 transition-colors"
                        />
                    </div>
                    <button type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold px-6 py-2 rounded tracking-wide transition-colors">
                        TRACK
                    </button>
                </form>
            </div>

            {/* ── Empty state ──────────────────────────────────── */}
            {!query && (
                <div className="panel flex flex-col items-center justify-center py-20 text-center">
                    <Navigation size={36} className="mb-4 text-[var(--text-muted)] opacity-40" />
                    <h3 className="text-[var(--text-secondary)] font-semibold mb-1">No vehicle selected</h3>
                    <p className="text-[12px] text-[var(--text-muted)]">Search for a vehicle ID (e.g. V-101) or license plate (e.g. DL01AB1234)</p>
                </div>
            )}

            {/* ── Not found state ──────────────────────────────── */}
            {query && !vehicle && (
                <div className="panel flex flex-col items-center justify-center py-20 text-center">
                    <Search size={36} className="mb-4 text-[var(--text-muted)] opacity-40" />
                    <h3 className="text-[var(--text-secondary)] font-semibold mb-1">Vehicle not found</h3>
                    <p className="text-[12px] text-[var(--text-muted)]">No detection events for "{query}"</p>
                </div>
            )}

            {/* ── Main tracking layout ─────────────────────────── */}
            {query && vehicle && (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 min-h-0">

                    {/* ─ LEFT COLUMN ─────────────────────────────── */}
                    <div className="flex flex-col gap-5 overflow-y-auto custom-scrollbar pr-1">

                        {/* Vehicle Identity Panel */}
                        <div className="panel overflow-hidden">
                            <div className="relative px-5 py-5 bg-[var(--bg-card)]">
                                {/* Subtle Car silhouette/icon in the background */}
                                <div className="absolute top-4 right-4 opacity-[0.03] pointer-events-none">
                                    <Car size={120} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="label-xs text-green-400 flex items-center gap-1.5">
                                            <CheckCircle2 size={11} /> VEHICLE IDENTIFIED
                                        </div>
                                        <span className="badge-sim">SIM DATA</span>
                                    </div>
                                    <div className="mono text-3xl font-bold text-white tracking-wider mb-1">{vehicle.plate}</div>
                                    <div className="text-[var(--text-secondary)] text-[13px] mb-4">{vehicle.color} {vehicle.type}</div>
                                    <div className="flex items-center gap-3">
                                        <span className="mono text-[11px] bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-1 rounded text-[var(--text-secondary)]">{vehicle.id}</span>
                                        <span className="text-green-400 text-[11px] font-semibold">{vehicle.status}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Quick stats */}
                            <div className="grid grid-cols-2 border-t border-[var(--border-subtle)]">
                                {[
                                    { label: 'First Seen', value: firstEvt ? new Date(firstEvt.timestamp).toLocaleTimeString() : '—', sub: firstEvt?.camera_id },
                                    { label: 'Last Seen', value: lastEvt ? new Date(lastEvt.timestamp).toLocaleTimeString() : '—', sub: lastEvt?.camera_id },
                                    { label: 'Cameras Visited', value: deduplicatedEvents.length, sub: 'locations' },
                                    { label: 'Match Confidence', value: avgMatchConf > 0 ? `${avgMatchConf}%` : '—', sub: 'cross-cam Re-ID' },
                                ].map(s => (
                                    <div key={s.label} className="px-4 py-3 border-b border-r border-[var(--border-subtle)] last:border-r-0 even:border-r-0">
                                        <div className="label-xs mb-1">{s.label}</div>
                                        <div className="mono text-[15px] font-bold text-[var(--text-primary)]">{s.value}</div>
                                        {s.sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.sub}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Camera Journey */}
                        <div className="panel flex flex-col">
                            <div className="panel-header">
                                <div>
                                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Cross-Camera Vehicle Journey</div>
                                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Same vehicle detected across multiple cameras</div>
                                </div>
                                <div className="text-right">
                                    <div className="mono text-[11px] text-[var(--text-secondary)] bg-[var(--bg-base)] px-2 py-1 rounded border border-[var(--border-subtle)]">
                                        {deduplicatedEvents.length} CAMERAS
                                    </div>
                                    {avgMatchConf > 0 && (
                                        <div className="text-green-400 font-bold text-[11px] mt-1">{avgMatchConf}% MATCH</div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 flex flex-col gap-0">
                                {deduplicatedEvents.map((evt, i) => {
                                    const cam = camMap[evt.camera_id];
                                    const isActive = highlightedEventId === evt.id;
                                    return (
                                        <div key={evt.id}
                                            className="cursor-pointer"
                                            onClick={() => setHighlightedEventId(isActive ? null : evt.id)}
                                            onMouseEnter={() => setHighlightedEventId(evt.id)}
                                            onMouseLeave={() => setHighlightedEventId(null)}
                                        >
                                            <div className={`flex items-start gap-3 rounded px-3 py-3 transition-all duration-150 ${isActive ? 'bg-blue-500/8 border border-blue-500/20' : 'border border-transparent hover:bg-white/[0.025]'}`}>
                                                {/* Dot */}
                                                <div className="flex flex-col items-center flex-none">
                                                    <div className={`w-2.5 h-2.5 rounded-full mt-1 border-2 border-[var(--bg-panel)] transition-all ${i === 0 ? 'bg-blue-500' : 'bg-green-500'} ${isActive ? 'scale-125' : ''}`} />
                                                    {i < deduplicatedEvents.length - 1 && (
                                                        <div className="w-px flex-1 min-h-[28px] bg-[var(--border-subtle)] mt-1" />
                                                    )}
                                                </div>
                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <span className="mono text-[12px] font-bold text-[var(--text-primary)]">{evt.camera_id}</span>
                                                        <span className="mono text-[10px] text-[var(--text-muted)]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                                                    </div>
                                                    <div className="text-[11px] text-[var(--text-secondary)] mb-1.5">{cam?.name}</div>
                                                    {i > 0 ? (
                                                        <span className="badge-matched">✓ MATCHED</span>
                                                    ) : (
                                                        <span className="label-xs text-blue-400">INITIAL DETECTION</span>
                                                    )}
                                                </div>
                                            </div>
                                            {i < deduplicatedEvents.length - 1 && (
                                                <div className="flex items-center gap-1 pl-[22px] py-0.5">
                                                    <ArrowDown size={10} className="text-[var(--text-muted)]" />
                                                    <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-widest">Same Vehicle</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {deduplicatedEvents.length === 0 && (
                                    <div className="text-[var(--text-muted)] text-[11px] italic py-3 px-3">No detections found.</div>
                                )}
                            </div>

                            {/* Why matched — expandable */}
                            {deduplicatedEvents.length > 1 && (
                                <details className="border-t border-[var(--border-subtle)] text-[11px] [&_summary::-webkit-details-marker]:hidden group/details">
                                    <summary className="flex justify-between items-center px-4 py-2.5 cursor-pointer hover:bg-white/[0.025] select-none text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                                        Why was it matched?
                                        <span className="group-open/details:rotate-180 transition-transform duration-200 text-base leading-none">▾</span>
                                    </summary>
                                    <div className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                                        {[['Number Plate', 'Strong Match'], ['Appearance', 'Similar'], ['Colour', 'Same'], ['Route', 'Feasible']].map(([k, v]) => (
                                            <div key={k}>
                                                <div className="label-xs">{k}</div>
                                                <div className="text-green-400 text-[11px] font-semibold mt-0.5">✓ {v}</div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>

                        {/* Detection Timeline */}
                        <div className="panel flex-1">
                            <div className="panel-header">
                                <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <Clock size={13} className="text-[var(--text-muted)]" /> Detection Timeline
                                </span>
                                <span className="label-xs">{vehicleEvents.length} events</span>
                            </div>
                            <div className="p-4 relative pl-8 border-l border-l-[var(--bg-card)] ml-4">
                                <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--border-subtle)]" />
                                <div className="space-y-4">
                                    {vehicleEvents.map((evt, i) => {
                                        const cam = camMap[evt.camera_id];
                                        return (
                                            <div key={evt.id} className="relative">
                                                <div className={`absolute -left-[25px] top-1 w-2 h-2 rounded-full border border-[var(--bg-base)] ${i === 0 ? 'bg-blue-500' : 'bg-green-500'}`} />
                                                <div className="mono text-[11px] text-[var(--text-muted)] mb-1">{new Date(evt.timestamp).toLocaleTimeString()}</div>
                                                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded px-3 py-2.5">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="mono text-[12px] font-bold text-blue-400">{evt.camera_id}</span>
                                                        <span className="text-[10px] text-[var(--text-muted)]">{cam?.name}</span>
                                                    </div>
                                                    <div className="flex gap-4 text-[11px]">
                                                        <span className="text-[var(--text-muted)]">Speed: <span className="text-amber-400">{evt.speed} km/h</span></span>
                                                        <span className="text-[var(--text-muted)]">Det: <span className="text-green-400">{evt.detection_confidence.toFixed(0)}%</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─ RIGHT COLUMN ────────────────────────────── */}
                    <div className="flex flex-col gap-5 min-h-0">

                        {/* Map */}
                        <div className="panel flex-1 flex flex-col overflow-hidden" style={{ minHeight: 380 }}>
                            <div className="panel-header flex-none">
                                <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <MapPin size={13} className="text-blue-400" /> City Map Trajectory
                                </span>
                                <span className="mono text-[10px] text-[var(--text-secondary)] bg-[var(--bg-base)] px-2 py-1 rounded">
                                    {trajectoryPositions.length} nodes tracked
                                </span>
                            </div>
                            <div className="flex-1 relative bg-[var(--bg-base)]">
                                {cameras.length > 0 && (
                                    <MapContainer
                                        center={[28.6139, 77.2090]}
                                        zoom={12}
                                        style={{ height: '100%', width: '100%' }}
                                        className="z-0"
                                    >
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                        />

                                        {cameras.map(cam => {
                                            const isVisited = trajectory?.path.some(n => n.camera_id === cam.id);
                                            const isHighlighted = highlightedEventId != null && vehicleEvents.find(e => e.id === highlightedEventId)?.camera_id === cam.id;
                                            return (
                                                <Marker
                                                    key={cam.id}
                                                    position={[cam.lat, cam.lng]}
                                                    opacity={isHighlighted ? 1 : isVisited ? 0.75 : 0.25}
                                                >
                                                    <Popup>
                                                        <strong>{cam.id}</strong><br />{cam.name}
                                                    </Popup>
                                                </Marker>
                                            );
                                        })}

                                        {trajectoryPositions.length > 1 && (
                                            <Polyline
                                                positions={trajectoryPositions}
                                                color="#3b7aeb"
                                                weight={3}
                                                opacity={0.85}
                                                dashArray="8 6"
                                            />
                                        )}
                                    </MapContainer>
                                )}
                            </div>
                        </div>

                        {/* Camera-by-Camera History Table */}
                        <div className="panel flex flex-col overflow-hidden" style={{ maxHeight: 300 }}>
                            <div className="panel-header flex-none">
                                <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <Eye size={13} className="text-[var(--text-muted)]" /> Camera-by-Camera History
                                </span>
                                <span className="label-xs">{vehicleEvents.length} detections</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Camera</th>
                                            <th>Location</th>
                                            <th>Plate</th>
                                            <th>Speed</th>
                                            <th className="text-right">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vehicleEvents.map((evt, i) => {
                                            const cam = camMap[evt.camera_id];
                                            const isHighlighted = highlightedEventId === evt.id;
                                            return (
                                                <tr key={evt.id}
                                                    style={{ background: isHighlighted ? 'rgba(59,122,235,0.07)' : '' }}
                                                    className="cursor-pointer"
                                                    onMouseEnter={() => setHighlightedEventId(evt.id)}
                                                    onMouseLeave={() => setHighlightedEventId(null)}
                                                >
                                                    <td className="mono">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                                                    <td className="mono text-blue-400">{evt.camera_id}</td>
                                                    <td className="text-[var(--text-secondary)]">{cam?.name}</td>
                                                    <td className="mono">{evt.plate}</td>
                                                    <td className="text-amber-400 mono">{evt.speed} km/h</td>
                                                    <td className="text-right">
                                                        {i === 0
                                                            ? <span className="label-xs">INITIAL</span>
                                                            : <span className="text-green-400 mono font-bold text-[11px]">{evt.match_confidence}%</span>
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
