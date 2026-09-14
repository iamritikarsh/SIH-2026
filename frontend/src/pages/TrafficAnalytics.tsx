import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { DetectionEvent, Camera, Trajectory, SystemState } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function TrafficAnalytics() {
    const [events, setEvents] = useState<DetectionEvent[]>([]);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [state, setState] = useState<SystemState | null>(null);
    const [trajectories, setTrajectories] = useState<Record<string, Trajectory>>({});
    
    const navigate = useNavigate();

    const fetchData = async () => {
        try {
            const [evts, cams, st, traj] = await Promise.all([
                api.getEvents(),
                api.getCameras(),
                api.getState(),
                api.getTrajectories()
            ]);
            setEvents(evts);
            setCameras(cams);
            setState(st);
            setTrajectories(traj);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);

    // KPIs
    const activeVehicles = state?.active_vehicles_count || 0;
    const totalDetections = state?.total_vehicles_detected || 0;
    const avgSpeed = events.length > 0 ? Math.round(events.reduce((acc, e) => acc + e.speed, 0) / events.length) : 0;
    
    let trafficFlow = 0;
    if (events.length > 1) {
        const timeWindow = Math.abs(new Date(events[0].timestamp).getTime() - new Date(events[events.length - 1].timestamp).getTime()) / 1000;
        trafficFlow = Math.round((events.length / Math.max(1, timeWindow)) * 3600);
    }
    let congestion = "LOW";
    if (avgSpeed > 0 && avgSpeed < 35) congestion = "HIGH";
    else if (trafficFlow > 1500) congestion = "MEDIUM";

    // Chart Data: Flow over time
    // We group events by 10s intervals
    const flowData: Record<string, number> = {};
    [...events].reverse().forEach(e => {
        const d = new Date(e.timestamp);
        d.setSeconds(Math.floor(d.getSeconds() / 10) * 10);
        const timeKey = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        flowData[timeKey] = (flowData[timeKey] || 0) + 1;
    });
    const flowChartData = Object.entries(flowData).map(([time, count]) => ({ time, count })).slice(-15);

    // Chart Data: Vehicles by camera
    const camCount: Record<string, number> = {};
    const camSpeed: Record<string, { sum: number, count: number }> = {};
    events.forEach(e => {
        camCount[e.camera_id] = (camCount[e.camera_id] || 0) + 1;
        if (!camSpeed[e.camera_id]) camSpeed[e.camera_id] = { sum: 0, count: 0 };
        camSpeed[e.camera_id].sum += e.speed;
        camSpeed[e.camera_id].count += 1;
    });

    const camChartData = cameras.map(c => ({
        name: c.id,
        fullName: c.name,
        count: camCount[c.id] || 0,
        avgSpeed: camSpeed[c.id] ? Math.round(camSpeed[c.id].sum / camSpeed[c.id].count) : 0
    }));

    // Routes
    const routeCounts: Record<string, number> = {};
    Object.values(trajectories).forEach(t => {
        if (t.path.length > 1) {
            // just use unique camera sequence
            const seq = t.path.map(p => p.camera_id);
            // remove consecutive duplicates
            const cleanSeq = seq.filter((c, i) => i === 0 || c !== seq[i-1]);
            if (cleanSeq.length > 1) {
                const key = cleanSeq.join(' → ');
                routeCounts[key] = (routeCounts[key] || 0) + 1;
            }
        }
    });
    const topRoutes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="flex flex-col h-full gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white mb-1">TRAFFIC ANALYTICS</h1>
                <p className="text-[var(--text-secondary)] text-sm">Understand traffic movement, speed and congestion across monitored locations.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="metric-card">
                    <div className="label-xs mb-2">VEHICLES DETECTED</div>
                    <div className="text-3xl font-bold text-white">{totalDetections}</div>
                </div>
                <div className="metric-card">
                    <div className="label-xs mb-2 text-blue-400">ACTIVE VEHICLES</div>
                    <div className="text-3xl font-bold text-blue-100">{activeVehicles}</div>
                </div>
                <div className="metric-card">
                    <div className="label-xs mb-2 text-amber-400">AVERAGE SPEED</div>
                    <div className="text-3xl font-bold text-amber-100">{avgSpeed} <span className="text-sm font-medium text-[var(--text-muted)]">km/h</span></div>
                </div>
                <div className="metric-card">
                    <div className="label-xs mb-2 text-purple-400">TRAFFIC FLOW</div>
                    <div className="text-3xl font-bold text-purple-100">{trafficFlow} <span className="text-sm font-medium text-[var(--text-muted)]">veh/hr</span></div>
                </div>
                <div className="metric-card border-l-[3px] border-l-amber-500">
                    <div className="label-xs mb-2 text-amber-500">CONGESTION</div>
                    <div className="text-2xl font-bold text-white tracking-wider">{congestion}</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Flow Chart */}
                <div className="col-span-2 flex flex-col gap-6">
                    <div className="panel p-5 flex-1 flex flex-col">
                        <div className="label-xs mb-4">TRAFFIC FLOW OVER TIME</div>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={flowChartData}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" stroke="var(--border)" fontSize={10} tick={{fill: 'var(--text-muted)'}} />
                                    <YAxis stroke="var(--border)" fontSize={10} tick={{fill: 'var(--text-muted)'}} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', borderRadius: '6px' }}
                                        itemStyle={{ color: '#fff', fontSize: '13px' }}
                                    />
                                    <Area type="monotone" dataKey="count" stroke="var(--blue)" fillOpacity={1} fill="url(#colorCount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 h-64">
                        <div className="panel p-5 flex flex-col">
                            <div className="label-xs mb-4">VEHICLES BY CAMERA</div>
                            <div className="flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={camChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} tick={{fill: 'var(--text-secondary)'}} width={60} />
                                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }} />
                                        <Bar dataKey="count" fill="var(--blue)" radius={[0, 4, 4, 0]} onClick={(data) => navigate('/cameras')} style={{cursor:'pointer'}}>
                                            {camChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.count > 15 ? '#3b82f6' : 'var(--blue)'} opacity={0.8} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="panel p-5 flex flex-col">
                            <div className="label-xs mb-4">AVERAGE SPEED BY CAMERA</div>
                            <div className="flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={camChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                        <XAxis type="number" domain={[0, 100]} hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} tick={{fill: 'var(--text-secondary)'}} width={60} />
                                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }} />
                                        <Bar dataKey="avgSpeed" fill="var(--green)" radius={[0, 4, 4, 0]}>
                                            {camChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.avgSpeed < 35 ? '#ef4444' : entry.avgSpeed > 60 ? '#f59e0b' : '#22c55e'} opacity={0.8} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="col-span-1 flex flex-col gap-6">
                    <div className="panel p-0 flex-1 flex flex-col overflow-hidden">
                        <div className="panel-header">
                            <div className="label-xs">CITY CONGESTION</div>
                        </div>
                        <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
                            {camChartData.map(c => {
                                let status = "LOW";
                                let color = "text-green-400";
                                let bg = "bg-green-400/10 border-green-400/20";
                                
                                if (c.avgSpeed > 0 && c.avgSpeed < 35) {
                                    status = "HIGH"; color = "text-red-400"; bg = "bg-red-400/10 border-red-400/20";
                                } else if (c.avgSpeed > 0 && c.avgSpeed < 50) {
                                    status = "MEDIUM"; color = "text-amber-400"; bg = "bg-amber-400/10 border-amber-400/20";
                                }

                                return (
                                    <div key={c.name} className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate('/cameras')}>
                                        <div>
                                            <div className="mono text-xs font-semibold text-white">{c.name}</div>
                                            <div className="text-[11px] text-[var(--text-muted)]">{c.fullName}</div>
                                        </div>
                                        <div className={`text-[10px] font-bold px-2 py-1 rounded border ${color} ${bg}`}>
                                            {status}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="panel p-0 flex-1 flex flex-col overflow-hidden">
                        <div className="panel-header">
                            <div className="label-xs">MOST USED VEHICLE ROUTES</div>
                        </div>
                        <div className="p-3 overflow-y-auto custom-scrollbar flex-1">
                            {topRoutes.length === 0 && <div className="text-center text-sm text-[var(--text-muted)] mt-10">Accumulating route data...</div>}
                            {topRoutes.map(([route, count], i) => (
                                <div key={i} className="mb-4 last:mb-0 cursor-pointer group" onClick={() => navigate('/tracking')}>
                                    <div className="mono text-[11px] text-blue-300 mb-1 group-hover:text-blue-400 transition-colors">
                                        {route.split(' → ').map((n, idx, arr) => (
                                            <span key={idx}>
                                                {n}
                                                {idx < arr.length - 1 && <span className="text-[var(--text-muted)] mx-1">→</span>}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="text-xs text-[var(--text-secondary)]">{count} vehicles</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
