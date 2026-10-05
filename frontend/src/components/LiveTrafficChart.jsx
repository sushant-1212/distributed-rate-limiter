import React, { useEffect, useRef } from 'react';
import { Activity, Clock } from 'lucide-react';

export default function LiveTrafficChart({ history = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 200;
    const padTop = 15;
    const padBottom = 25;
    const padLeft = 35;
    const padRight = 15;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    // Build rolling 30-second window anchored to current real time
    const nowSec = Math.floor(Date.now() / 1000);
    const histMap = new Map();
    if (Array.isArray(history)) {
      for (const b of history) {
        if (b && b.sec) histMap.set(b.sec, b);
      }
    }

    const windowSlots = [];
    let maxRps = 10;
    for (let s = nowSec - 29; s <= nowSec; s++) {
      const existing = histMap.get(s);
      const allowed = existing ? existing.allowed || 0 : 0;
      const blocked = existing ? existing.blocked || 0 : 0;
      const total = allowed + blocked;
      if (total > maxRps) maxRps = total;
      windowSlots.push({ sec: s, allowed, blocked, total });
    }
    maxRps = Math.ceil(maxRps / 5) * 5;

    // Horizontal Grid Lines & Y-Axis Labels
    ctx.strokeStyle = '#161e2e';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const yVal = Math.round((maxRps / 4) * i);
      const yPos = padTop + plotH - (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();
      ctx.fillText(yVal.toString(), padLeft - 8, yPos + 3);
    }

    const step = plotW / (windowSlots.length - 1);

    // 1. Draw Allowed Area & Line (Emerald)
    ctx.beginPath();
    windowSlots.forEach((d, i) => {
      const x = padLeft + i * step;
      const y = padTop + plotH - (d.allowed / maxRps) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle Area Fill for Allowed
    ctx.lineTo(padLeft + (windowSlots.length - 1) * step, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fill();

    // 2. Draw Blocked Line (Crimson)
    ctx.beginPath();
    windowSlots.forEach((d, i) => {
      const x = padLeft + i * step;
      const y = padTop + plotH - (d.blocked / maxRps) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [history]);

  return (
    <div className="glass-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
      {/* Header & Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="#38bdf8" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Live Gateway Traffic Stream
          </h2>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <Clock size={12} /> Rolling 30s Window
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'var(--emerald)'
            }}></span>
            <span style={{ color: 'var(--text-muted)' }}>Allowed (200 OK)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'var(--crimson)'
            }}></span>
            <span style={{ color: 'var(--text-muted)' }}>Throttled (429)</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ width: '100%', height: 200, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}
