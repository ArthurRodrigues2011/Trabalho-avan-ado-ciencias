const fs = require('fs/promises');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'data', 'logs');
const logFile = path.join(logDir, 'analytics.log');

async function logEvent(level, event, details = {}) {
  const entry = {
    level,
    event,
    ...details,
    timestamp: new Date().toISOString()
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'log_file_write_failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }));
  }
}

module.exports = {
  logEvent
};
