import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Video, Map, BarChart3, Bell, Search, Settings,
    Activity, ChevronRight, AlertTriangle
} from 'lucide-react';
import { api } from './services/api';
import type { SystemState } from './types';

import LiveCameras from './pages/LiveCameras';
import VehicleTracking from './pages/VehicleTracking';
import Dashboard from './pages/Dashboard';
import TrafficAnalytics from './pages/TrafficAnalytics';
import SystemAlerts from './pages/SystemAlerts';

/* ── Sidebar ────────────────────────────────────────────── */
function Sidebar({ state }: { state: SystemState | null }) {
    const navItems = [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { path: '/cameras', label: 'Live Cameras', icon: Video },
        { path: '/tracking', label: 'Vehicle Tracking', icon: Map },
        { path: '/analytics', label: 'Traffic Analytics', icon: BarChart3 },
        { path: '/alerts', label: 'Alerts', icon: Bell },
    ];

    return (
        <aside className="w-[220px] flex-none bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col h-screen z-20">
            {/* Brand */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-none">
                    <Activity size={14} className="text-white" />
                </div>
                <div>
                    <div className="text-[11px] font-700 tracking-[0.12em] text-slate-200 leading-tight font-bold uppercase">City Traffic</div>
                    <div className="text-[9px] tracking-[0.08em] text-slate-500 uppercase">Intelligence Engine</div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 pt-3 pb-2">
                <div className="px-4 mb-2 label-xs text-[var(--text-muted)]">Navigation</div>
                {navItems.map(({ path, label, icon: Icon, end }) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={end}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                                isActive
                                    ? 'nav-item-active text-[#7ab3ff]'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
                            }`
                        }
                    >
                        <Icon size={16} className="flex-none" />
                        {label}
                    </NavLink>
                ))}
            </nav>

            {/* Simulation status */}
            <div className="px-5 py-4 border-t border-[var(--border-subtle)]">
                <div className="label-xs mb-2">Simulation Mode</div>
                <div className="flex items-center justify-between">
                    <span className={state?.is_simulating ? 'status-sim' : 'text-[var(--text-muted)] text-[10px] font-semibold tracking-widest uppercase'}>
                        {state?.is_simulating ? 'SIMULATION ACTIVE' : 'PAUSED'}
                    </span>
                    {state && (
                        <span className="mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-card)] px-2 py-0.5 rounded">
                            {state.simulation_speed}×
                        </span>
                    )}
                </div>
            </div>
        </aside>
    );
}

/* ── Topbar ─────────────────────────────────────────────── */
function Topbar({ state, connStatus }: { state: SystemState | null, connStatus: 'CONNECTING' | 'ONLINE' | 'OFFLINE' }) {
    const [search, setSearch] = useState('');
    const location = useLocation();

    const pageTitle: Record<string, string> = {
        '/':          'Command Dashboard',
        '/cameras':   'Live Camera Feeds',
        '/tracking':  'Vehicle Tracking Engine',
        '/analytics': 'Traffic Analytics',
        '/alerts':    'System Alerts',
    };

    const title = pageTitle[location.pathname] || 'Traffic Command Centre';

    return (
        <header className="h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-6 px-6 flex-none z-10">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-[12px]">
                <span className="text-[var(--text-secondary)] font-medium">Traffic Command Centre</span>
                <ChevronRight size={12} />
                <span className="text-[var(--text-primary)] font-semibold">{title}</span>
            </div>

            <div className="flex-1" />

            {/* Status pills */}
            <div className="hidden md:flex items-center gap-4">
                {connStatus === 'CONNECTING' && (
                    <span className="text-amber-400 text-[10px] font-bold tracking-wider uppercase animate-pulse flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                        TRAFFIC ENGINE STARTING...
                    </span>
                )}
                {connStatus === 'OFFLINE' && (
                    <div className="flex items-center gap-3">
                        <span className="text-red-400 text-[10px] font-bold tracking-wider uppercase flex items-center gap-2">
                            <AlertTriangle size={12} />
                            BACKEND TEMPORARILY UNAVAILABLE
                        </span>
                        <button onClick={() => window.location.reload()} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white transition-colors border border-white/10">
                            RETRY CONNECTION
                        </button>
                    </div>
                )}
                {connStatus === 'ONLINE' && state && (
                    <>
                        <span className="status-online">SYSTEM ONLINE</span>
                        <span className="text-[var(--border)] text-xs">|</span>
                        <span className="mono text-[11px] text-[var(--text-secondary)]">
                            {new Date(state.simulation_time).toLocaleTimeString()}
                        </span>
                    </>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                <input
                    type="text"
                    placeholder="Search vehicle ID or plate…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') window.location.href = `/tracking?q=${search}`; }}
                    className="bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[13px] rounded pl-8 pr-4 py-1.5 focus:outline-none focus:border-[var(--blue)] w-64 text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors"
                />
            </div>

            <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors rounded hover:bg-white/5">
                <Settings size={16} />
            </button>
        </header>
    );
}

/* ── App ─────────────────────────────────────────────────── */
export default function App() {
    const [state, setState] = useState<SystemState | null>(null);
    const [connStatus, setConnStatus] = useState<'CONNECTING' | 'ONLINE' | 'OFFLINE'>('CONNECTING');

    useEffect(() => {
        let mounted = true;
        let failCount = 0;

        const fetchState = async () => {
            try { 
                const data = await api.getState();
                if (mounted) {
                    setState(data);
                    setConnStatus('ONLINE');
                    failCount = 0;
                }
            } catch (err) {
                if (mounted) {
                    failCount++;
                    if (failCount > 2) setConnStatus('OFFLINE');
                }
            }
        };

        fetchState();
        const iv = setInterval(fetchState, 2000); // 2 second interval to avoid spamming during sleep
        return () => { mounted = false; clearInterval(iv); };
    }, []);

    return (
        <BrowserRouter>
            <div className="flex h-screen overflow-hidden">
                <Sidebar state={state} />
                <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                    <Topbar state={state} connStatus={connStatus} />
                    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[var(--bg-base)]">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/cameras" element={<LiveCameras />} />
                            <Route path="/tracking" element={<VehicleTracking />} />
                            <Route path="/analytics" element={<TrafficAnalytics />} />
                            <Route path="/alerts" element={<SystemAlerts />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </BrowserRouter>
    );
}
