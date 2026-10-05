import React from 'react';
import { Shield, Activity, Database, AlertTriangle, ExternalLink, Zap } from 'lucide-react';

export default function Header({ systemState }) {
  const isRedisOnline = systemState?.redis?.connected ?? false;
  const isCircuitOpen = systemState?.circuitBreaker?.isOpen ?? false;
  const circuitState = systemState?.circuitBreaker?.state ?? 'CLOSED';
  const l1HitRate = systemState?.hierarchicalL1?.l1HitRatePercent ?? '0.0';

  return (
    <header style={{
      background: 'rgba(12, 16, 23, 0.85)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '12px 24px'
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            width: 38,
            height: 38,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(37, 99, 235, 0.4)'
          }}>
            <Shield size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
                TrafficShield
              </span>
              <span style={{
                fontSize: 11,
                background: 'rgba(37, 99, 235, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                padding: '1px 6px',
                borderRadius: 4,
                fontWeight: 600
              }}>
                v2.0 Distributed
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Two-Tier Hierarchical Flow Control & Rate Limiting Gateway
            </div>
          </div>
        </div>

        {/* Live Cluster Health Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Redis Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            fontSize: 12
          }}>
            <Database size={14} color={isRedisOnline ? 'var(--emerald)' : 'var(--crimson)'} />
            <span className={`pulse-dot ${isRedisOnline ? '' : 'danger'}`}></span>
            <span style={{ color: 'var(--text-muted)' }}>L2 Redis:</span>
            <span style={{ fontWeight: 600, color: isRedisOnline ? 'var(--emerald)' : 'var(--crimson)' }}>
              {isRedisOnline ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Circuit Breaker */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            fontSize: 12
          }}>
            <Zap size={14} color={isCircuitOpen ? 'var(--crimson)' : 'var(--emerald)'} />
            <span className={`pulse-dot ${isCircuitOpen ? 'danger' : ''}`}></span>
            <span style={{ color: 'var(--text-muted)' }}>Circuit:</span>
            <span style={{
              fontWeight: 600,
              color: isCircuitOpen ? 'var(--crimson)' : 'var(--emerald)'
            }}>
              {circuitState}
            </span>
          </div>

          {/* L1 Cache Hit Rate */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            fontSize: 12
          }}>
            <Activity size={14} color="var(--amber)" />
            <span style={{ color: 'var(--text-muted)' }}>L1 Lease Hit:</span>
            <span style={{ fontWeight: 600, color: 'var(--amber)', fontFamily: 'JetBrains Mono' }}>
              {l1HitRate}%
            </span>
          </div>

          {/* External Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
            <a
              href="/health"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              Health <ExternalLink size={12} />
            </a>
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              Prometheus <ExternalLink size={12} />
            </a>
            <a
              href="https://github.com/sushant-1212/distributed-rate-limiter"
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#60a5fa',
                fontSize: 12,
                textDecoration: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
