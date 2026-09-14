import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
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

/* ── Custom marker factories ───────────────────────────── */
function makeCamIcon(visited: boolean, isFirst: boolean) {
    const bg   = isFirst  ? '#2563eb' : visited ? '#16a34a' : '#6b7280';
    const ring = isFirst  ? '#93c5fd' : visited ? '#86efac' : '#9ca3af';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="38" viewBox="0 0 32 38">
      <circle cx="16" cy="15" r="13" fill="${bg}" stroke="${ring}" stroke-width="2.5" opacity="0.95"/>
      <svg x="7" y="6" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="15" height="10" rx="2"/>
        <path d="M17 9l4-2v10l-4-2"/>
        <circle cx="8.5" cy="12" r="2" fill="white" stroke="none"/>
      </svg>
      <polygon points="12,28 20,28 16,38" fill="${bg}" opacity="0.95"/>
    </svg>`;
    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -40],
    });
}

function makeVehicleIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="17" fill="#1d4ed8" stroke="#93c5fd" stroke-width="2" opacity="0.95"/>
      <svg x="6" y="8" width="24" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 17H3a1 1 0 01-1-1v-5l2-6h14l2 6v5a1 1 0 01-1 1h-2"/>
        <circle cx="7" cy="17" r="2"/>
        <circle cx="17" cy="17" r="2"/>
        <path d="M5 9h14"/>
      </svg>
    </svg>`;
    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -22],
    });
}

/* ── Auto-fit map to trajectory bounds ────────────────── */
function MapAutoFit({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const fittedRef = useRef<string>('');

    useEffect(() => {
        if (positions.length < 1) return;
        const key = positions.map(p => p.join(',')).join('|');
        if (key === fittedRef.current) return;
        fittedRef.current = key;

        if (positions.length === 1) {
            map.setView(positions[0], 14, { animate: true, duration: 0.8 });
        } else {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true, duration: 0.8 });
        }
    }, [positions, map]);

    return null;
}

