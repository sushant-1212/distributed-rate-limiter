(function () {
  const needle = document.getElementById('needle');
  const verdict = document.getElementById('verdict');
  const scoreEl = document.getElementById('score');
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  let circuitBreakerOpen = false;

  function setSignal(id, val01) {
    const fill = document.getElementById(id);
    const label = document.getElementById(id + '-val');
    if (val01 === undefined || val01 === null) {
      fill.style.width = '0%';
      label.textContent = '—';
      return;
    }
    const pct = Math.round(val01 * 100);
    fill.style.width = pct + '%';
    fill.style.background = pct >= 55 ? 'var(--genuine)' : 'var(--attack)';
    label.textContent = pct + '%';
  }

  function renderGauge(classification) {
    const p = classification ? classification.genuineProbability : 1.0;
    const angle = -90 + p * 180;
    needle.style.transform = `rotate(${angle}deg)`;
    scoreEl.textContent = Math.round(p * 100) + '%';

    const v = classification ? classification.verdict : 'monitoring';
    const map = {
      genuine_surge: ['GENUINE TRAFFIC', 'var(--genuine)'],
      attack_detected: ['ATTACK DETECTED', 'var(--attack)'],
      ambiguous: ['EVALUATING', 'var(--amber)'],
      monitoring: ['MONITORING', 'var(--muted)'],
    };
    const [label, color] = map[v] || map.monitoring;
    verdict.textContent = label;
    verdict.style.color = color;
    scoreEl.style.color = color;

    setSignal('sig1', p);
    setSignal('sig2', p);
    setSignal('sig3', p);
  }

  function renderSystemState(data) {
    if (data.circuitBreaker) {
      circuitBreakerOpen = data.circuitBreaker.isOpen;
      const cbBadge = document.getElementById('cb-badge');
      const btnCb = document.getElementById('btn-cb-toggle');
      if (circuitBreakerOpen) {
        cbBadge.textContent = 'OPEN (FALLBACK)';
        cbBadge.className = 'badge badge-danger';
        btnCb.textContent = 'Reset Circuit Breaker';
      } else {
        cbBadge.textContent = 'CLOSED (NORMAL)';
        cbBadge.className = 'badge badge-healthy';
        btnCb.textContent = 'Trip Circuit Breaker';
      }
    }

    if (data.concurrency) {
      document.getElementById('concurrency-stat').textContent = `${data.concurrency.inFlight} / ${data.concurrency.currentLimit}`;
    }

    if (data.redis) {
      document.getElementById('redis-status').textContent = data.redis.connected ? 'Connected' : 'Mock/Offline';
    }

    if (data.hierarchicalL1) {
      document.getElementById('l1-hit-rate').textContent = (data.hierarchicalL1.l1HitRatePercent || 0) + '%';
    }

    if (data.anomalyDetection) {
      document.getElementById('entropy-score').textContent = (data.anomalyDetection.normalizedEntropy || 1.0).toFixed(2);
    }

    if (data.adaptive) {
      document.getElementById('adaptive-mode').textContent = data.adaptive.mode || 'normal';
    }

    if (data.classification) {
      renderGauge(data.classification);
    }
  }

  function renderMetrics(totals, history) {
    document.getElementById('m-total').textContent = totals.total;
    document.getElementById('m-allowed').textContent = totals.allowed;
    document.getElementById('m-blocked').textContent = totals.blocked;
    const last = history[history.length - 1];
    document.getElementById('m-rps').textContent = last ? last.allowed + last.blocked : 0;
  }

  function renderChart(history) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = 24;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;

    let maxRps = 10;
    for (const d of history) {
      const tot = d.allowed + d.blocked;
      if (tot > maxRps) maxRps = tot;
    }
    maxRps = Math.ceil(maxRps / 5) * 5;

    // Grid lines
    ctx.strokeStyle = '#1a2744';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + w, y);
      ctx.stroke();
    }

    if (history.length < 2) return;
    const step = w / (Math.max(history.length - 1, 1));

    // Allowed (green line)
    ctx.strokeStyle = '#3DDC84';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    history.forEach((d, i) => {
      const x = pad + i * step;
      const y = pad + h - (d.allowed / maxRps) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Blocked (red line)
    ctx.strokeStyle = '#FF5A5F';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    history.forEach((d, i) => {
      const x = pad + i * step;
      const y = pad + h - (d.blocked / maxRps) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderLogs(logs) {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    logs.slice(0, 15).forEach((l) => {
      const tr = document.createElement('tr');
      const badge = l.allowed
        ? '<span style="color:var(--genuine)">✓ 200 ALLOWED</span>'
        : '<span style="color:var(--attack)">✗ 429 THROTTLED</span>';
      tr.innerHTML = `
        <td>${l.time || '—'}</td>
        <td><code>${l.sourceId || 'anonymous'}</code></td>
        <td>${l.endpoint}</td>
        <td>${l.cost || 1}</td>
        <td><span class="badge badge-warn">${l.tier || 'free'}</span></td>
        <td>${l.latencyMs || 0}ms</td>
        <td>${badge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderBuckets(buckets) {
    const container = document.getElementById('buckets');
    container.innerHTML = '';
    buckets.forEach((b) => {
      const el = document.createElement('div');
      el.className = 'bucket' + (b.throttled ? ' throttled' : '');
      const pct = Math.min(100, Math.round((b.tokens / b.capacity) * 100));
      const fillCol = b.throttled ? 'var(--attack)' : pct > 30 ? 'var(--genuine)' : 'var(--amber)';
      el.innerHTML = `
        <div class="id" title="${b.sourceId}">${b.sourceId}</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%; background:${fillCol}"></div></div>
        <div class="lvl">${Math.round(b.tokens)} / ${b.capacity}</div>
      `;
      container.appendChild(el);
    });
  }

  async function refresh() {
    try {
      const [stateRes, histRes, logsRes, buckRes] = await Promise.all([
        fetch('/api/state').then((r) => r.json()),
        fetch('/api/history').then((r) => r.json()),
        fetch('/api/logs').then((r) => r.json()),
        fetch('/api/buckets').then((r) => r.json()),
      ]);

      renderSystemState(stateRes);
      renderMetrics(stateRes.totals || { total: 0, allowed: 0, blocked: 0 }, histRes);
      renderChart(histRes);
      renderLogs(logsRes);
      renderBuckets(buckRes);
    } catch {
      // transient poll error
    }
  }

  setInterval(refresh, 600);
  refresh();

  // Global actions for interactive buttons
  window.sendReq = async function (endpoint, apiKey) {
    try {
      await fetch(endpoint, {
        headers: { 'x-api-key': apiKey },
      });
      refresh();
    } catch {}
  };

  window.sendWebhookQueue = async function () {
    try {
      await fetch('/api/v1/webhooks/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-throttle-policy': 'queue',
          'x-user-id': 'webhook-client-99',
        },
        body: JSON.stringify({ event: 'order.created', amount: 499 }),
      });
      refresh();
    } catch {}
  };

  window.solvePoWAndBypass = async function () {
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
      await fetch('/api/v1/ai-generate', {
        headers: {
          'x-pow-solution': solution,
          'x-user-id': 'pow-verified-user',
        },
      });
      refresh();
    } catch (e) {
      console.error('PoW solve error:', e);
    }
  };

  window.sendBurst = async function () {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        fetch('/api/v1/ai-generate', {
          headers: { 'x-user-id': 'burst-tester' },
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

  window.resetStats = async function () {
    await fetch('/api/reset', { method: 'POST' });
    refresh();
  };
})();
