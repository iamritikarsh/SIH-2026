import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Camera, DetectionEvent } from '../types';
import { api } from '../services/api';
import { Video, ExternalLink } from 'lucide-react';

// Traffic-scene images per camera — keyed by camera ID for dynamic lookup
const CAM_IMAGES: Record<string, string> = {
    'CAM-01': '/cameras/cam-01.jpg', // Connaught Place
    'CAM-02': '/cameras/cam-02.jpg', // ITO
    'CAM-03': '/cameras/cam-03.jpg', // India Gate
    'CAM-04': '/cameras/cam-04.jpg', // Ring Road
    'CAM-05': '/cameras/cam-05.jpg', // Kashmere Gate
    'CAM-06': '/cameras/cam-06.jpg', // AIIMS Junction
    'CAM-07': '/cameras/cam-07.jpg', // Nehru Place
    'CAM-08': '/cameras/cam-08.jpg', // Dhaula Kuan
    'CAM-09': '/cameras/cam-09.jpg', // Lajpat Nagar
    'CAM-10': '/cameras/cam-10.jpg', // Rajouri Garden
    'CAM-11': '/cameras/cam-11.jpg', // Saket Metro
    'CAM-12': '/cameras/cam-12.jpg', // Akshardham Bridge
};

const VEH_COLORS: Record<string, string> = {
    White: '#e2e8f0', Black: '#1e293b', Red: '#ef4444',
    Blue: '#3b82f6', Silver: '#94a3b8', Yellow: '#f59e0b',
};

function CamFeed({ cam, index, events }: { cam: Camera; index: number; events: DetectionEvent[] }) {
    const navigate = useNavigate();
    const recent = events.filter(e => e.camera_id === cam.id).slice(0, 4);
    const latest = recent[0];

    return (
        <div className="panel flex flex-col overflow-hidden group">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2.5">
                    <Video size={13} className="text-[var(--text-muted)]" />
                    <span className="mono text-[11px] font-semibold text-[var(--text-secondary)]">{cam.id}</span>
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{cam.name}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold tracking-wider ${
                    latest ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${latest ? 'bg-green-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
                    {latest ? 'LIVE' : 'SCANNING'}
                </div>
            </div>

            {/* Feed area */}
            <div className="relative aspect-video bg-[var(--bg-base)] overflow-hidden cursor-pointer"
                onClick={() => latest && navigate(`/tracking?q=${latest.plate}`)}>

                {/* Background traffic image */}
                <img
                    src={CAM_IMAGES[cam.id] || '/cameras/cam-01.jpg'}
                    alt=""
                    onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=640&q=70&auto=format&fit=crop'; }}
                    className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity duration-500"
                    loading="lazy"
                />

                {/* Overlay gradient */}
                <div className="cam-overlay" />

                {/* Scanline animation */}
                <div className="cam-scanline" />

                {/* Camera HUD */}
                <div className="absolute top-2 left-2 text-[9px] mono text-blue-400/70 leading-tight">
                    <div>{cam.id}</div>
                    <div>{new Date().toLocaleTimeString()}</div>
                </div>
                <div className="absolute top-2 right-2 mono text-[9px] text-red-400/70">● REC</div>

                {/* Vehicle bounding box */}
                {latest && (
                    <div className="absolute inset-8 border border-green-500/50"
                        style={{ boxShadow: '0 0 0 1px rgba(34,197,94,0.1) inset' }}>
                        {/* Detection tag */}
                        <div className="absolute -top-px -left-px bg-green-500 text-[var(--bg-base)] text-[9px] font-mono font-bold px-1.5 py-0.5 leading-none">
                            {latest.vehicle_id}
                        </div>
                        <div className="absolute -bottom-px left-0 bg-slate-900/80 text-green-400 text-[9px] mono px-1.5 py-0.5 leading-none">
                            {latest.plate}
                        </div>

                        {/* Vehicle colour dot */}
                        <div className="absolute -top-px right-0 flex items-center gap-1 bg-slate-900/80 px-1.5 py-0.5">
                            <span className="w-2 h-2 rounded-full inline-block border border-white/20"
                                style={{ background: VEH_COLORS[latest.color] || '#94a3b8' }} />
                            <span className="text-[9px] text-slate-400">{latest.color}</span>
                        </div>

                        {/* Corner markers */}
                        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
                            <div key={i} className={`absolute w-2 h-2 border-green-400 ${pos} ${
                                i < 2 ? 'border-t' : 'border-b'
                            } ${i % 2 === 0 ? 'border-l' : 'border-r'}`} />
                        ))}
                    </div>
                )}

                {/* Track button on hover */}
                {latest && (
                    <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1.5 bg-[var(--bg-base)]/90 border border-[var(--border)] text-[var(--text-primary)] text-[11px] font-semibold px-4 py-1.5 rounded">
                            <ExternalLink size={12} /> TRACK THIS VEHICLE
                        </div>
                    </div>
                )}

                {!latest && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <span className="mono text-[10px] text-blue-400 font-bold tracking-widest uppercase">Scanning</span>
                        </div>
                        <span className="text-[9px] text-white/50 mono">0 vehicles detected</span>
                    </div>
                )}
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)]">
                <span className="label-xs">{recent.length} VEHICLE{recent.length === 1 ? '' : 'S'} DETECTED</span>
                {latest && (
                    <span className="mono text-[10px] text-amber-400">{latest.speed} km/h</span>
                )}
            </div>

            {/* Detection list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: 90 }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Vehicle</th>
                            <th>Plate</th>
                            <th className="text-right">Conf.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recent.map(evt => (
                            <tr key={evt.id} className="cursor-pointer" onClick={() => navigate(`/tracking?q=${evt.plate}`)}>
                                <td className="mono text-[11px]">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                                <td className="text-blue-400 mono text-[11px]">{evt.vehicle_id}</td>
                                <td className="mono text-[11px]">{evt.plate}</td>
                                <td className="text-right text-[11px] text-green-400">{evt.detection_confidence.toFixed(0)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {recent.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full py-4 text-center px-4">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[9px] font-bold tracking-wider text-green-500 uppercase">CAMERA ONLINE</span>
                        </div>
                        <span className="text-[12px] font-bold text-[var(--text-secondary)] mb-0.5">NO VEHICLES DETECTED</span>
                        <span className="text-[10px] text-[var(--text-muted)]">Camera is online and scanning for vehicles</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LiveCameras() {
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [events, setEvents] = useState<DetectionEvent[]>([]);

    useEffect(() => { api.getCameras().then(setCameras); }, []);

    useEffect(() => {
        const fetch = async () => { try { setEvents(await api.getEvents()); } catch {} };
        fetch();
        const iv = setInterval(fetch, 1000);
        return () => clearInterval(iv);
    }, []);

    return (
        <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">
            <div className="flex items-end justify-between">
                <div>
                    <div className="label-xs text-blue-400 mb-2">SURVEILLANCE GRID</div>
                    <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Live Camera Feeds</h2>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">{cameras.length} nodes active — click any detection to begin tracking</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="status-online">All Cameras Online</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {cameras.map((cam, i) => (
                    <CamFeed key={cam.id} cam={cam} index={i} events={events} />
                ))}
            </div>
        </div>
    );
}