/* ── Main component ────────────────────────────────────── */
export default function VehicleTracking() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const [searchInput, setSearchInput]         = useState(query);
    const [cameras, setCameras]                 = useState<Camera[]>([]);
    const [vehicleEvents, setVehicleEvents]     = useState<DetectionEvent[]>([]);
    const [vehicle, setVehicle]                 = useState<Vehicle | null>(null);
    const [trajectory, setTrajectory]           = useState<Trajectory | null>(null);
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

    /* Deduplicate trajectory nodes for journey display */
    const deduplicatedEvents = vehicleEvents.filter(
        (evt, i, arr) => i === 0 || evt.camera_id !== arr[i - 1].camera_id
    );

    /* Unique camera positions in visit order for polyline + auto-fit */
    const trajectoryPositions: [number, number][] = deduplicatedEvents
        .map(evt => {
            const c = camMap[evt.camera_id];
            return c ? [c.lat, c.lng] as [number, number] : null;
        })
        .filter((p): p is [number, number] => p !== null);

    /* Vehicle last-known position = last trajectory point */
    const vehiclePos = trajectoryPositions.length > 0
        ? trajectoryPositions[trajectoryPositions.length - 1]
        : null;

    const avgMatchConf = vehicleEvents.length > 1
        ? Math.round(vehicleEvents.slice(1).reduce((s, e) => s + (e.match_confidence || 0), 0) / (vehicleEvents.length - 1))
        : 0;

    const firstEvt = deduplicatedEvents[0];
    const lastEvt  = deduplicatedEvents[deduplicatedEvents.length - 1];

    const visitedCamIds = new Set(deduplicatedEvents.map(e => e.camera_id));
    const highlightedCamId = highlightedEventId
        ? vehicleEvents.find(e => e.id === highlightedEventId)?.camera_id
        : null;

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
                    <div className="flex items-center gap-2">
                        <button type="submit"
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold px-6 py-2 rounded tracking-wide transition-colors">
                            TRACK
                        </button>
                        <button type="button" onClick={() => window.location.href = `/replay?vehicle=${searchInput}`}
                            className="bg-slate-800 hover:bg-slate-700 text-white text-[12px] font-bold px-6 py-2 rounded tracking-wide transition-colors shadow">
                            REPLAY JOURNEY
                        </button>
                    </div>
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

                            {/* Why matched */}
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

                        {/* ── Map ──────────────────────────────────────── */}
                        <div className="panel flex-1 flex flex-col overflow-hidden" style={{ minHeight: 440 }}>
                            <div className="panel-header flex-none">
                                <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <MapPin size={13} className="text-blue-400" /> City Map Trajectory
                                </span>
                                <div className="flex items-center gap-3">
                                    {deduplicatedEvents.length > 0 && (
                                        <span className="mono text-[10px] text-green-400 font-bold">
                                            {deduplicatedEvents.length} CAMERAS
                                        </span>
                                    )}
                                    {avgMatchConf > 0 && (
                                        <span className="mono text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                                            {avgMatchConf}% MATCH
                                        </span>
                                    )}
                                    <span className="mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-base)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                                        OpenStreetMap
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 relative" style={{ minHeight: 380 }}>
                                {cameras.length > 0 && (
                                    <MapContainer
                                        center={[28.6139, 77.2090]}
                                        zoom={12}
                                        style={{ height: '100%', width: '100%' }}
                                        className="z-0"
                                        zoomControl={true}
                                        attributionControl={false}
                                    >
                                        <TileLayer
                                            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                                            maxZoom={20}
                                        />

                                        {/* ── Auto-fit to trajectory ── */}
                                        {trajectoryPositions.length > 0 && (
                                            <MapAutoFit positions={trajectoryPositions} />
                                        )}

                                        {/* ── All cameras — with custom icons ── */}
                                        {cameras.map((cam, i) => {
                                            const visited   = visitedCamIds.has(cam.id);
                                            const isFirst   = deduplicatedEvents[0]?.camera_id === cam.id;
                                            const evtForCam = deduplicatedEvents.find(e => e.camera_id === cam.id);
                                            const opacity   = highlightedCamId
                                                ? (cam.id === highlightedCamId ? 1 : visited ? 0.5 : 0.15)
                                                : visited ? 1 : 0.2;

                                            return (
                                                <Marker
                                                    key={cam.id}
                                                    position={[cam.lat, cam.lng]}
                                                    icon={makeCamIcon(visited, isFirst)}
                                                    opacity={opacity}
                                                >
                                                    <Popup>
                                                        <div style={{ minWidth: 170, fontFamily: 'Inter, sans-serif' }}>
                                                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#1e293b' }}>
                                                                {cam.id} — {cam.name}
                                                            </div>
                                                            {evtForCam ? (
                                                                <>
                                                                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>
                                                                        <b>Vehicle:</b> {evtForCam.plate}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>
                                                                        <b>Time:</b> {new Date(evtForCam.timestamp).toLocaleTimeString()}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                                                                        <b>Speed:</b> {evtForCam.speed} km/h
                                                                    </div>
                                                                    <div style={{ display: 'inline-block', background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                                                                        ✓ MATCHED
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Not on this vehicle's route</div>
                                                            )}
                                                        </div>
                                                    </Popup>
                                                </Marker>
                                            );
                                        })}

                                        {/* ── Trajectory route line ── */}
                                        {trajectoryPositions.length > 1 && (
                                            <>
                                                {/* Shadow / glow line */}
                                                <Polyline
                                                    positions={trajectoryPositions}
                                                    color="#93c5fd"
                                                    weight={8}
                                                    opacity={0.25}
                                                />
                                                {/* Main solid route */}
                                                <Polyline
                                                    positions={trajectoryPositions}
                                                    color="#2563eb"
                                                    weight={4}
                                                    opacity={0.9}
                                                />
                                                {/* Dashed direction overlay */}
                                                <Polyline
                                                    positions={trajectoryPositions}
                                                    color="#ffffff"
                                                    weight={1.5}
                                                    opacity={0.6}
                                                    dashArray="4 12"
                                                />
                                            </>
                                        )}

                                        {/* ── Vehicle last-known position ── */}
                                        {vehiclePos && (
                                            <Marker
                                                position={vehiclePos}
                                                icon={makeVehicleIcon()}
                                                zIndexOffset={1000}
                                            >
                                                <Popup>
                                                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', marginBottom: 4 }}>
                                                            {vehicle.plate}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#475569' }}>
                                                            {vehicle.color} {vehicle.type}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                            Last seen: {lastEvt ? camMap[lastEvt.camera_id]?.name : '—'}
                                                        </div>
                                                    </div>
                                                </Popup>
                                            </Marker>
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
