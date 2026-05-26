const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

const displayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['pt-BR'], { type: 'region' })
  : null;

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, 500) || fallback;
}

function normalizePage(value) {
  const page = cleanString(value, '/');

  try {
    const parsed = page.startsWith('http')
      ? new URL(page)
      : new URL(page, 'https://site.local');

    return `${parsed.pathname}${parsed.search}` || '/';
  } catch (error) {
    return page.startsWith('/') ? page : `/${page}`;
  }
}

function getClientIp(req) {
  const forwardedFor = cleanString(req.headers['x-forwarded-for'] || '');
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['x-real-ip'],
    forwardedFor ? forwardedFor.split(',')[0] : '',
    req.ip,
    req.socket && req.socket.remoteAddress
  ];

  const ip = candidates
    .map((candidate) => cleanString(candidate || ''))
    .find(Boolean) || '0.0.0.0';

  return ip
    .replace('::ffff:', '')
    .replace(/^::1$/, '127.0.0.1');
}

function countryNameFromCode(code) {
  const normalizedCode = cleanString(code).toUpperCase();

  if (!normalizedCode || normalizedCode === 'XX') {
    return 'Desconhecido';
  }

  try {
    return displayNames ? displayNames.of(normalizedCode) : normalizedCode;
  } catch (error) {
    return normalizedCode;
  }
}

function detectCountry(ip, req) {
  const headerCode = cleanString(
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase();

  if (headerCode && headerCode !== 'XX') {
    return {
      country: countryNameFromCode(headerCode),
      countryCode: headerCode
    };
  }

  const geo = geoip.lookup(ip);
  const countryCode = geo && geo.country ? geo.country : '';

  return {
    country: countryNameFromCode(countryCode),
    countryCode: countryCode || 'UN'
  };
}

function parseUserAgent(userAgent) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const browserName = result.browser.name || 'Desconhecido';
  const browserVersion = result.browser.major || result.browser.version || '';
  const osName = result.os.name || 'Desconhecido';
  const osVersion = result.os.version || '';
  const rawDeviceType = result.device.type || '';
  const mobileByRegex = /android|iphone|ipad|ipod|mobile|windows phone/i.test(userAgent);
  const deviceType = rawDeviceType || (mobileByRegex ? 'mobile' : 'desktop');

  return {
    browser: [browserName, browserVersion].filter(Boolean).join(' '),
    os: [osName, osVersion].filter(Boolean).join(' '),
    device: deviceType === 'mobile'
      ? 'Celular'
      : deviceType === 'tablet'
        ? 'Tablet'
        : 'PC',
    deviceType
  };
}

function buildScreen(body) {
  const screen = body && body.screen && typeof body.screen === 'object' ? body.screen : {};
  const width = Number(screen.width || 0);
  const height = Number(screen.height || 0);

  if (!width || !height) {
    return '';
  }

  return `${width}x${height}`;
}

function buildVisit(req) {
  const body = req.body || {};
  const userAgent = cleanString(req.headers['user-agent'] || '', 'Desconhecido');
  const ip = getClientIp(req);
  const countryInfo = detectCountry(ip, req);
  const agentInfo = parseUserAgent(userAgent);
  const clientId = cleanString(body.clientId || '');
  const visitorSeed = clientId || `${ip}|${userAgent}`;
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    visitorId: hash(visitorSeed).slice(0, 24),
    ip,
    country: countryInfo.country,
    countryCode: countryInfo.countryCode,
    userAgent,
    browser: agentInfo.browser,
    os: agentInfo.os,
    device: agentInfo.device,
    deviceType: agentInfo.deviceType,
    page: normalizePage(body.page || req.headers.referer || '/'),
    pageTitle: cleanString(body.title || ''),
    referrer: cleanString(body.referrer || ''),
    language: cleanString(body.language || req.headers['accept-language'] || ''),
    timezone: cleanString(body.timezone || ''),
    screen: buildScreen(body),
    site: cleanString(body.site || req.headers.origin || ''),
    timestamp
  };
}

function isHeartbeat(body) {
  return body && body.eventType === 'heartbeat';
}

function countBy(items, selector) {
  const counts = new Map();

  for (const item of items) {
    const key = selector(item) || 'Desconhecido';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDailyChart(visits, days = 14) {
  const today = new Date();
  const buckets = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - index);
    buckets.push({
      key: toDateKey(date),
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: 0
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const visit of visits) {
    const key = toDateKey(new Date(visit.timestamp));
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.total += 1;
    }
  }

  return {
    labels: buckets.map((bucket) => bucket.label),
    values: buckets.map((bucket) => bucket.total)
  };
}

function toOnlineVisitors(data, onlineWindowMs) {
  const now = Date.now();

  return Object.values(data.visitors || {})
    .filter((visitor) => {
      const lastSeen = new Date(visitor.lastSeenAt || 0).getTime();
      return Number.isFinite(lastSeen) && now - lastSeen <= onlineWindowMs;
    })
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

function buildPublicStats(data, onlineWindowMs) {
  const visits = data.visits || [];
  const visitors = Object.values(data.visitors || {});
  const online = toOnlineVisitors(data, onlineWindowMs);
  const now = Date.now();
  const todayKey = toDateKey(new Date());
  const last24h = visits.filter((visit) => now - new Date(visit.timestamp).getTime() <= 24 * 60 * 60 * 1000);
  const visitsToday = visits.filter((visit) => toDateKey(new Date(visit.timestamp)) === todayKey);
  const sortedVisits = [...visits].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    generatedAt: new Date().toISOString(),
    totalVisits: Number(data.totals && data.totals.totalVisits ? data.totals.totalVisits : visits.length),
    storedVisits: visits.length,
    uniqueVisitors: visitors.length,
    onlineVisitors: online.length,
    visitsToday: visitsToday.length,
    visitsLast24h: last24h.length,
    lastVisitAt: sortedVisits[0] ? sortedVisits[0].timestamp : null,
    onlineWindowMinutes: Math.round(onlineWindowMs / 60000),
    topPages: countBy(visits, (visit) => visit.page).slice(0, 10),
    countries: countBy(visits, (visit) => visit.country).slice(0, 10),
    devices: countBy(visits, (visit) => visit.device).slice(0, 10),
    browsers: countBy(visits, (visit) => visit.browser).slice(0, 10),
    chart: buildDailyChart(visits),
    recentVisits: sortedVisits.slice(0, 12)
  };
}

module.exports = {
  buildPublicStats,
  buildVisit,
  cleanString,
  isHeartbeat,
  normalizePage,
  toOnlineVisitors
};
