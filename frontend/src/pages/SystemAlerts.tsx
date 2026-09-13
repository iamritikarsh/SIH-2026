import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Alert } from '../types';
import { AlertTriangle, Car, Video, Activity, CheckCircle2, ChevronRight, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SystemAlerts() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'RESOLVED'>('ALL');
    const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
    const navigate = useNavigate();

    const fetchAlerts = async () => {
        try {
            const data = await api.getAlerts();
            setAlerts(data);
            if (selectedAlert) {
                const updated = data.find((a: Alert) => a.id === selectedAlert.id);
                if (updated) setSelectedAlert(updated);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 1500);
        return () => clearInterval(interval);
    }, [selectedAlert]);

    const activeAlerts = alerts.filter(a => a.status !== 'RESOLVED');
    const highPriority = activeAlerts.filter(a => a.type === 'HIGH_SPEED' || a.type === 'UNUSUAL_ROUTE');
    const mediumPriority = activeAlerts.filter(a => a.type === 'CONGESTION' || a.type === 'VEHICLE_MATCHED');
    const resolved = alerts.filter(a => a.status === 'RESOLVED');

    const filteredAlerts = alerts.filter(a => {
        if (filter === 'ALL') return a.status !== 'RESOLVED';
        if (filter === 'HIGH') return a.status !== 'RESOLVED' && (a.type === 'HIGH_SPEED' || a.type === 'UNUSUAL_ROUTE');
        if (filter === 'MEDIUM') return a.status !== 'RESOLVED' && (a.type === 'CONGESTION' || a.type === 'VEHICLE_MATCHED');
        if (filter === 'RESOLVED') return a.status === 'RESOLVED';
        return true;
    });

    const getIcon = (type: string) => {
        switch (type) {
            case 'HIGH_SPEED': return <AlertTriangle className="text-red-500" size={18} />;
            case 'UNUSUAL_ROUTE': return <Activity className="text-red-500" size={18} />;
            case 'CONGESTION': return <Video className="text-amber-500" size={18} />;
            case 'VEHICLE_MATCHED': return <Car className="text-blue-500" size={18} />;
            default: return <AlertTriangle className="text-amber-500" size={18} />;
        }
    };

    const getPriority = (type: string) => {
        if (['HIGH_SPEED', 'UNUSUAL_ROUTE'].includes(type)) return <span className="badge-live">HIGH</span>;
        return <span className="badge-sim text-amber-500 border-amber-500/20 bg-amber-500/10">MEDIUM</span>;
    };

    const handleResolve = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await api.resolveAlert(id);
        fetchAlerts();
        if (selectedAlert?.id === id) {
            setSelectedAlert(null);
        }
    };

    const handleNavigate = (alert: Alert) => {
        if (alert.type === 'HIGH_SPEED' || alert.type === 'UNUSUAL_ROUTE' || alert.type === 'VEHICLE_MATCHED') {
            navigate(`/tracking?q=${alert.reference_id}`);
        } else if (alert.type === 'CONGESTION') {
            navigate('/analytics');
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-1">SYSTEM ALERTS</h1>
                <p className="text-[var(--text-secondary)] text-sm">Monitor important traffic events detected by the system.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="metric-card flex flex-col justify-center">
                    <div className="label-xs mb-1">ACTIVE ALERTS</div>
                    <div className="text-2xl font-semibold">{activeAlerts.length}</div>
                </div>
                <div className="metric-card flex flex-col justify-center">
                    <div className="label-xs mb-1 text-red-400">HIGH PRIORITY</div>
                    <div className="text-2xl font-semibold text-red-100">{highPriority.length}</div>
                </div>
                <div className="metric-card flex flex-col justify-center">
                    <div className="label-xs mb-1 text-amber-400">MEDIUM</div>
                    <div className="text-2xl font-semibold text-amber-100">{mediumPriority.length}</div>
                </div>
                <div className="metric-card flex flex-col justify-center">
                    <div className="label-xs mb-1 text-green-400">RESOLVED</div>
                    <div className="text-2xl font-semibold text-green-100">{resolved.length}</div>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Main List */}
                <div className="flex-1 panel flex flex-col overflow-hidden">
                    <div className="panel-header">
                        <div className="flex items-center gap-2">
                            <Filter size={14} className="text-[var(--text-muted)]" />
                            <span className="text-sm font-medium">Filter</span>
                        </div>
                        <div className="flex gap-2">
                            {['ALL', 'HIGH', 'MEDIUM', 'RESOLVED'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f as any)}
                                    className={`px-3 py-1 rounded text-xs font-semibold tracking-wider transition-colors ${
                                        filter === f 
                                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                            : 'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-white'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {filteredAlerts.length === 0 ? (
                            <div className="p-8 text-center text-[var(--text-muted)] text-sm">No alerts found.</div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="w-10"></th>
                                        <th>Alert Type</th>
                                        <th>Description</th>
                                        <th>Time</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAlerts.map(alert => (
                                        <tr 
                                            key={alert.id} 
                                            onClick={() => setSelectedAlert(alert)}
                                            className={`cursor-pointer ${selectedAlert?.id === alert.id ? 'bg-white/[0.04]' : ''}`}
                                        >
                                            <td className="text-center">{getIcon(alert.type)}</td>
                                            <td className="font-semibold text-white text-xs">{alert.title}</td>
                                            <td className="text-[var(--text-secondary)]">{alert.message}</td>
                                            <td className="mono text-xs">{new Date(alert.timestamp).toLocaleTimeString()}</td>
                                            <td>{getPriority(alert.type)}</td>
                                            <td>
                                                {alert.status === 'RESOLVED' 
                                                    ? <span className="text-green-500 text-xs font-semibold flex items-center gap-1"><CheckCircle2 size={12}/> RESOLVED</span> 
                                                    : <span className="text-amber-500 text-xs font-semibold">ACTIVE</span>}
                                            </td>
                                            <td className="text-right text-[var(--text-muted)]"><ChevronRight size={16} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Details Drawer */}
                {selectedAlert && (
                    <div className="w-[320px] flex-none panel flex flex-col bg-[var(--bg-surface)]">
                        <div className="panel-header flex-col items-start gap-2 bg-[var(--bg-card)]">
                            <div className="flex items-center justify-between w-full">
                                <span className="label-xs">ALERT DETAILS</span>
                                <button onClick={() => setSelectedAlert(null)} className="text-[var(--text-muted)] hover:text-white">✕</button>
                            </div>
                            <div className="text-lg font-bold text-white flex items-center gap-2">
                                {getIcon(selectedAlert.type)} {selectedAlert.title}
                            </div>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto">
                            <div className="space-y-4">
                                <div>
                                    <div className="label-xs mb-1">Time</div>
                                    <div className="text-sm font-medium">{new Date(selectedAlert.timestamp).toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="label-xs mb-1">Reference</div>
                                    <div className="mono text-sm px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded inline-block">
                                        {selectedAlert.reference_id || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <div className="label-xs mb-1">Description</div>
                                    <div className="text-sm text-[var(--text-secondary)] bg-[var(--bg-base)] p-3 rounded border border-[var(--border-subtle)]">
                                        {selectedAlert.message}
                                    </div>
                                </div>
                                <div>
                                    <div className="label-xs mb-1">Priority</div>
                                    <div>{getPriority(selectedAlert.type)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                            <button 
                                onClick={() => handleNavigate(selectedAlert)}
                                className="w-full py-2 bg-[var(--blue-dim)] border border-[var(--blue)] text-[var(--blue)] hover:bg-blue-600 hover:text-white transition-colors rounded text-sm font-semibold tracking-wide"
                            >
                                {selectedAlert.type === 'CONGESTION' ? 'VIEW ANALYTICS' : 'TRACK VEHICLE'}
                            </button>
                            {selectedAlert.status !== 'RESOLVED' && (
                                <button 
                                    onClick={(e) => handleResolve(selectedAlert.id, e)}
                                    className="w-full py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-green-600/20 hover:border-green-500 hover:text-green-400 transition-colors rounded text-sm font-semibold tracking-wide flex justify-center items-center gap-2"
                                >
                                    <CheckCircle2 size={16} /> MARK RESOLVED
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
