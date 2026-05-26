(function () {
  var script = document.currentScript;
  var config = window.SiteAnalytics || window.AnalyticsConfig || {};
  var debug = Boolean(config.debug || (script && script.dataset.debug === 'true'));
  var heartbeatSeconds = Number((script && script.dataset.heartbeat) || config.heartbeatSeconds || 45);
  var apiBase = resolveApiBase();

  function log(message, data) {
    if (debug && window.console) {
      console.info('[analytics]', message, data || '');
    }
  }

  function resolveApiBase() {
    if (config.apiUrl) {
      return cleanBase(config.apiUrl);
    }

    if (window.ANALYTICS_API_URL) {
      return cleanBase(window.ANALYTICS_API_URL);
    }

    if (script && script.dataset.api) {
      return cleanBase(script.dataset.api);
    }

    if (script && script.src) {
      try {
        var scriptUrl = new URL(script.src, window.location.href);
        if (scriptUrl.origin !== window.location.origin || /localhost:3000|127\.0\.0\.1:3000/.test(scriptUrl.host)) {
          return cleanBase(scriptUrl.origin);
        }
      } catch (error) {
        log('Nao foi possivel detectar a origem do script.', error);
      }
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }

    return '';
  }

  function cleanBase(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function getClientId() {
    var key = 'site_analytics_client_id';
    var current = '';

    try {
      current = window.localStorage.getItem(key);
      if (!current) {
        current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        window.localStorage.setItem(key, current);
      }
    } catch (error) {
      current = String(Date.now()) + Math.random().toString(16).slice(2);
    }

    return current;
  }

  function payload(eventType) {
    return {
      eventType: eventType,
      clientId: getClientId(),
      site: window.location.origin,
      page: window.location.pathname + window.location.search,
      title: document.title,
      referrer: document.referrer,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: {
        width: window.screen ? window.screen.width : 0,
        height: window.screen ? window.screen.height : 0
      }
    };
  }

  function send(eventType) {
    if (!apiBase) {
      log('API nao configurada. Use data-api ou carregue o tracker direto do backend.');
      return;
    }

    var endpoint = apiBase + '/visita';
    var body = JSON.stringify(payload(eventType));

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        var queued = navigator.sendBeacon(endpoint, blob);
        if (queued) {
          log('Evento enviado por beacon.', eventType);
          return;
        }
      }

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit'
      }).then(function () {
        log('Evento enviado por fetch.', eventType);
      }).catch(function (error) {
        log('Falha ao enviar evento.', error);
      });
    } catch (error) {
      log('Erro inesperado no tracker.', error);
    }
  }

  function start() {
    send('pageview');

    if (heartbeatSeconds >= 20) {
      window.setInterval(function () {
        if (!document.hidden) {
          send('heartbeat');
        }
      }, heartbeatSeconds * 1000);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        send('heartbeat');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());
