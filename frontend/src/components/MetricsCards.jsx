import React from 'react';
import { Gauge, CheckCircle2, ShieldAlert, Cpu, Layers, ArrowUpRight } from 'lucide-react';

export default function MetricsCards({ totals, history, systemState }) {
  // Calculate real-time throughput from last 2 seconds
  const nowSec = Math.floor(Date.now() / 1000);
  const recentBins = Array.isArray(history) ? history.filter((b) => b && b.sec >= nowSec - 2) : [];
  const recentSum = recentBins.reduce((acc, b) => acc + (b.allowed || 0) + (b.blocked || 0), 0);
  const rps = recentBins.length > 0 ? Math.round(recentSum / recentBins.length) : 0;

  const total = totals?.total || 0;
  const allowed = totals?.allowed || 0;
  const blocked = totals?.blocked || 0;

  const l1HitRate = systemState?.hierarchicalL1?.l1HitRatePercent ?? '0.0';
  const inFlight = systemState?.concurrency?.inFlight || 0;
  const currentLimit = systemState?.concurrency?.currentLimit || 25;
  const concurrencyPercent = Math.min(100, Math.round((inFlight / currentLimit) * 100));

  const cards = [
    {
      label: 'Throughput',
      value: rps,
      unit: 'req/s',
      subtext: 'Real-time gateway rate',
      icon: Gauge,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.08)',
      border: 'rgba(56, 189, 248, 0.2)'
    },
    {
      label: 'Total Processed',
      value: total.toLocaleString(),
      unit: '',
      subtext: 'Cumulative gateway events',
      icon: Layers,
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.08)',
      border: 'rgba(148, 163, 184, 0.2)'
    },
    {
      label: 'Allowed (200 OK)',
      value: allowed.toLocaleString(),
      unit: '',
      subtext: 'Within quota window',
      icon: CheckCircle2,
      color: 'var(--emerald)',
      bg: 'var(--emerald-bg)',
      border: 'var(--emerald-border)'
    },
    {
      label: 'Throttled (429)',
      value: blocked.toLocaleString(),
      unit: '',
      subtext: 'RFC 6585 limit enforced',
      icon: ShieldAlert,
      color: 'var(--crimson)',
      bg: 'var(--crimson-bg)',
      border: 'var(--crimson-border)'
    },
    {
      label: 'L1 Cache Hit Rate',
      value: `${l1HitRate}%`,
      unit: '',
      subtext: 'Sub-0.05ms local leases',
      icon: Cpu,
      color: 'var(--amber)',
      bg: 'var(--amber-bg)',
      border: 'var(--amber-border)'
    },
    {
      label: 'Adaptive Concurrency',
      value: `${inFlight} / ${currentLimit}`,
      unit: '',
      subtext: "Netflix TCP Vegas (Little's Law)",
      icon: ArrowUpRight,
      color: 'var(--purple)',
      bg: 'var(--purple-bg)',
      border: 'var(--purple-border)',
      progress: concurrencyPercent
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      gap: 14,
      marginBottom: 20
    }}>
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className="glass-card"
            style={{
              padding: '16px 18px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                {c.label}
              </span>
              <div style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                width: 28,
                height: 28,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon size={15} color={c.color} />
              </div>
            </div>

            <div style={{
              fontSize: 24,
              fontWeight: 700,
              color: c.color,
              fontFamily: 'JetBrains Mono',
              display: 'flex',
              alignItems: 'baseline',
              gap: 4
            }}>
              {c.value}
              {c.unit && (
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>
                  {c.unit}
                </span>
              )}
            </div>

            {c.progress !== undefined ? (
              <div style={{ marginTop: 8 }}>
                <div style={{
                  height: 4,
                  background: 'var(--border-subtle)',
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${c.progress}%`,
                    height: '100%',
                    background: c.color,
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  {c.subtext}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                {c.subtext}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
