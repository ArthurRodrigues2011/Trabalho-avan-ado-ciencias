const fs = require('fs/promises');
const path = require('path');

class JsonVisitStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.maxStoredVisits = Number(process.env.MAX_STORED_VISITS || 50000);
    this.queue = Promise.resolve();
  }

  async ensureFile() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.write({
        createdAt: new Date().toISOString(),
        updatedAt: null,
        totals: {
          totalVisits: 0
        },
        visits: [],
        visitors: {}
      });
    }
  }

  normalize(rawData) {
    const data = Array.isArray(rawData)
      ? { visits: rawData, visitors: {}, totals: { totalVisits: rawData.length } }
      : rawData || {};

    data.createdAt = data.createdAt || new Date().toISOString();
    data.updatedAt = data.updatedAt || null;
    data.totals = data.totals || {};
    data.visits = Array.isArray(data.visits) ? data.visits : [];
    data.visitors = data.visitors && typeof data.visitors === 'object' ? data.visitors : {};

    if (!Number.isFinite(Number(data.totals.totalVisits))) {
      data.totals.totalVisits = data.visits.length;
    }

    if (Object.keys(data.visitors).length === 0 && data.visits.length > 0) {
      for (const visit of data.visits) {
        this.upsertVisitor(data, visit, false);
      }
    }

    return data;
  }

  async read() {
    await this.ensureFile();
    const content = await fs.readFile(this.filePath, 'utf8');
    return this.normalize(JSON.parse(content || '{}'));
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    data.updatedAt = new Date().toISOString();

    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  async mutate(mutator) {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = await mutator(data);
      await this.write(data);
      return result || data;
    });

    this.queue = run.catch(() => undefined);
    return run;
  }

  upsertVisitor(data, visit, countVisit) {
    const previous = data.visitors[visit.visitorId] || {
      visitorId: visit.visitorId,
      firstSeenAt: visit.timestamp,
      totalVisits: 0
    };

    data.visitors[visit.visitorId] = {
      ...previous,
      ip: visit.ip,
      country: visit.country,
      countryCode: visit.countryCode,
      browser: visit.browser,
      os: visit.os,
      device: visit.device,
      deviceType: visit.deviceType,
      currentPage: visit.page,
      lastPageTitle: visit.pageTitle,
      lastReferrer: visit.referrer,
      language: visit.language,
      timezone: visit.timezone,
      screen: visit.screen,
      lastSeenAt: visit.timestamp,
      totalVisits: Number(previous.totalVisits || 0) + (countVisit ? 1 : 0)
    };
  }

  async addVisit(visit) {
    return this.mutate((data) => {
      data.visits.push(visit);
      data.totals.totalVisits = Number(data.totals.totalVisits || 0) + 1;
      this.upsertVisitor(data, visit, true);

      if (this.maxStoredVisits > 0 && data.visits.length > this.maxStoredVisits) {
        data.visits.splice(0, data.visits.length - this.maxStoredVisits);
      }

      return data;
    });
  }

  async touchVisitor(visit) {
    return this.mutate((data) => {
      this.upsertVisitor(data, visit, false);
      return data;
    });
  }

  async getData() {
    await this.queue;
    return this.read();
  }
}

module.exports = JsonVisitStore;
