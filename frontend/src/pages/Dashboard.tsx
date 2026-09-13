import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { SystemState, Alert } from '../types';
import {
    Play, Pause, RotateCcw, Zap, AlertTriangle,
    Car, Activity, Video, MapPin, Gauge, ArrowRight
} from 'lucide-react';

export default function Dashboard() {
    const [state, setState] = useState<SystemState | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);

    useEffect(() => {
        const fetch = async () => {
            try {
                setState(await api.getState());
                setAlerts(await api.getAlerts());
            } catch {}
        };
        fetch();
        const iv = setInterval(fetch, 1000);
        return () => clearInterval(iv);
    }, []);

    const runDemo = async () => {
        await api.runDemo();
        await api.startSim();
        setTimeout(() => { window.location.href = '/tracking?q=DL01AB1234'; }, 500);
    };

    const metrics = [
        { label: 'Vehicles Detected', value: state?.total_vehicles_detected ?? 0, icon: Car, color: 'text-blue-400', accent: 'bg-blue-500/8' },
        { label: 'Active Tracks', value: state?.active_vehicles_count ?? 0, icon: Activity, color: 'text-green-400', accent: 'bg-green-500/8' },
        { label: 'Cameras Online', value: '6 / 6', icon: Video, color: 'text-sky-400', accent: 'bg-sky-500/8' },
        { label: 'Avg Speed', value: '44 km/h', icon: Gauge, color: 'text-amber-400', accent: 'bg-amber-500/8' },
    ];

    const alertColor = (type: string) => {
        if (type === 'HIGH_SPEED') return 'text-amber-400';
        if (type === 'CONGESTION') return 'text-red-400';
        return 'text-blue-400';
    };

    return (
        <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">

            {/* ── Hero Header ──────────────────────────────────── */}
            <div className="traffic-hero rounded-md overflow-hidden">
                <div className="px-8 py-10 flex items-end justify-between gap-6 flex-wrap">
                    <div>
                        <div className="label-xs text-blue-400 mb-3 tracking-[0.2em]">CITY-WIDE AI TRAFFIC INTELLIGENCE</div>
                        <h1 className="text-3xl font-bold text-white tracking-tight leading-tight mb-2">
                            Traffic Command Centre
                        </h1>
                        <p className="text-[var(--text-secondary)] text-sm max-w-xl">
                            Multi-camera ANPR vehicle tracking &amp; cross-camera trajectory reconstruction across the city grid.
                        </p>
                        <div className="flex items-center gap-5 mt-5">
                            <span className="status-online">System Online</span>
                            <span className="status-sim">Simulation Active</span>
                            <span className="label-xs">6 Nodes Monitored</span>
                        </div>
                    </div>
                    <button
                        onClick={runDemo}
                        className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3 rounded text-[13px] font-bold tracking-wide transition-colors shadow-lg flex-none"
                    >
                        <Zap size={16} />
                        RUN SIH DEMO
                    </button>
                </div>
            </div>

            {/* ── Metrics Row ──────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map(m => (
                    <div key={m.label} className={`metric-card flex items-center gap-4`}>
                        <div className={`w-10 h-10 rounded flex items-center justify-center ${m.accent} flex-none`}>
                            <m.icon size={20} className={m.color} />
                        </div>
                        <div>
                            <div className="label-xs mb-1">{m.label}</div>
                            <div className="mono text-2xl font-bold text-[var(--text-primary)]">{m.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Simulation Controls ──────────────────────── */}
                <div className="panel flex flex-col">
                    <div className="panel-header">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">Simulation Engine</span>
                        <span className={`text-[11px] font-mono ${state?.is_simulating ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                            {state?.is_simulating ? '● RUNNING' : '○ IDLE'}
                        </span>
                    </div>
                    <div className="p-5 flex flex-col gap-4 flex-1">
                        <div className="flex gap-2">
                            <button onClick={() => api.startSim()} disabled={state?.is_simulating}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded text-[12px] font-semibold border transition-all ${
                                    state?.is_simulating
                                        ? 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                                        : 'border-green-500/40 bg-green-500/8 text-green-400 hover:bg-green-500/15'
                                }`}
                            ><Play size={14} /> Start</button>
                            <button onClick={() => api.pauseSim()} disabled={!state?.is_simulating}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded text-[12px] font-semibold border transition-all ${
                                    !state?.is_simulating
                                        ? 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                                        : 'border-amber-500/40 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15'
                                }`}
                            ><Pause size={14} /> Pause</button>
                            <button onClick={() => api.resetSim()}
                                className="flex-1 flex justify-center items-center gap-2 py-2.5 rounded text-[12px] font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/5 transition-all"
                            ><RotateCcw size={14} /> Reset</button>
                        </div>

                        <div>
                            <div className="label-xs mb-2">Simulation Speed</div>
                            <div className="flex gap-1.5">
                                {[0.5, 1, 2, 5].map(s => (
                                    <button key={s} onClick={() => api.setSpeed(s)}
                                        className={`flex-1 py-1.5 rounded text-[11px] font-mono font-semibold border transition-all ${
                                            state?.simulation_speed === s
                                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/4'
                                        }`}
                                    >{s}×</button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-[var(--border-subtle)] pt-4 grid grid-cols-2 gap-3 text-[12px]">
                            {[
                                ['YOLOv8', 'SIMULATED'],
                                ['PaddleOCR', 'SIMULATED'],
                                ['DeepSORT', 'SIMULATED'],
                                ['Vehicle Re-ID', 'ACTIVE'],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <div className="label-xs mb-0.5">{k}</div>
                                    <div className={`text-[11px] font-mono font-semibold ${v === 'ACTIVE' ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>● {v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Alerts ─────────────────────────────────────── */}
                <div className="panel lg:col-span-2 flex flex-col overflow-hidden">
                    <div className="panel-header">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <AlertTriangle size={14} className="text-red-400" /> System Alerts
                        </span>
                        <span className="label-xs">{alerts.length} ACTIVE</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {alerts.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-[var(--text-muted)] text-sm">
                                No active alerts
                            </div>
                        ) : alerts.map(a => (
                            <div key={a.id} className="alert-item" onClick={() => {
                                if (a.reference_id?.startsWith('V-')) window.location.href = `/tracking?q=${a.reference_id}`;
                            }}>
                                <div className={`mt-0.5 flex-none ${alertColor(a.type)}`}>
                                    <AlertTriangle size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-[11px] font-bold uppercase tracking-wide ${alertColor(a.type)}`}>{a.title}</span>
                                        {a.reference_id && (
                                            <span className="mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-card)] px-1.5 py-0.5 rounded">{a.reference_id}</span>
                                        )}
                                    </div>
                                    <div className="text-[12px] text-[var(--text-secondary)] truncate">{a.message}</div>
                                </div>
                                <div className="text-[10px] mono text-[var(--text-muted)] flex-none">{new Date(a.timestamp).toLocaleTimeString()}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Architecture diagram ─────────────────────────── */}
            <div className="panel p-6">
                <div className="label-xs mb-5">Detection Pipeline Architecture</div>
                <div className="flex items-center justify-center gap-0 flex-wrap">
                    {['CCTV Feed', 'YOLOv8 Detect', 'ANPR / OCR', 'Re-ID Engine', 'Trajectory', 'Analytics'].map((step, i, arr) => (
                        <React.Fragment key={step}>
                            <div className="flex flex-col items-center px-4 py-2">
                                <div className="mono text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded px-4 py-2 whitespace-nowrap">{step}</div>
                                <div className="badge-sim mt-1.5">SIMULATED</div>
                            </div>
                            {i < arr.length - 1 && <ArrowRight size={14} className="text-[var(--text-muted)] flex-none" />}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
