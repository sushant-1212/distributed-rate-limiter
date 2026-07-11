(function () {
  const needle = document.getElementById('needle');
  const verdict = document.getElementById('verdict');
  const scoreEl = document.getElementById('score');
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  let seenLogTimes = new Set();

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
    const p = classification.genuineProbability;
    const angle = -90 + p * 180;
    needle.style.transform = `rotate(${angle}deg)`;
    scoreEl.textContent = Math.round(p * 100) + '%';

    const v = classification.verdict;
    const map = {
      genuine_surge: ['GENUINE SURGE', 'var(--genuine)'],
      attack_detected: ['ATTACK DETECTED', 'var(--attack)'],
      ambiguous: ['AMBIGUOUS', 'var(--amber)'],
      monitoring: ['MONITORING', 'var(--muted)'],
    };
    const [label, color] = map[v] || map.monitoring;
    verdict.textContent = label;
    verdict.style.color = color;
    scoreEl.style.color = color;

    setSignal('sig1', classification.features?.timingRegularity);
    setSignal('sig2', classification.features?.sourceDiversity);
    setSignal('sig3', classification.features?.endpointDiversity);
  }

  function renderAdaptive(adaptive) {
    document.getElementById('adaptive-mode').textContent = adaptive.mode;
    document.getElementById('cap').textContent = adaptive.globalCapacity;
    document.getElementById('refill').textContent = Number(adaptive.globalRefill).toFixed(1);
    document.getElementById('throttled').textContent =
      adaptive.throttledSources.length ? adaptive.throttledSources.join(', ') : 'none';
  }

  function renderMetrics(totals, history) {
    document.getElementById('m-total').textContent = totals.total;
    document.getElementById('m-allowed').textContent = totals.allowed;
    document.getElementById('m-blocked').textContent = totals.blocked;
    const last = history[history.length - 1];
    document.getElementById('m-rps').textContent = last ? last.allowed + last.blocked : 0;
  }

  function drawChart(history) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#1A2440';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (history.length === 0) return;
    const maxVal = Math.max(10, ...history.map((b) => b.allowed + b.blocked));
    const bw = w / 30;
    history.forEach((b, i) => {
      const x = w - (history.length - i) * bw;
      const allowedH = (b.allowed / maxVal) * h;
      const blockedH = (b.blocked / maxVal) * h;
      ctx.fillStyle = '#3DDC84';
      ctx.fillRect(x + 2, h - allowedH, bw - 4, allowedH);
      ctx.fillStyle = '#FF5A5F';
      ctx.fillRect(x + 2, h - allowedH - blockedH, bw - 4, blockedH);
    });
  }

  function renderBuckets(buckets) {
    const container = document.getElementById('buckets');
    container.innerHTML = '';
    buckets.forEach((b) => {
      if (b.tokens === undefined) return;
      const pct = Math.max(0, Math.min(100, (b.tokens / b.capacity) * 100));
      const div = document.createElement('div');
      div.className = 'bucket' + (b.throttled ? ' throttled' : '');
      div.innerHTML = `<div class="id">${b.sourceId}</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%; background:${b.throttled ? 'var(--attack)' : 'var(--genuine)'}"></div></div>
        <div class="lvl">${b.tokens.toFixed(1)}/${b.capacity}</div>`;
      container.appendChild(div);
    });
  }

  function renderLog(entries) {
    const tbody = document.getElementById('log-body');
    // entries arrive most-recent-first from the server; rebuild if the
    // newest entry is one we haven't shown yet.
    const newestKey = entries[0] ? entries[0].time + entries[0].sourceId + entries[0].endpoint : null;
    if (newestKey && seenLogTimes.has(newestKey) && tbody.rows.length > 0) return;
    seenLogTimes.add(newestKey);

    tbody.innerHTML = '';
    entries.slice(0, 30).forEach((e) => {
      const tr = document.createElement('tr');
      const time = new Date(e.time).toLocaleTimeString('en-GB');
      tr.innerHTML = `<td>${time}</td><td>${e.sourceId}</td><td>${e.endpoint}</td>
        <td><span class="tag ${e.allowed ? 'allow' : 'block'}">${e.allowed ? 'ALLOW' : 'BLOCK'}</span></td>`;
      tbody.appendChild(tr);
    });
  }

  async function poll() {
    try {
      const [stateRes, historyRes, logsRes, bucketsRes] = await Promise.all([
        fetch('/api/state'),
        fetch('/api/history'),
        fetch('/api/logs'),
        fetch('/api/buckets'),
      ]);
      const state = await stateRes.json();
      const history = await historyRes.json();
      const logs = await logsRes.json();
      const buckets = await bucketsRes.json();

      renderGauge(state.classification);
      renderAdaptive(state.adaptive);
      renderMetrics(state.totals, history);
      drawChart(history);
      renderBuckets(buckets);
      renderLog(logs);
    } catch (err) {
      console.error('poll failed', err);
    }
  }

  poll();
  setInterval(poll, 700);
})();
