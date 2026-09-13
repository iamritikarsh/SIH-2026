import React, { useEffect, useState } from 'react';

/* ─────────────────────────────────────────────────────────────
   STEP SEQUENCE — each step has a label, duration (ms) and
   a minimum % progress to show before it completes.
   ───────────────────────────────────────────────────────────── */
const STEPS = [
  { label: 'Connecting to camera network…',    ms: 250 },
  { label: 'Loading vehicle tracking module…', ms: 250 },
  { label: 'Initializing ANPR engine…',        ms: 250 },
  { label: 'Synchronizing traffic data…',      ms: 250 },
  { label: 'Preparing analytics pipeline…',    ms: 250 },
  { label: 'Calibrating cross-camera match…',  ms: 250 },
  { label: 'SYSTEM READY',                     ms: 200 },
];

const TOTAL_MS = STEPS.reduce((s, x) => s + x.ms, 0);

interface Props {
  /** Called once the loader finishes and the app should appear */
  onComplete: () => void;
  /** If the backend check has already failed, skip to error */
  backendOffline?: boolean;
}

export default function AppLoader({ onComplete, backendOffline }: Props) {
  const [stepIdx, setStepIdx]     = useState(0);
  const [progress, setProgress]   = useState(0);
  const [exiting, setExiting]     = useState(false);
  const [cars, setCars]           = useState<{ id: number; x: number; lane: number; speed: number; color: string }[]>([]);

  /* ── Generate animated cars ── */
  useEffect(() => {
    const palette = ['#3b7aeb','#22c55e','#f59e0b','#e8edf5','#a78bfa','#f87171'];
    setCars(
      Array.from({ length: 7 }, (_, i) => ({
        id:    i,
        x:     Math.random() * 110 - 10,          // start off-screen left  
        lane:  Math.floor(Math.random() * 3),      // 0 top / 1 mid / 2 bot
        speed: 18 + Math.random() * 20,            // pixels per second (SVG coords)
        color: palette[i % palette.length],
      }))
    );
  }, []);

  /* ── Animate car positions ── */
  useEffect(() => {
    let frame: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCars(prev => prev.map(c => {
        let nx = c.x + c.speed * dt;
        if (nx > 115) nx = -15;   // wrap around
        return { ...c, x: nx };
      }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── Step & progress logic ── */
  useEffect(() => {
    if (backendOffline) return;

    let elapsed = 0;
    let currentStep = 0;
    let cancelled = false;

    const runStep = (idx: number) => {
      if (cancelled || idx >= STEPS.length) return;
      setStepIdx(idx);
      const stepMs = STEPS[idx].ms;

      let stepElapsed = 0;
      const interval = setInterval(() => {
        stepElapsed += 16;
        if (cancelled) { clearInterval(interval); return; }
        const totalElapsed = elapsed + stepElapsed;
        setProgress(Math.min(100, Math.round((totalElapsed / TOTAL_MS) * 100)));
        if (stepElapsed >= stepMs) {
          clearInterval(interval);
          elapsed += stepMs;
          if (idx === STEPS.length - 1) {
            // All steps done — brief pause then exit
            setTimeout(() => {
              if (!cancelled) {
                setProgress(100);
                setExiting(true);
                setTimeout(onComplete, 650);
              }
            }, 250);
          } else {
            runStep(idx + 1);
          }
        }
      }, 16);
    };

    runStep(0);
    return () => { cancelled = true; };
  }, [backendOffline, onComplete]);

  /* ── Lane y-positions ── */
  const laneY = [38, 50, 62];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-[#080e1a] transition-opacity duration-500 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {/* ── Grid overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,122,235,1) 1px, transparent 1px), linear-gradient(90deg, rgba(59,122,235,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Radial glow ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 55%, rgba(59,122,235,0.07) 0%, transparent 70%)',
        }}
      />

      {/* ── Content ── */}
      <div className="relative flex flex-col items-center gap-10 w-full max-w-xl px-8">

        {/* Logo block */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            {/* City grid icon */}
            <svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" className="text-blue-400">
              <rect x="3" y="3" width="8" height="8" rx="1" />
              <rect x="17" y="3" width="8" height="8" rx="1" />
              <rect x="3" y="17" width="8" height="8" rx="1" />
              <rect x="17" y="17" width="8" height="8" rx="1" />
              <line x1="14" y1="0" x2="14" y2="28" strokeDasharray="2 4" />
              <line x1="0" y1="14" x2="28" y2="14" strokeDasharray="2 4" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-white text-lg font-bold tracking-[0.18em] uppercase">
              City Traffic
            </div>
            <div className="text-blue-400/70 text-[10px] tracking-[0.25em] uppercase mt-0.5">
              Intelligence Engine
            </div>
          </div>
        </div>

        {/* ── Animated Road SVG ── */}
        <div className="w-full rounded-lg overflow-hidden border border-blue-900/30"
          style={{ background: 'rgba(11,17,33,0.9)' }}>
          <svg viewBox="0 0 200 100" className="w-full" style={{ height: 100 }}>
            {/* Road surface */}
            <rect x="0" y="30" width="200" height="40" fill="#0d1526" />

            {/* Road dashes — animated */}
            {[0, 1, 2, 3, 4].map(i => (
              <rect
                key={i}
                x={0} y={49}
                width="22" height="2"
                fill="rgba(255,255,255,0.12)"
                style={{
                  transform: `translateX(${((i * 45 + Date.now() * 0) % 200)}px)`,
                  animation: `dash-${i} 1.4s linear infinite`,
                }}
              />
            ))}

            {/* Lane stripes */}
            <line x1="0" y1="38" x2="200" y2="38" stroke="rgba(59,122,235,0.15)" strokeWidth="0.5" />
            <line x1="0" y1="62" x2="200" y2="62" stroke="rgba(59,122,235,0.15)" strokeWidth="0.5" />

            {/* Edge glow */}
            <rect x="0" y="28" width="200" height="3" fill="rgba(59,122,235,0.25)" />
            <rect x="0" y="69" width="200" height="3" fill="rgba(59,122,235,0.25)" />

            {/* Camera scanner line */}
            <rect
              x="96" y="0" width="8" height="100"
              fill="url(#scanGrad)" opacity="0.4"
            />
            <rect x="99.5" y="0" width="1" height="100" fill="rgba(59,122,235,0.6)"
              style={{ animation: 'scanPulse 2s ease-in-out infinite' }} />

            {/* Camera icon top */}
            <rect x="92" y="2" width="16" height="9" rx="2" fill="#162035" stroke="rgba(59,122,235,0.5)" strokeWidth="0.6" />
            <circle cx="100" cy="6.5" r="2.5" fill="none" stroke="#3b7aeb" strokeWidth="0.8" />
            <circle cx="100" cy="6.5" r="1" fill="#3b7aeb" opacity="0.8" />

            {/* Animated cars */}
            {cars.map(car => (
              <g key={car.id} transform={`translate(${car.x}, ${laneY[car.lane]})`}>
                {/* Car body */}
                <rect x="-7" y="-3" width="14" height="6" rx="1.5" fill={car.color} opacity="0.85" />
                {/* Windshield */}
                <rect x="-3" y="-2.5" width="7" height="5" rx="1" fill="rgba(255,255,255,0.15)" />
                {/* Headlights */}
                <rect x="6" y="-2" width="2" height="1.5" rx="0.5" fill="rgba(255,240,180,0.9)" />
                <rect x="6" y="0.5" width="2" height="1.5" rx="0.5" fill="rgba(255,240,180,0.9)" />
                {/* Glow */}
                <ellipse cx="0" cy="0" rx="8" ry="3" fill={car.color} opacity="0.08" />
                {/* ANPR detection box — show on car 2 and 5 */}
                {(car.id === 2 || car.id === 5) && (
                  <rect x="-8" y="-4" width="16" height="8" rx="1"
                    fill="none" stroke="rgba(34,197,94,0.7)" strokeWidth="0.5"
                    strokeDasharray="3 2"
                    style={{ animation: 'boxPulse 1.5s ease-in-out infinite' }} />
                )}
              </g>
            ))}

            <defs>
              <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b7aeb" stopOpacity="0" />
                <stop offset="50%" stopColor="#3b7aeb" stopOpacity="1" />
                <stop offset="100%" stopColor="#3b7aeb" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* ── Status text ── */}
        <div className="w-full flex flex-col items-center gap-5">
          <div className="text-center">
            <div className="text-[10px] tracking-[0.2em] text-blue-400/60 uppercase mb-2">
              Initializing City Traffic Engine
            </div>
            <div
              key={stepIdx}
              className="text-[13px] text-blue-300/90 tracking-wide min-h-[20px]"
              style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
            >
              {backendOffline
                ? 'Backend temporarily unavailable — retrying…'
                : STEPS[stepIdx]?.label}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-[2px] bg-blue-950/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${backendOffline ? 30 : progress}%`,
                background: backendOffline
                  ? 'rgba(239,68,68,0.7)'
                  : 'linear-gradient(90deg, #1e4fba, #3b7aeb, #60a5fa)',
                boxShadow: '0 0 8px rgba(59,122,235,0.5)',
              }}
            />
          </div>

          {/* Progress label */}
          <div className="text-[10px] text-blue-500/50 tracking-widest">
            {backendOffline ? 'CONNECTING…' : `${progress}%`}
          </div>
        </div>

        {/* Footer */}
        <div className="text-[9px] text-blue-900/60 tracking-[0.15em] uppercase">
          Smart India Hackathon 2026 · Multi-Camera ANPR Trajectory Engine
        </div>
      </div>

      {/* ── Keyframes injected as style tag ── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes boxPulse {
          0%, 100% { stroke-opacity: 0.4; }
          50%       { stroke-opacity: 1; }
        }
        @keyframes dash-0 { from { transform: translateX(-90px);  } to { transform: translateX(200px); } }
        @keyframes dash-1 { from { transform: translateX(-45px);  } to { transform: translateX(200px); } }
        @keyframes dash-2 { from { transform: translateX(0px);    } to { transform: translateX(200px); } }
        @keyframes dash-3 { from { transform: translateX(45px);   } to { transform: translateX(200px); } }
        @keyframes dash-4 { from { transform: translateX(90px);   } to { transform: translateX(200px); } }
        @keyframes dash-0 { animation-duration: 1.6s; }
        @keyframes dash-1 { animation-duration: 1.7s; }
        @keyframes dash-2 { animation-duration: 1.4s; }
        @keyframes dash-3 { animation-duration: 1.5s; }
        @keyframes dash-4 { animation-duration: 1.8s; }
      `}</style>
    </div>
  );
}
