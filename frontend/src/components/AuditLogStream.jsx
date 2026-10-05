import React from 'react';
import { Terminal, ShieldCheck, ShieldX } from 'lucide-react';

export default function AuditLogStream({ logs = [] }) {
  return (
    <div className="glass-card" style={{ padding: '18px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={16} color="var(--purple)" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Real-Time Audit Stream
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            IETF RFC 6585 Compliance
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>
          {logs.length} events logged
        </span>
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', maxHeight: 380 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Time</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Endpoint</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Client / Key</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Cost</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Tier</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Latency</th>
              <th style={{ padding: '8px 10px', fontWeight: 500 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-dim)' }}>
                  Listening for incoming traffic... Send a request or launch a scenario.
                </td>
              </tr>
            ) : (
              logs.slice(0, 20).map((l, idx) => {
                const isAllowed = l.allowed;
                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(25, 34, 51, 0.6)',
                      transition: 'background 0.1s ease'
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>
                      {l.time || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#fff', fontWeight: 500, fontFamily: 'JetBrains Mono' }}>
                      {l.endpoint}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#93c5fd', fontFamily: 'JetBrains Mono' }}>
                      <code>{l.sourceId || 'anonymous'}</code>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                      {l.cost || 1}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="badge badge-tier">
                        {l.tier || 'free'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                      {l.latencyMs || 1}ms
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {isAllowed ? (
                        <span className="badge badge-200">
                          <ShieldCheck size={11} /> 200 OK
                        </span>
                      ) : (
                        <span className="badge badge-429">
                          <ShieldX size={11} /> 429 THROTTLED
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
