/**
 * Sliding window of recent requests, kept in process memory.
 *
 * This is intentionally simple for a single-instance demo. In a real
 * multi-instance deployment you'd back this with a Redis sorted set
 * (ZADD score=timestamp, ZREMRANGEBYSCORE to expire) so every app server
 * sees the same window -- see README "Next steps" for that upgrade path.
 */

const WINDOW_MS = Number(process.env.CLASSIFIER_WINDOW_MS || 2500);

let events = []; // { t, sourceId, endpoint, allowed }
const allTimeTotals = { total: 0, allowed: 0, blocked: 0 };
const perSecond = []; // { sec, allowed, blocked }
const recentLog = []; // capped log for the dashboard, most recent first
const MAX_LOG = 50;

function record(sourceId, endpoint, allowed) {
  const t = Date.now();
  events.push({ t, sourceId, endpoint, allowed });

  allTimeTotals.total += 1;
  if (allowed) allTimeTotals.allowed += 1;
  else allTimeTotals.blocked += 1;

  const sec = Math.floor(t / 1000);
  let bin = perSecond[perSecond.length - 1];
  if (!bin || bin.sec !== sec) {
    bin = { sec, allowed: 0, blocked: 0 };
    perSecond.push(bin);
    if (perSecond.length > 40) perSecond.shift();
  }
  if (allowed) bin.allowed += 1;
  else bin.blocked += 1;

  recentLog.unshift({ time: new Date(t).toISOString(), sourceId, endpoint, allowed });
  if (recentLog.length > MAX_LOG) recentLog.pop();
}

function pruneAndGetWindow() {
  const cutoff = Date.now() - WINDOW_MS;
  events = events.filter((e) => e.t >= cutoff);
  return events;
}

function getTotals() {
  return { ...allTimeTotals };
}

function getHistory() {
  return perSecond.slice(-30);
}

function getRecentLog() {
  return recentLog;
}

function reset() {
  events = [];
  perSecond.length = 0;
  recentLog.length = 0;
  allTimeTotals.total = 0;
  allTimeTotals.allowed = 0;
  allTimeTotals.blocked = 0;
}

module.exports = { record, pruneAndGetWindow, getTotals, getHistory, getRecentLog, reset };
