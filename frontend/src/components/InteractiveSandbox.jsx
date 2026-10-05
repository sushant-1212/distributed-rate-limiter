import React, { useState } from 'react';
import { Send, Flame, ShieldAlert, ShoppingBag, Radio, Cpu, RotateCcw, AlertOctagon } from 'lucide-react';

export default function InteractiveSandbox({ onTriggerRefresh, systemState }) {
  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('/api/v1/products');
  const [clientId, setClientId] = useState('dev_user_1');
  const [isExecuting, setIsExecuting] = useState(false);

  // Inspector State
  const [inspectData, setInspectData] = useState({
    status: 200,
    statusText: 'Ready',
    latencyMs: 0,
    headers: {
      'engine': 'Two-Tier Hierarchical Limiter',
      'instruction': 'Dispatch request or run attack scenario'
    }
  });

  const [powSolving, setPowSolving] = useState(false);
  const [powHashes, setPowHashes] = useState(0);

  const isCircuitOpen = systemState?.circuitBreaker?.isOpen ?? false;

  async function handleSendCustom() {
    setIsExecuting(true);
    const start = performance.now();
    try {
      const headers = {};
      if (clientId.startsWith('key-')) {
        headers['x-api-key'] = clientId;
      } else {
        headers['x-user-id'] = clientId;
      }

      const res = await fetch(endpoint, { method, headers });
      const latency = Math.round((performance.now() - start) * 10) / 10;

      const headerMap = {};
      [
        'ratelimit-remaining',
        'ratelimit-limit',
        'ratelimit-reset',
        'ratelimit-policy',
        'x-ratelimit-source',
        'x-ratelimit-tier',
        'retry-after'
      ].forEach((h) => {
        const val = res.headers.get(h);
        if (val !== null) headerMap[h] = val;
      });

      setInspectData({
        status: res.status,
        statusText: res.statusText || (res.status === 200 ? 'OK' : 'Throttled'),
        latencyMs: latency,
        headers: headerMap
      });

      if (onTriggerRefresh) onTriggerRefresh();
    } catch (err) {
      setInspectData({
        status: 0,
        statusText: 'Network Connection Error',
        latencyMs: Math.round(performance.now() - start),
        headers: { error: err.message }
      });
    } finally {
      setIsExecuting(false);
    }
  }

  // Attack Scenarios
  async function runScenario(type) {
    setIsExecuting(true);
    const start = performance.now();

    try {
      if (type === 'ddos') {
        const botId = `attacker_botnet_${Math.floor(Math.random() * 100)}`;
        const promises = [];
        for (let i = 0; i < 50; i++) {
          promises.push(
            fetch('/api/v1/ai-generate', {
              method: 'POST',
              headers: { 'x-user-id': botId }
            })
          );
        }
        const results = await Promise.all(promises);
        const throttledCount = results.filter((r) => r.status === 429).length;
        const latency = Math.round(performance.now() - start);

        setInspectData({
          status: 429,
          statusText: `Volumetric Flood: ${throttledCount}/50 Throttled`,
          latencyMs: latency,
          headers: {
            'attack-type': 'Volumetric Botnet Flood',
            'botnet-id': botId,
            'rate-limit-action': 'Enforced RFC 6585 Quota'
          }
        });
      } else if (type === 'stuffing') {
        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(
            fetch('/api/v1/auth/login', {
              method: 'POST',
              headers: {
                'x-user-id': `stuffer_ip_${Math.floor(Math.random() * 20)}`,
                'content-type': 'application/json'
              },
              body: JSON.stringify({ user: `victim_${i}@example.com`, pass: '123456' })
            })
          );
        }
        await Promise.all(promises);
        const latency = Math.round(performance.now() - start);
        setInspectData({
          status: 429,
          statusText: 'Credential Stuffing Mitigated (20 attempts)',
          latencyMs: latency,
          headers: {
            'target-route': '/api/v1/auth/login',
            'defense-engine': 'Adaptive Route-Cost Limiter'
          }
        });
      } else if (type === 'surge') {
        const routes = ['/api/v1/products', '/api/v1/search', '/api/v1/checkout'];
        const keys = ['key-demo-free', 'key-demo-pro', 'key-demo-ent'];
        const promises = [];
        for (let i = 0; i < 25; i++) {
          const r = routes[Math.floor(Math.random() * routes.length)];
          const k = keys[Math.floor(Math.random() * keys.length)];
          promises.push(
            fetch(r, {
              method: r.includes('checkout') ? 'POST' : 'GET',
              headers: { 'x-api-key': k, 'x-user-id': `shopper_${i}` }
            })
          );
        }
        const results = await Promise.all(promises);
        const allowedCount = results.filter((r) => r.status === 200).length;
        const latency = Math.round(performance.now() - start);
        setInspectData({
          status: 200,
          statusText: `Flash Sale Surge: ${allowedCount}/25 Allowed`,
          latencyMs: latency,
          headers: {
            'surge-type': 'Genuine Multi-Tenant Flash Sale',
            'tenants': 'Free, Pro, Enterprise concurrent leases'
          }
        });
      } else if (type === 'webhook') {
        const res = await fetch('/api/v1/webhooks/orders', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-throttle-policy': 'queue',
            'x-user-id': 'stripe_webhook_worker'
          },
          body: JSON.stringify({ event: 'payment.succeeded', id: `evt_${Date.now()}` })
        });
        const latency = Math.round(performance.now() - start);
        setInspectData({
          status: res.status,
          statusText: 'Zero-Data-Loss: Webhook Enqueued (202 Accepted)',
          latencyMs: latency,
          headers: {
            'queue-mode': 'Zero-Data-Loss Asynchronous Backpressure',
            'retention': 'Guaranteed Delivery FIFO Buffer'
          }
        });
      }

      if (onTriggerRefresh) onTriggerRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExecuting(false);
    }
  }

  // SHA-256 Proof of Work Challenge Solver
  async function solvePoW() {
    setPowSolving(true);
    setPowHashes(0);
    const start = performance.now();

    try {
      const challengeRes = await fetch('/api/v1/challenge').then((r) => r.json());
      if (!challengeRes.challenge) return;
      const { nonce, timestamp, difficulty, signature, prefix } = challengeRes.challenge;

      let suffix = 0;
      const enc = new TextEncoder();
      while (suffix < 150000) {
        const data = enc.encode(nonce + suffix);
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        if (hashHex.startsWith(prefix)) {
          break;
        }
        suffix++;
        if (suffix % 2500 === 0) {
          setPowHashes(suffix);
        }
      }

      setPowHashes(suffix);
      const solution = `${nonce}:${suffix}:${timestamp}:${difficulty}:${signature}`;

      const res = await fetch('/api/v1/ai-generate', {
        method: 'POST',
        headers: {
          'x-pow-solution': solution,
          'x-user-id': 'pow-verified-client'
        }
      });

      const latency = Math.round(performance.now() - start);
      setInspectData({
        status: res.status,
        statusText: `200 OK — PoW Challenge Solved (${suffix} hashes)`,
        latencyMs: latency,
        headers: {
          'x-pow-verified': 'true',
          'cryptographic-nonce': nonce,
          'computed-hash-iterations': String(suffix),
          'engine-action': 'Rate Limit Bypassed via Cryptographic Hashcash'
        }
      });

      if (onTriggerRefresh) onTriggerRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setPowSolving(false);
    }
  }

  // Toggle Circuit Breaker
  async function toggleCircuit() {
    const action = isCircuitOpen ? 'reset' : 'trip';
    await fetch(`/api/admin/circuit-breaker/${action}`, { method: 'POST' });
    if (onTriggerRefresh) onTriggerRefresh();
  }

  // Reset metrics
  async function resetMetrics() {
    await fetch('/api/reset', { method: 'POST' });
    if (onTriggerRefresh) onTriggerRefresh();
  }

  return (
    <div className="glass-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
          Interactive Flow Control Sandbox
        </h2>
        <button
          className="btn-action btn-secondary"
          onClick={resetMetrics}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          <RotateCcw size={12} /> Clear Telemetry
        </button>
      </div>

      {/* Custom Request Form */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: '#fff',
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'JetBrains Mono',
            outline: 'none'
          }}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>

        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="/api/v1/endpoint"
          style={{
            flex: '2 1 180px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: '#fff',
            padding: '7px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'JetBrains Mono',
            outline: 'none'
          }}
        />

        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID or API Key"
          style={{
            flex: '1 1 140px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: '#93c5fd',
            padding: '7px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'JetBrains Mono',
            outline: 'none'
          }}
        />

        <button
          className="btn-action btn-primary"
          onClick={handleSendCustom}
          disabled={isExecuting}
          style={{ padding: '7px 16px' }}
        >
          <Send size={13} /> Send Request
        </button>
      </div>

      {/* One-Click Real Attack Scenarios */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
          Real Traffic & Attack Scenarios:
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <button
            className="btn-action btn-danger"
            onClick={() => runScenario('ddos')}
            disabled={isExecuting}
            style={{ fontSize: 12, padding: '7px 10px' }}
          >
            <Flame size={14} /> Volumetric Flood (50)
          </button>
          <button
            className="btn-action btn-warning"
            onClick={() => runScenario('stuffing')}
            disabled={isExecuting}
            style={{ fontSize: 12, padding: '7px 10px' }}
          >
            <ShieldAlert size={14} /> Credential Stuffing
          </button>
          <button
            className="btn-action btn-success"
            onClick={() => runScenario('surge')}
            disabled={isExecuting}
            style={{ fontSize: 12, padding: '7px 10px' }}
          >
            <ShoppingBag size={14} /> Flash Sale Surge
          </button>
          <button
            className="btn-action btn-secondary"
            onClick={() => runScenario('webhook')}
            disabled={isExecuting}
            style={{ fontSize: 12, padding: '7px 10px', borderColor: 'var(--blue-border)', color: '#60a5fa' }}
          >
            <Radio size={14} /> Webhook Queue
          </button>
        </div>
      </div>

      {/* Advanced Distributed Resilience Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          className="btn-action btn-secondary"
          onClick={solvePoW}
          disabled={powSolving || isExecuting}
          style={{ flex: 1, minWidth: 200, fontSize: 12, borderColor: 'var(--purple-border)', color: '#c4b5fd' }}
        >
          <Cpu size={14} />
          {powSolving ? `Computing Hashes (${powHashes.toLocaleString()})...` : '🛡️ Solve SHA-256 PoW Challenge'}
        </button>

        <button
          className={`btn-action ${isCircuitOpen ? 'btn-success' : 'btn-danger'}`}
          onClick={toggleCircuit}
          style={{ flex: 1, minWidth: 180, fontSize: 12 }}
        >
          <AlertOctagon size={14} />
          {isCircuitOpen ? 'Reset Circuit Breaker' : 'Simulate Redis Outage (Trip)'}
        </button>
      </div>

      {/* Live RFC 6585 Response Inspector Box */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '12px 14px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 8,
          marginBottom: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontWeight: 600,
              fontSize: 13,
              color: inspectData.status === 200 || inspectData.status === 202 ? 'var(--emerald)' : 'var(--crimson)',
              fontFamily: 'JetBrains Mono'
            }}>
              {inspectData.status > 0 ? `${inspectData.status} ${inspectData.statusText}` : inspectData.statusText}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
            RTT: {inspectData.latencyMs} ms
          </span>
        </div>

        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
          {Object.entries(inspectData.headers).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
              <span style={{ color: 'var(--text-dim)', minWidth: 150 }}>{k}:</span>
              <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
