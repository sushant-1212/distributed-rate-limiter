(function () {
  const canvas = document.getElementById('trafficChart');
  const ctx = canvas.getContext('2d');

  let circuitBreakerOpen = false;

  // Render High-Level KPI Cards
  function renderMetrics(totals, history, data) {
    document.getElementById('kpiTotal').textContent = (totals.total || 0).toLocaleString();
    document.getElementById('kpiAllowed').textContent = (totals.allowed || 0).toLocaleString();
    document.getElementById('kpiBlocked').textContent = (totals.blocked || 0).toLocaleString();

    const last = history[history.length - 1];
    const rps = last ? last.allowed + last.blocked : 0;
    document.getElementById('kpiRps').innerHTML = `${rps} <span style="font-size:13px; font-weight:400; color:var(--text-muted);">req/s</span>`;

    if (data.hierarchicalL1) {
      document.getElementById('kpiL1Rate').textContent = `${data.hierarchicalL1.l1HitRatePercent || '0.0'}%`;
    }

    if (data.concurrency) {
      document.getElementById('kpiConcurrency').textContent = `${data.concurrency.inFlight} / ${data.concurrency.currentLimit}`;
    }

    // Top Navigation indicators
    if (data.redis) {
      const isConnected = data.redis.connected;
      const dot = document.getElementById('redisDot');
      dot.className = isConnected ? 'pulse-dot' : 'pulse-dot danger';
      document.getElementById('redisLabel').textContent = isConnected ? 'Redis: Connected' : 'Redis: Offline';
    }

    if (data.circuitBreaker) {
      circuitBreakerOpen = data.circuitBreaker.isOpen;
      const dot = document.getElementById('circuitDot');
      const label = document.getElementById('circuitLabel');
      const btn = document.getElementById('btnCircuit');
      if (circuitBreakerOpen) {
        dot.className = 'pulse-dot danger';
        label.textContent = 'Circuit: Degraded (Open)';
        btn.textContent = 'Reset Circuit Breaker';
      } else {
        dot.className = 'pulse-dot';
        label.textContent = 'Circuit: Closed';
        btn.textContent = 'Simulate Redis Outage';
      }
    }
  }

  // Render Clean Time-Series Canvas Chart
  function renderChart(history) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
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

    let maxRps = 10;
    for (const d of history) {
      const tot = d.allowed + d.blocked;
      if (tot > maxRps) maxRps = tot;
    }
    maxRps = Math.ceil(maxRps / 5) * 5;

    // Horizontal Grid Lines & Y-Axis Labels
    ctx.strokeStyle = '#1a1f2c';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5d6778';
    ctx.font = '10px -apple-system, sans-serif';
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

    if (history.length < 2) return;
    const step = plotW / (Math.max(history.length - 1, 1));

    // Draw Allowed Area & Line (Emerald)
    ctx.beginPath();
    history.forEach((d, i) => {
      const x = padLeft + i * step;
      const y = padTop + plotH - (d.allowed / maxRps) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle Area Fill for Allowed
    ctx.lineTo(padLeft + (history.length - 1) * step, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
    ctx.fill();

    // Draw Blocked Line (Crimson)
    ctx.beginPath();
    history.forEach((d, i) => {
      const x = padLeft + i * step;
      const y = padTop + plotH - (d.blocked / maxRps) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Render Real-Time Audit Stream Table
  function renderAuditLogs(logs) {
    const tbody = document.getElementById('auditTableBody');
    if (!logs || logs.length === 0) return;

    tbody.innerHTML = '';
    logs.slice(0, 15).forEach((l) => {
      const tr = document.createElement('tr');
      const isAllowed = l.allowed;
      const statusBadge = isAllowed
        ? '<span class="badge badge-200">200 OK</span>'
        : '<span class="badge badge-429">429 THROTTLED</span>';

      tr.innerHTML = `
        <td>${l.time || '—'}</td>
        <td style="color:#fff; font-weight:500;">${l.endpoint}</td>
        <td><code>${l.sourceId || 'anonymous'}</code></td>
        <td>${l.cost || 1}</td>
        <td><span class="badge badge-tier">${l.tier || 'free'}</span></td>
        <td>${l.latencyMs || 0}ms</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Poll server state every 750ms
  async function refresh() {
    try {
      const [stateRes, histRes, logsRes] = await Promise.all([
        fetch('/api/state').then((r) => r.json()),
        fetch('/api/history').then((r) => r.json()),
        fetch('/api/logs').then((r) => r.json()),
      ]);

      renderMetrics(stateRes.totals || {}, histRes, stateRes);
      renderChart(histRes);
      renderAuditLogs(logsRes);
    } catch {
      // server poll retry
    }
  }

  setInterval(refresh, 750);
  refresh();

  // Helper to update Response Inspector Box
  function updateInspector(status, statusText, latencyMs, headers) {
    const statusEl = document.getElementById('inspectStatus');
    const latencyEl = document.getElementById('inspectLatency');
    const headersEl = document.getElementById('inspectHeaders');

    const isSuccess = status >= 200 && status < 300;
    statusEl.textContent = `${status} ${statusText}`;
    statusEl.style.color = isSuccess ? 'var(--emerald)' : 'var(--crimson)';
    latencyEl.textContent = `${latencyMs.toFixed(1)} ms`;

    let html = '';
    const relevantHeaders = [
      'ratelimit-remaining',
      'ratelimit-reset',
      'ratelimit-limit',
      'ratelimit-policy',
      'x-ratelimit-source',
      'x-ratelimit-tier',
      'retry-after',
    ];

    relevantHeaders.forEach((h) => {
      const val = headers.get(h);
      if (val !== null) {
        html += `<div><span class="inspector-key">${h}: </span><span class="inspector-val">${val}</span></div>`;
      }
    });

    if (!html) {
      html = `<div><span class="inspector-key">Status: </span><span>Completed</span></div>`;
    }

    headersEl.innerHTML = html;
  }

  // Interactive Sandbox Handlers
  window.sendCustomRequest = async function () {
    const method = document.getElementById('reqMethod').value;
    const path = document.getElementById('reqPath').value || '/api/v1/products';
    const sourceId = document.getElementById('reqSource').value || 'dev_user_1';
    const start = performance.now();

    try {
      const headers = {};
      if (sourceId.startsWith('key-')) {
        headers['x-api-key'] = sourceId;
      } else {
        headers['x-user-id'] = sourceId;
      }

      const res = await fetch(path, { method, headers });
      const latency = performance.now() - start;
      updateInspector(res.status, res.statusText, latency, res.headers);
      refresh();
    } catch (err) {
      const latency = performance.now() - start;
      updateInspector(0, 'Network Error', latency, new Headers());
    }
  };

  // Real Traffic & Attack Scenarios
  window.runScenario = async function (type) {
    const start = performance.now();

    if (type === 'ddos') {
      // 50 rapid concurrent requests from a single attacker source
      const botId = 'attacker_botnet_' + Math.floor(Math.random() * 100);
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          fetch('/api/v1/ai-generate', {
            method: 'POST',
            headers: { 'x-user-id': botId },
          })
        );
      }
      const results = await Promise.all(promises);
      const lastRes = results[results.length - 1];
      const latency = performance.now() - start;
      updateInspector(lastRes.status, `Volumetric Flood: ${results.filter(r => r.status === 429).length}/50 Throttled`, latency, lastRes.headers);
      refresh();
    } else if (type === 'stuffing') {
      // 20 rapid credential stuffing attacks on auth/login from rotating bot IDs
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'x-user-id': `stuffer_ip_${Math.floor(Math.random() * 20)}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ user: `victim_${i}@example.com`, password: 'password123' }),
          })
        );
      }
      const results = await Promise.all(promises);
      const lastRes = results[results.length - 1];
      const latency = performance.now() - start;
      updateInspector(lastRes.status, `Credential Stuffing: ${results.length} attempts dispatched`, latency, lastRes.headers);
      refresh();
    } else if (type === 'surge') {
      // 25 diverse genuine user requests across multiple routes
      const routes = ['/api/v1/products', '/api/v1/search', '/api/v1/checkout'];
      const keys = ['key-demo-free', 'key-demo-pro', 'key-demo-ent'];
      const promises = [];
      for (let i = 0; i < 25; i++) {
        const route = routes[Math.floor(Math.random() * routes.length)];
        const key = keys[Math.floor(Math.random() * keys.length)];
        promises.push(
          fetch(route, {
            method: route.includes('checkout') ? 'POST' : 'GET',
            headers: { 'x-api-key': key, 'x-user-id': `shopper_${i}` },
          })
        );
      }
      const results = await Promise.all(promises);
      const latency = performance.now() - start;
      updateInspector(200, `Flash Sale Surge: ${results.filter(r => r.status === 200).length}/25 Allowed`, latency, results[0].headers);
      refresh();
    } else if (type === 'webhook') {
      // Zero-data-loss buffered webhook queue
      const res = await fetch('/api/v1/webhooks/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-throttle-policy': 'queue',
          'x-user-id': 'stripe_webhook_worker',
        },
        body: JSON.stringify({ event: 'payment.succeeded', id: `evt_${Date.now()}` }),
      });
      const latency = performance.now() - start;
      updateInspector(res.status, 'Zero-Data-Loss: Webhook Buffered in Queue', latency, res.headers);
      refresh();
    }
  };

  async function solvePoWChallenge() {
    const start = performance.now();
    try {
      const challengeRes = await fetch('/api/v1/challenge').then((r) => r.json());
      if (!challengeRes.challenge) return;
      const { nonce, timestamp, difficulty, signature, prefix } = challengeRes.challenge;

      let suffix = 0;
      const enc = new TextEncoder();
      while (suffix < 100000) {
        const data = enc.encode(nonce + suffix);
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (hashHex.startsWith(prefix)) break;
        suffix++;
      }

      const solution = `${nonce}:${suffix}:${timestamp}:${difficulty}:${signature}`;
      const res = await fetch('/api/v1/ai-generate', {
        method: 'POST',
        headers: {
          'x-pow-solution': solution,
          'x-user-id': 'pow-verified-client',
        },
      });

      const latency = performance.now() - start;
      updateInspector(res.status, `${res.statusText} (PoW Solved in ${suffix} hashes)`, latency, res.headers);
      refresh();
    } catch (err) {
      const latency = performance.now() - start;
      updateInspector(0, 'PoW Execution Error', latency, new Headers());
    }
  }

  window.dispatchBurst = async function () {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        fetch('/api/v1/ai-generate', {
          method: 'POST',
          headers: { 'x-user-id': 'burst-client' },
        })
      );
    }
    await Promise.all(promises);
    refresh();
  };

  window.toggleCircuitBreaker = async function () {
    const action = circuitBreakerOpen ? 'reset' : 'trip';
    await fetch(`/api/admin/circuit-breaker/${action}`, { method: 'POST' });
    refresh();
  };

  window.resetTelemetry = async function () {
    await fetch('/api/reset', { method: 'POST' });
    refresh();
  };
})();
