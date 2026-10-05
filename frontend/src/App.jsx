import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import LiveTrafficChart from './components/LiveTrafficChart';
import AuditLogStream from './components/AuditLogStream';
import InteractiveSandbox from './components/InteractiveSandbox';
import PolicyManager from './components/PolicyManager';

export default function App() {
  const [systemState, setSystemState] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [totals, setTotals] = useState({ total: 0, allowed: 0, blocked: 0 });

  const fetchData = useCallback(async () => {
    try {
      const [stateRes, histRes, logsRes] = await Promise.all([
        fetch('/api/state').then((r) => r.json()).catch(() => null),
        fetch('/api/history').then((r) => r.json()).catch(() => []),
        fetch('/api/logs').then((r) => r.json()).catch(() => [])
      ]);

      if (stateRes) {
        setSystemState(stateRes);
        if (stateRes.totals) {
          setTotals(stateRes.totals);
        }
      }
      if (Array.isArray(histRes)) {
        setHistory(histRes);
      }
      if (Array.isArray(logsRes)) {
        setLogs(logsRes);
      }
    } catch (err) {
      console.warn('[TrafficShield] Polling warning:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 600);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Header systemState={systemState} />

      {/* Main Content Dashboard */}
      <main style={{ maxWidth: 1400, width: '100%', margin: '0 auto', padding: '24px 24px', flex: 1 }}>
        {/* KPI Metric Cards */}
        <MetricsCards totals={totals} history={history} systemState={systemState} />

        {/* Live Rolling Traffic Chart */}
        <LiveTrafficChart history={history} />

        {/* 2-Column Split: Stream on Left, Sandbox & Policy on Right */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 20
        }}>
          {/* Left Column: Real-Time Audit Log Table */}
          <div style={{ minHeight: 480 }}>
            <AuditLogStream logs={logs} />
          </div>

          {/* Right Column: Sandbox & Policy Tiers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <InteractiveSandbox onTriggerRefresh={fetchData} systemState={systemState} />
            <PolicyManager systemState={systemState} onTriggerRefresh={fetchData} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        padding: '16px 24px',
        fontSize: 12,
        color: 'var(--text-dim)',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>
            TrafficShield Distributed Rate Limiter · GCRA, L1/L2 Hierarchical Leasing, Netflix TCP Vegas, IETF RFC 6585
          </span>
          <span>
            Built with React 18, Vite, Node.js, Redis 7 & Prometheus
          </span>
        </div>
      </footer>
    </div>
  );
}
