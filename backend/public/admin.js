(function () {
  const state = {
    stats: null,
    online: [],
    visits: [],
    token: localStorage.getItem('analytics_admin_token') || '',
    refreshTimer: null
  };

  const elements = {
    tokenPanel: document.getElementById('tokenPanel'),
    tokenForm: document.getElementById('tokenForm'),
    tokenInput: document.getElementById('tokenInput'),
    statusLine: document.getElementById('statusLine'),
    refreshButton: document.getElementById('refreshButton'),
    totalVisits: document.getElementById('totalVisits'),
    uniqueVisitors: document.getElementById('uniqueVisitors'),
    onlineVisitors: document.getElementById('onlineVisitors'),
    visitsLast24h: document.getElementById('visitsLast24h'),
    lastUpdated: document.getElementById('lastUpdated'),
    onlineWindow: document.getElementById('onlineWindow'),
    visitsChart: document.getElementById('visitsChart'),
    onlineList: document.getElementById('onlineList'),
    topPages: document.getElementById('topPages'),
    devicesList: document.getElementById('devicesList'),
    countriesList: document.getElementById('countriesList'),
    visitsTable: document.getElementById('visitsTable')
  };

  const numberFormatter = new Intl.NumberFormat('pt-BR');
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    return numberFormatter.format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) {
      return '--';
    }

    return dateFormatter.format(new Date(value));
  }

  function setStatus(message, isError) {
    elements.statusLine.textContent = message;
    elements.statusLine.style.color = isError ? '#ff9daf' : '';
  }

  async function api(path) {
    const headers = state.token ? { 'X-Admin-Token': state.token } : {};
    const response = await fetch(path, { headers });

    if (response.status === 401) {
      elements.tokenPanel.classList.remove('hidden');
      throw new Error('Token administrativo necessario.');
    }

    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    return response.json();
  }

  async function refresh() {
    try {
      setStatus('Atualizando dados...', false);

      const [statsResponse, onlineResponse, visitsResponse] = await Promise.all([
        api('/stats'),
        api('/online'),
        api('/visitas?limit=80')
      ]);

      state.stats = statsResponse.stats;
      state.online = onlineResponse.visitors || [];
      state.visits = visitsResponse.visits || [];

      elements.tokenPanel.classList.add('hidden');
      render();
      setStatus('Dados atualizados em tempo real.', false);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function render() {
    const stats = state.stats || {};

    elements.totalVisits.textContent = formatNumber(stats.totalVisits);
    elements.uniqueVisitors.textContent = formatNumber(stats.uniqueVisitors);
    elements.onlineVisitors.textContent = formatNumber(stats.onlineVisitors);
    elements.visitsLast24h.textContent = formatNumber(stats.visitsLast24h);
    elements.lastUpdated.textContent = `Atualizado: ${formatDate(stats.generatedAt)}`;
    elements.onlineWindow.textContent = `Ativos nos ultimos ${stats.onlineWindowMinutes || 5} min`;

    renderRank(elements.topPages, stats.topPages || [], 'Nenhuma pagina registrada');
    renderRank(elements.devicesList, stats.devices || [], 'Nenhum dispositivo registrado');
    renderRank(elements.countriesList, stats.countries || [], 'Nenhum pais registrado');
    renderOnline();
    renderVisitsTable();
    drawChart(stats.chart || { labels: [], values: [] });
  }

  function renderRank(container, items, emptyText) {
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="rank-item">
        <div>
          <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
          <span>${formatNumber(item.total)} acesso${Number(item.total) === 1 ? '' : 's'}</span>
        </div>
        <span class="rank-total">${formatNumber(item.total)}</span>
      </div>
    `).join('');
  }

  function renderOnline() {
    if (!state.online.length) {
      elements.onlineList.innerHTML = '<div class="empty-state">Nenhum visitante online agora.</div>';
      return;
    }

    elements.onlineList.innerHTML = state.online.map((visitor) => `
      <div class="online-item">
        <div>
          <strong title="${escapeHtml(visitor.currentPage)}">${escapeHtml(visitor.currentPage || '/')}</strong>
          <span>${escapeHtml(visitor.ip)} · ${escapeHtml(visitor.device)} · ${formatDate(visitor.lastSeenAt)}</span>
        </div>
        <span class="rank-total">${escapeHtml(visitor.countryCode || '--')}</span>
      </div>
    `).join('');
  }

  function renderVisitsTable() {
    if (!state.visits.length) {
      elements.visitsTable.innerHTML = '<tr><td colspan="7">Nenhuma visita registrada ainda.</td></tr>';
      return;
    }

    elements.visitsTable.innerHTML = state.visits.map((visit) => `
      <tr>
        <td>${formatDate(visit.timestamp)}</td>
        <td class="mono">${escapeHtml(visit.ip)}</td>
        <td>${escapeHtml(visit.country)}</td>
        <td>${escapeHtml(visit.browser)}</td>
        <td>${escapeHtml(visit.os)}</td>
        <td>${escapeHtml(visit.device)}</td>
        <td title="${escapeHtml(visit.page)}">${escapeHtml(visit.page)}</td>
      </tr>
    `).join('');
  }

  function drawChart(chart) {
    const canvas = elements.visitsChart;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const labels = chart.labels || [];
    const values = chart.values || [];
    const maxValue = Math.max(...values, 1);

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const padding = { top: 16, right: 18, bottom: 34, left: 36 };
    const width = rect.width - padding.left - padding.right;
    const height = rect.height - padding.top - padding.bottom;
    const barGap = 8;
    const barWidth = Math.max(8, (width - barGap * Math.max(labels.length - 1, 0)) / Math.max(labels.length, 1));

    context.strokeStyle = '#263241';
    context.lineWidth = 1;
    context.font = '12px Inter, system-ui, sans-serif';
    context.fillStyle = '#92a2b3';

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (height / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(rect.width - padding.right, y);
      context.stroke();
    }

    values.forEach((value, index) => {
      const x = padding.left + index * (barWidth + barGap);
      const barHeight = (value / maxValue) * height;
      const y = padding.top + height - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, padding.top + height);
      gradient.addColorStop(0, '#35d0ff');
      gradient.addColorStop(1, '#5ee082');

      context.fillStyle = gradient;
      context.fillRect(x, y, barWidth, Math.max(2, barHeight));

      context.fillStyle = '#92a2b3';
      context.textAlign = 'center';
      context.fillText(labels[index] || '', x + barWidth / 2, rect.height - 10);

      if (value > 0) {
        context.fillStyle = '#edf4f8';
        context.fillText(value, x + barWidth / 2, Math.max(14, y - 7));
      }
    });
  }

  elements.tokenForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.token = elements.tokenInput.value.trim();
    localStorage.setItem('analytics_admin_token', state.token);
    refresh();
  });

  elements.refreshButton.addEventListener('click', refresh);
  window.addEventListener('resize', () => {
    if (state.stats) {
      drawChart(state.stats.chart || { labels: [], values: [] });
    }
  });

  refresh();
  state.refreshTimer = window.setInterval(refresh, 5000);
}());
