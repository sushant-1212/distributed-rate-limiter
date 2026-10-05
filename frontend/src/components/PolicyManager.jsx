import React, { useState } from 'react';
import { Sliders, Award, DollarSign, Edit3, Check } from 'lucide-react';

export default function PolicyManager({ systemState, onTriggerRefresh }) {
  const tiers = systemState?.policies?.tiers || {
    anonymous: { name: 'Anonymous', limit: 30, capacity: 10, refillRate: 0.5, algorithm: 'token_bucket' },
    free: { name: 'Free Developer', limit: 100, capacity: 20, refillRate: 1.6, algorithm: 'gcra' },
    pro: { name: 'Pro Tier', limit: 1000, capacity: 100, refillRate: 16.6, algorithm: 'gcra (L1 Lease)' },
    enterprise: { name: 'Enterprise Tier', limit: 10000, capacity: 500, refillRate: 166, algorithm: 'gcra (Batch Lease)' }
  };

  const routeCosts = systemState?.policies?.routeCosts || {
    '/api/v1/health': 1,
    '/api/v1/products': 1,
    '/api/v1/search': 2,
    '/api/v1/checkout': 5,
    '/api/v1/ai-generate': 10
  };

  const [editingTier, setEditingTier] = useState(null);
  const [editLimit, setEditLimit] = useState(100);

  async function handleSaveTier(tierKey) {
    try {
      await fetch('/api/admin/policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tier: tierKey,
          limit: Number(editLimit),
          capacity: Math.round(Number(editLimit) / 5),
          refillRate: Math.round((Number(editLimit) / 60) * 10) / 10
        })
      });
      setEditingTier(null);
      if (onTriggerRefresh) onTriggerRefresh();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="glass-card" style={{ padding: '18px 20px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sliders size={16} color="var(--amber)" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Multi-Tenant Policy Engine
          </h2>
        </div>
        <span style={{ fontSize: 11, color: 'var(--emerald)', background: 'var(--emerald-bg)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--emerald-border)' }}>
          Hot-Reloadable
        </span>
      </div>

      {/* Tier Overview */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          Configured Tenant Tiers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(tiers).map(([k, t]) => {
            const isEditing = editingTier === k;
            return (
              <div
                key={k}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Award size={13} color="#93c5fd" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                      {t.name || k}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                    {t.algorithm ? t.algorithm.toUpperCase() : 'GCRA'} · Refill: {t.refillRate || 1}/s
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        value={editLimit}
                        onChange={(e) => setEditLimit(e.target.value)}
                        style={{
                          width: 80,
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-focus)',
                          color: '#fff',
                          padding: '3px 6px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'JetBrains Mono'
                        }}
                      />
                      <button
                        className="btn-action btn-success"
                        onClick={() => handleSaveTier(k)}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#60a5fa',
                        fontFamily: 'JetBrains Mono'
                      }}>
                        {t.limit ? `${t.limit.toLocaleString()} req/m` : `${t.capacity} tokens`}
                      </span>
                      <button
                        onClick={() => {
                          setEditingTier(k);
                          setEditLimit(t.limit || 100);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Edit tier limit"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Route Cost Multiplier Table */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          Route Cost Matrix (Cost Multipliers)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
          {Object.entries(routeCosts).map(([r, c]) => (
            <div
              key={r}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                {r.replace('/api/v1', '')}
              </span>
              <span style={{
                color: c > 2 ? 'var(--amber)' : '#94a3b8',
                fontWeight: 600,
                fontFamily: 'JetBrains Mono',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '1px 6px',
                borderRadius: 4
              }}>
                {c} {c === 1 ? 'token' : 'tokens'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
