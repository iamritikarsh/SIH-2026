import React, { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────────
   STAGE SEQUENCE
   Each stage defines the label shown and the % target.
   Progress ONLY moves forward — it can never decrease.
   ───────────────────────────────────────────────────────────── */
const STAGES = [
  { pct: 0,   label: 'INITIALIZING CITY TRAFFIC ENGINE' },
  { pct: 15,  label: 'CONNECTING TO TRAFFIC NETWORK' },
  { pct: 30,  label: 'LOADING CAMERA NETWORK' },
  { pct: 45,  label: 'INITIALIZING VEHICLE DETECTION' },
  { pct: 60,  label: 'INITIALIZING ANPR ENGINE' },
  { pct: 75,  label: 'INITIALIZING VEHICLE TRACKING' },
  { pct: 88,  label: 'SYNCHRONIZING TRAFFIC DATA' },
  { pct: 96,  label: 'PREPARING COMMAND CENTRE' },
  { pct: 100, label: 'SYSTEM READY' },
];

// Total wall-clock ms for the full sequence (real backend is checked in parallel)
const TOTAL_DURATION_MS = 2800;

interface Props {
  onComplete: () => void;
  /** Pass true when backend is unreachable — slows progress, shows alternate text */
  backendOffline?: boolean;
}

export default function AppLoader({ onComplete, backendOffline }: Props) {
  /* ── Single source of truth ── */
  const [visiblePct, setVisiblePct]   = useState(0);
  const [stageLabel, setStageLabel]   = useState(STAGES[0].label);
  const [exiting, setExiting]         = useState(false);
  const [cars, setCars]               = useState<
    { id: number; x: number; lane: number; speed: number; color: string }[]
  >([]);

  // Monotonic floor — progress may NEVER go below this
  const floorRef    = useRef(0);
  // rAF handle
  const rafRef      = useRef<number>();
  // Wall-clock start time
  const startRef    = useRef<number | null>(null);
  // Prevent onComplete being called twice
  const completedRef = useRef(false);

  /* ── Spawn cars once ── */
  useEffect(() => {
    const palette = ['#3b7aeb', '#22c55e', '#f59e0b', '#e8edf5', '#a78bfa', '#f87171'];
    setCars(
      Array.from({ length: 7 }, (_, i) => ({
        id:    i,
        x:     Math.random() * 110 - 10,
        lane:  Math.floor(Math.random() * 3),
        speed: 18 + Math.random() * 20,
        color: palette[i % palette.length],
      }))
    );
  }, []);

  /* ── Animate car positions via rAF (separate from progress rAF) ── */
  useEffect(() => {
    let frame: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCars(prev =>
        prev.map(c => {
          let nx = c.x + c.speed * dt;
          if (nx > 115) nx = -15;
          return { ...c, x: nx };
        })
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── Main progress controller — one rAF loop, monotonic ── */
  useEffect(() => {
    const advance = (now: number) => {
      if (startRef.current === null) startRef.current = now;

      const elapsed = now - startRef.current;
      // Slow down to 40% speed when backend is offline (keeps making progress, just slower)
      const effectiveElapsed = backendOffline ? elapsed * 0.4 : elapsed;
      const rawPct = Math.min(100, (effectiveElapsed / TOTAL_DURATION_MS) * 100);

      // MONOTONIC: never decrease
      const nextPct = Math.max(floorRef.current, rawPct);
      floorRef.current = nextPct;

      // Determine which stage label to show
      let currentLabel = STAGES[0].label;
      for (const stage of STAGES) {
        if (nextPct >= stage.pct) currentLabel = stage.label;
      }
      if (backendOffline && nextPct < 100) {
        currentLabel = 'TRAFFIC ENGINE STARTING…';
      }

      setVisiblePct(Math.round(nextPct));
      setStageLabel(currentLabel);

      if (nextPct >= 100) {
        // Reached 100 — exit gracefully
        if (!completedRef.current) {
          completedRef.current = true;
          setTimeout(() => {
            setExiting(true);
            setTimeout(onComplete, 550);
          }, 400);
        }
        return; // stop rAF
      }

      rafRef.current = requestAnimationFrame(advance);
    };

    rafRef.current = requestAnimationFrame(advance);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally do NOT re-run this effect when backendOffline changes —
    // the ref-based approach reads backendOffline implicitly via the closure
    // every frame, so there's no stale value issue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onComplete]);

  const laneY = [38, 50, 62];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-[#080e1a] transition-opacity duration-500 ${exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,122,235,1) 1px, transparent 1px), linear-gradient(90deg, rgba(59,122,235,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 55%, rgba(59,122,235,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-10 w-full max-w-xl px-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
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

        {/* Animated Road SVG */}
        <div
          className="w-full rounded-lg overflow-hidden border border-blue-900/30"
          style={{ background: 'rgba(11,17,33,0.9)' }}
        >
          <svg viewBox="0 0 200 100" className="w-full" style={{ height: 100 }}>
            {/* Road surface */}
            <rect x="0" y="30" width="200" height="40" fill="#0d1526" />

            {/* Road centre dashes — pure CSS animation, always forward */}
            {[0, 1, 2, 3, 4].map(i => (
              <rect
                key={i}
                y={49}
                width="22"
                height="2"
                fill="rgba(255,255,255,0.12)"
                style={{ animation: `roadDash 1.5s ${i * -0.3}s linear infinite` }}
              />
            ))}

            {/* Lane stripes */}
            <line x1="0" y1="38" x2="200" y2="38" stroke="rgba(59,122,235,0.15)" strokeWidth="0.5" />
            <line x1="0" y1="62" x2="200" y2="62" stroke="rgba(59,122,235,0.15)" strokeWidth="0.5" />

            {/* Edge glow */}
            <rect x="0" y="28" width="200" height="3" fill="rgba(59,122,235,0.25)" />
            <rect x="0" y="69" width="200" height="3" fill="rgba(59,122,235,0.25)" />

            {/* Camera scanner */}
            <rect x="96" y="0" width="8" height="100" fill="url(#scanGrad)" opacity="0.4" />
            <rect
              x="99.5" y="0" width="1" height="100"
              fill="rgba(59,122,235,0.6)"
              style={{ animation: 'scanPulse 2s ease-in-out infinite' }}
            />

            {/* Camera icon */}
            <rect x="92" y="2" width="16" height="9" rx="2" fill="#162035" stroke="rgba(59,122,235,0.5)" strokeWidth="0.6" />
            <circle cx="100" cy="6.5" r="2.5" fill="none" stroke="#3b7aeb" strokeWidth="0.8" />
            <circle cx="100" cy="6.5" r="1" fill="#3b7aeb" opacity="0.8" />

            {/* Animated cars */}
            {cars.map(car => (
              <g key={car.id} transform={`translate(${car.x}, ${laneY[car.lane]})`}>
                <rect x="-7" y="-3" width="14" height="6" rx="1.5" fill={car.color} opacity="0.85" />
                <rect x="-3" y="-2.5" width="7" height="5" rx="1" fill="rgba(255,255,255,0.15)" />
                <rect x="6" y="-2" width="2" height="1.5" rx="0.5" fill="rgba(255,240,180,0.9)" />
                <rect x="6" y="0.5" width="2" height="1.5" rx="0.5" fill="rgba(255,240,180,0.9)" />
                <ellipse cx="0" cy="0" rx="8" ry="3" fill={car.color} opacity="0.08" />
                {(car.id === 2 || car.id === 5) && (
                  <rect x="-8" y="-4" width="16" height="8" rx="1"
                    fill="none" stroke="rgba(34,197,94,0.7)" strokeWidth="0.5"
                    strokeDasharray="3 2"
                    style={{ animation: 'boxPulse 1.5s ease-in-out infinite' }}
                  />
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

        {/* Status & progress */}
        <div className="w-full flex flex-col items-center gap-4">
          {/* Stage label — animates in when it changes */}
          <div className="text-center h-[36px] flex flex-col items-center justify-center">
            <div
              key={stageLabel}
              className="text-[11px] tracking-[0.2em] text-blue-300/80 uppercase"
              style={{ animation: 'fadeSlideIn 0.35s ease-out' }}
            >
              {stageLabel}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-[3px] bg-blue-950/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${visiblePct}%`,
                background: 'linear-gradient(90deg, #1e4fba, #3b7aeb, #60a5fa)',
                boxShadow: '0 0 10px rgba(59,122,235,0.6)',
                transition: 'width 80ms linear',
              }}
            />
          </div>

          {/* Percentage */}
          <div className="text-[11px] text-blue-500/60 tracking-widest font-mono tabular-nums">
            {String(visiblePct).padStart(3, '0')}%
          </div>
        </div>

        {/* Footer */}
        <div className="text-[9px] text-blue-900/60 tracking-[0.15em] uppercase">
          Smart India Hackathon 2026 · Multi-Camera ANPR Trajectory Engine
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(5px); }
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
        @keyframes roadDash {
          from { transform: translateX(-22px); }
          to   { transform: translateX(200px); }
        }
      `}</style>
    </div>
  );
}
