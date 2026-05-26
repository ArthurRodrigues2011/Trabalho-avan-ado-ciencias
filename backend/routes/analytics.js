const path = require('path');
const express = require('express');

const JsonVisitStore = require('../src/storage/jsonVisitStore');
const {
  buildVisit,
  buildPublicStats,
  isHeartbeat,
  normalizePage,
  toOnlineVisitors
} = require('../src/utils/clientInfo');
const { logEvent } = require('../src/utils/logger');

const router = express.Router();
const store = new JsonVisitStore(path.join(__dirname, '..', 'data', 'visitas.json'));

const SPAM_WINDOW_MS = Number(process.env.SPAM_WINDOW_SECONDS || 20) * 1000;
const ONLINE_WINDOW_MS = Number(process.env.ONLINE_WINDOW_MINUTES || 5) * 60 * 1000;
const recentPageviews = new Map();

function cleanRecentPageviews(now) {
  for (const [key, timestamp] of recentPageviews.entries()) {
    if (now - timestamp > SPAM_WINDOW_MS * 3) {
      recentPageviews.delete(key);
    }
  }
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return req.headers['x-admin-token'] || req.query.token || '';
}

function requireAdmin(req, res, next) {
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken) {
    next();
    return;
  }

  if (tokenFromRequest(req) === expectedToken) {
    next();
    return;
  }

  res.status(401).json({
    ok: false,
    error: 'Token administrativo invalido ou ausente'
  });
}

router.post('/visita', async (req, res, next) => {
  try {
    const now = Date.now();
    cleanRecentPageviews(now);

    const visit = buildVisit(req);
    const heartbeat = isHeartbeat(req.body);

    if (heartbeat) {
      const data = await store.touchVisitor(visit);
      const stats = buildPublicStats(data, ONLINE_WINDOW_MS);

      res.json({
        ok: true,
        recorded: false,
        heartbeat: true,
        onlineVisitors: stats.onlineVisitors,
        timestamp: visit.timestamp
      });
      return;
    }

    const spamKey = `${visit.visitorId}:${normalizePage(visit.page)}`;
    const lastHit = recentPageviews.get(spamKey);

    if (lastHit && now - lastHit < SPAM_WINDOW_MS) {
      const data = await store.touchVisitor(visit);
      const stats = buildPublicStats(data, ONLINE_WINDOW_MS);

      logEvent('warn', 'visit_rate_limited', {
        visitorId: visit.visitorId,
        ip: visit.ip,
        page: visit.page,
        secondsSinceLastHit: Math.round((now - lastHit) / 1000)
      });

      res.status(202).json({
        ok: true,
        recorded: false,
        reason: 'rate_limited',
        totalVisits: stats.totalVisits,
        onlineVisitors: stats.onlineVisitors
      });
      return;
    }

    recentPageviews.set(spamKey, now);
    const data = await store.addVisit(visit);
    const stats = buildPublicStats(data, ONLINE_WINDOW_MS);

    logEvent('info', 'visit_recorded', {
      visitId: visit.id,
      visitorId: visit.visitorId,
      ip: visit.ip,
      country: visit.country,
      page: visit.page,
      browser: visit.browser,
      os: visit.os,
      device: visit.device
    });

    res.status(201).json({
      ok: true,
      recorded: true,
      visitId: visit.id,
      totalVisits: stats.totalVisits,
      uniqueVisitors: stats.uniqueVisitors,
      onlineVisitors: stats.onlineVisitors,
      timestamp: visit.timestamp
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const data = await store.getData();
    res.json({
      ok: true,
      stats: buildPublicStats(data, ONLINE_WINDOW_MS)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/online', requireAdmin, async (req, res, next) => {
  try {
    const data = await store.getData();
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowMinutes: Math.round(ONLINE_WINDOW_MS / 60000),
      total: toOnlineVisitors(data, ONLINE_WINDOW_MS).length,
      visitors: toOnlineVisitors(data, ONLINE_WINDOW_MS)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/visitas', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);
    const data = await store.getData();
    const visits = [...data.visits]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totalStored: data.visits.length,
      totalVisits: data.totals.totalVisits,
      limit,
      visits
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
