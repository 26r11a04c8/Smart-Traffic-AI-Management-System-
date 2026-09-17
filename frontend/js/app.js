/**
 * AURA SMART TRAFFIC AI - Master Application Coordinator
 * Handles WebSocket telemetry, state updates, simulation controls,
 * scenario executions, and UI view transitions.
 */

const socket = io();
let currentState = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Leaflet Map
  if (window.initCityMap) {
    window.initCityMap();
  }

  // Bind WebSocket Event Listeners
  socket.on('connect', () => {
    console.log('[AURA] Connected to Real-time Traffic AI Server');
  });

  socket.on('state', (state) => {
    currentState = state;
    renderFullState(state);
  });

  socket.on('new_alert', (alert) => {
    showNotificationToast(alert);
  });

  // Setup UI Event Handlers
  setupViewTabs();
  setupSidebarTabs();
  setupSimulationControls();
  setupScenarioButtons();
  setupIncidentForm();
  setupModalOverride();
  setupMapLayerListeners();
  setupAccessibilityModal();

  // Initial fetch for state snapshot in case socket connects after load
  fetch('/api/city/state')
    .then(res => res.json())
    .then(state => {
      currentState = state;
      renderFullState(state);
    })
    .catch(err => console.error('Initial state fetch error:', err));
});

// Master State Render Pipeline
function renderFullState(state) {
  if (!state) return;

  // 1. Header Telemetry
  const clockElem = document.getElementById('sim-clock');
  if (clockElem) clockElem.innerText = state.simTime;

  const weatherVal = document.getElementById('weather-value');
  const weatherIcon = document.getElementById('weather-icon');
  if (weatherVal && state.weather) {
    weatherVal.innerText = `${state.weather.condition.replace('_', ' ')} (${state.weather.rainIntensityMmHr}mm/h)`;
    weatherIcon.innerText = state.weather.rainIntensityMmHr > 20 ? '🌧️' : '☀️';
  }

  const simStatus = document.getElementById('sim-status-text');
  const statusDot = document.getElementById('sim-status-dot');
  if (simStatus && statusDot) {
    if (state.simRunning) {
      simStatus.innerText = `ACTIVE (${state.simSpeed}x)`;
      statusDot.style.backgroundColor = 'var(--accent-green)';
    } else {
      simStatus.innerText = 'PAUSED';
      statusDot.style.backgroundColor = 'var(--accent-yellow)';
    }
  }

  // 2. KPI Metrics
  if (state.kpi) {
    const congVal = document.getElementById('kpi-congestion-val');
    const congFill = document.getElementById('kpi-congestion-fill');
    const congBadge = document.getElementById('kpi-congestion-badge');
    if (congVal) congVal.innerText = `${state.kpi.cityCongestionIndex}%`;
    if (congFill) congFill.style.width = `${state.kpi.cityCongestionIndex}%`;
    if (congBadge) {
      congBadge.innerText = state.kpi.cityCongestionIndex >= 80 ? 'SEVERE' : (state.kpi.cityCongestionIndex >= 60 ? 'HIGH' : 'NORMAL');
      congBadge.className = `kpi-badge ${state.kpi.cityCongestionIndex >= 80 ? 'badge-danger' : (state.kpi.cityCongestionIndex >= 60 ? 'badge-warning' : 'badge-success')}`;
    }

    const holdsVal = document.getElementById('kpi-holds-val');
    const holdsBadge = document.getElementById('kpi-holds-badge');
    if (holdsVal) holdsVal.innerText = `${state.kpi.activeUpstreamHolds} Junction${state.kpi.activeUpstreamHolds === 1 ? '' : 's'}`;
    if (holdsBadge) {
      holdsBadge.innerText = state.kpi.activeUpstreamHolds > 0 ? 'ACTIVE' : 'IDLE';
      holdsBadge.className = `kpi-badge ${state.kpi.activeUpstreamHolds > 0 ? 'badge-danger' : 'badge-success'}`;
    }

    const ambVal = document.getElementById('kpi-emergency-val');
    const ambBadge = document.getElementById('kpi-emergency-badge');
    if (ambVal) ambVal.innerText = `${state.kpi.activeCorridors} Active`;
    if (ambBadge) {
      ambBadge.innerText = state.kpi.activeCorridors > 0 ? 'ACTIVE GREEN WAVE' : 'STANDBY';
      ambBadge.className = `kpi-badge ${state.kpi.activeCorridors > 0 ? 'badge-danger' : 'badge-success'}`;
    }

    const alertCount = document.getElementById('alert-count-badge');
    if (alertCount) alertCount.innerText = state.alerts?.length || 0;
  }

  // 3. Update Interactive Leaflet Map
  if (window.updateCityMap) {
    window.updateCityMap(state);
  }

  // 4. Update Signals & Upstream Queue Guard
  if (window.updateSignalsMatrix) {
    window.updateSignalsMatrix(state);
  }

  // 5. Update Alerts Feed
  renderAlertsFeed(state.alerts);

  // 6. Update Active Incidents List
  renderActiveIncidents(state.incidents);

  // 7. Update AI Explainability Card
  renderAIExplainability(state);
}

function renderAlertsFeed(alerts) {
  const container = document.getElementById('alerts-feed-container');
  if (!container || !alerts) return;

  if (alerts.length === 0) {
    container.innerHTML = '<div style="font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 20px;">No critical alerts active. System operating within optimal thresholds.</div>';
    return;
  }

  container.innerHTML = alerts.map(alt => `
    <div class="alert-item sev-${alt.severity}">
      <div class="alert-top">
        <span class="alert-loc">${alt.location}</span>
        <span class="badge ${alt.severity === 'CRITICAL' ? 'badge-danger' : (alt.severity === 'HIGH' ? 'badge-warning' : 'badge-info')}">
          ${alt.severity}
        </span>
      </div>
      <div class="alert-reason">${alt.reason}</div>
      <div class="alert-rec">👉 ${alt.recommendedAction}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.68rem; color: var(--text-muted);">
        <span>Confidence: ${alt.confidence}%</span>
        <span>${new Date(alt.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  `).join('');
}

function renderActiveIncidents(incidents) {
  const container = document.getElementById('active-incidents-container');
  if (!container) return;

  if (!incidents || incidents.length === 0) {
    container.innerHTML = '<div style="font-size: 0.74rem; color: var(--text-muted); padding: 8px 0;">No active road incidents reported.</div>';
    return;
  }

  container.innerHTML = incidents.map(inc => `
    <div class="active-incident-item">
      <div>
        <strong>${inc.name}</strong> (${inc.type})<br/>
        <span style="color: var(--text-muted); font-size: 0.7rem;">${inc.locationName} • ${inc.blockedLanes} Lane Closed</span>
      </div>
      <button class="btn btn-xs btn-secondary" onclick="window.deleteIncident('${inc.id}')">Resolve</button>
    </div>
  `).join('');
}

function renderAIExplainability(state) {
  // Find highest risk / bottleneck road for primary explainability card
  const rd1 = state.roads?.find(r => r.id === 'RD_1') || state.roads?.[0];
  if (!rd1 || !rd1.aiPrediction) return;

  const pred = rd1.aiPrediction;
  const confElem = document.getElementById('ai-rec-conf');
  if (confElem) confElem.innerText = `Confidence: ${pred.confidencePercent}%`;

  const barsContainer = document.getElementById('ai-factor-bars');
  if (barsContainer && pred.factors) {
    barsContainer.innerHTML = pred.factors.map(f => {
      const numMatch = f.impact.match(/\d+/);
      const pct = numMatch ? Math.min(100, Math.max(10, parseInt(numMatch[0]))) : 30;
      return `
        <div class="factor-row">
          <span class="factor-label" title="${f.name}">${f.name}</span>
          <div class="factor-bar-track">
            <div class="factor-bar-fill ${pct >= 35 ? 'bg-high' : 'bg-mod'}" style="width: ${pct}%;"></div>
          </div>
          <span class="factor-val">${f.impact}</span>
        </div>
      `;
    }).join('');
  }
}

// Global helper to delete incident
window.deleteIncident = async function(id) {
  try {
    await fetch(`/api/incidents/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to resolve incident:', err);
  }
};

// UI View Switcher
function setupViewTabs() {
  const tabDashboard = document.getElementById('tab-dashboard');
  const tabNavigation = document.getElementById('tab-navigation');
  const tabAnalytics = document.getElementById('tab-analytics');

  const viewDashboard = document.getElementById('view-dashboard');
  const viewNavigation = document.getElementById('view-navigation');
  const viewAnalytics = document.getElementById('view-analytics');

  function switchView(tab, view) {
    [tabDashboard, tabNavigation, tabAnalytics].forEach(t => t?.classList.remove('active'));
    [viewDashboard, viewNavigation, viewAnalytics].forEach(v => v?.classList.remove('active'));

    tab.classList.add('active');
    view.classList.add('active');

    if (view === viewNavigation && window.refreshCommuterMap) {
      window.refreshCommuterMap();
    } else if (view === viewAnalytics && window.initAnalyticsCharts) {
      window.initAnalyticsCharts();
    }
  }

  tabDashboard?.addEventListener('click', () => switchView(tabDashboard, viewDashboard));
  tabNavigation?.addEventListener('click', () => switchView(tabNavigation, viewNavigation));
  tabAnalytics?.addEventListener('click', () => switchView(tabAnalytics, viewAnalytics));

  // Navigation Calculate Route button
  document.getElementById('btn-calculate-route')?.addEventListener('click', () => {
    if (window.calculateAndDisplayRoute) window.calculateAndDisplayRoute();
  });
}

// Sidebar Tabs Switcher
function setupSidebarTabs() {
  const sideTabs = document.querySelectorAll('.side-tab-btn');
  const sidePanels = document.querySelectorAll('.side-panel-content');

  sideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sideTabs.forEach(t => t.classList.remove('active'));
      sidePanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  document.getElementById('btn-clear-alerts')?.addEventListener('click', () => {
    const container = document.getElementById('alerts-feed-container');
    if (container) container.innerHTML = '<div style="font-size: 0.74rem; color: var(--accent-green); text-align: center; padding: 20px;">All alerts acknowledged by operator.</div>';
  });
}

// Simulation Play/Pause/Speed/Reset Controls
function setupSimulationControls() {
  const btnPlay = document.getElementById('btn-sim-play');
  const btnPause = document.getElementById('btn-sim-pause');
  const btnReset = document.getElementById('btn-sim-reset');
  const speedBtns = [
    { btn: document.getElementById('btn-sim-speed-1'), speed: 1 },
    { btn: document.getElementById('btn-sim-speed-2'), speed: 2 },
    { btn: document.getElementById('btn-sim-speed-5'), speed: 5 }
  ];

  btnPlay?.addEventListener('click', () => {
    fetch('/api/simulation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'play' })
    });
    btnPlay.classList.add('active');
    btnPause?.classList.remove('active');
  });

  btnPause?.addEventListener('click', () => {
    fetch('/api/simulation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' })
    });
    btnPause.classList.add('active');
    btnPlay?.classList.remove('active');
  });

  btnReset?.addEventListener('click', () => {
    fetch('/api/simulation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
  });

  speedBtns.forEach(({ btn, speed }) => {
    btn?.addEventListener('click', () => {
      speedBtns.forEach(sb => sb.btn?.classList.remove('active'));
      btn.classList.add('active');
      fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speed', value: speed })
      });
    });
  });
}

// Preset Scenarios (Section 23 Demo)
function setupScenarioButtons() {
  // Main Section 23 Final Demo Scenario button
  document.getElementById('btn-eval-scenario')?.addEventListener('click', () => {
    fetch('/api/simulation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scenario', preset: 'final_demo' })
    });
  });

  // Quick Ambulance Dispatch button
  document.getElementById('btn-quick-ambulance')?.addEventListener('click', () => {
    fetch('/api/emergency/ambulance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `AMB-CORRIDOR-${Math.floor(100 + Math.random() * 899)}`,
        callSign: 'Metro Cardiac Unit',
        startIntersectionId: 'INT_2',
        endIntersectionId: 'INT_6',
        speedKmh: 70
      })
    });
  });

  // Quick ribbon chips
  document.querySelectorAll('.ribbon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const preset = chip.dataset.preset;
      fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scenario', preset })
      });
    });
  });
}

// Incident Dispatcher Form
function setupIncidentForm() {
  const form = document.getElementById('form-add-incident');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('inc-type').value;
    const roadId = document.getElementById('inc-road').value;
    const name = document.getElementById('inc-name').value;
    const blockedLanes = parseInt(document.getElementById('inc-lanes').value);

    const roadObj = currentState?.roads?.find(r => r.id === roadId);
    const locationName = roadObj ? roadObj.name : 'City Sector';

    try {
      await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, roadId, name, locationName, blockedLanes })
      });
      // Switch sidebar tab to incidents view
      document.querySelector('[data-target="panel-incidents"]')?.click();
    } catch (err) {
      console.error('Failed to dispatch incident:', err);
    }
  });
}

// Manual Signal Override Modal
function setupModalOverride() {
  const modal = document.getElementById('modal-override');
  const btnClose = document.getElementById('btn-close-override');
  const btnCancel = document.getElementById('btn-cancel-override');
  const btnApply = document.getElementById('btn-apply-override');

  const closeModal = () => modal?.classList.add('hidden');
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  btnApply?.addEventListener('click', async () => {
    const interId = modal.dataset.intersectionId;
    const direction = document.getElementById('override-direction').value;
    const duration = parseInt(document.getElementById('override-duration').value);

    if (interId) {
      try {
        await fetch(`/api/signals/${interId}/override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction, state: 'GREEN', duration })
        });
      } catch (err) {
        console.error('Override error:', err);
      }
    }
    closeModal();
  });
}

// Map Layer Toggles
function setupMapLayerListeners() {
  ['layer-traffic', 'layer-signals', 'layer-accidents', 'layer-waterlogging', 'layer-emergency'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (window.updateCityMap && currentState) {
        window.updateCityMap(currentState);
      }
    });
  });
}

// Notification Toast for high severity alerts & Speech Voice Synthesis
function showNotificationToast(alert) {
  if (!alert) return;
  console.log('[ALERT TOAST]', alert.severity, alert.location, alert.reason);

  // If Speech Assistant is enabled, announce critical alerts
  if (localStorage.getItem('aura_speech_alerts') === 'true' && ('speechSynthesis' in window)) {
    if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
      const utterance = new SpeechSynthesisUtterance(`Alert. ${alert.location}. ${alert.reason}`);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }
}

// Accessibility & Google Maps Preferences Modal Coordinator
function setupAccessibilityModal() {
  const modal = document.getElementById('modal-accessibility');
  const btnOpen = document.getElementById('btn-open-accessibility');
  const btnClose = document.getElementById('btn-close-accessibility');
  const btnSave = document.getElementById('btn-save-accessibility');

  const defaultMapSelect = document.getElementById('access-default-map-select');
  const toggleContrast = document.getElementById('toggle-high-contrast');
  const toggleFont = document.getElementById('toggle-large-font');
  const toggleSpeech = document.getElementById('toggle-speech-alerts');

  // Load Saved Preferences
  const savedMap = localStorage.getItem('aura_base_map') || 'google-streets';
  const savedContrast = localStorage.getItem('aura_high_contrast') === 'true';
  const savedFont = localStorage.getItem('aura_large_font') === 'true';
  const savedSpeech = localStorage.getItem('aura_speech_alerts') === 'true';

  if (defaultMapSelect) defaultMapSelect.value = savedMap;
  if (toggleContrast) toggleContrast.checked = savedContrast;
  if (toggleFont) toggleFont.checked = savedFont;
  if (toggleSpeech) toggleSpeech.checked = savedSpeech;

  // Apply visual modes immediately
  document.body.classList.toggle('high-contrast', savedContrast);
  document.body.classList.toggle('large-font', savedFont);

  const openModal = () => modal?.classList.remove('hidden');
  const closeModal = () => modal?.classList.add('hidden');

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);

  btnSave?.addEventListener('click', () => {
    const selectedMap = defaultMapSelect?.value || 'google-streets';
    const isContrast = !!toggleContrast?.checked;
    const isFont = !!toggleFont?.checked;
    const isSpeech = !!toggleSpeech?.checked;

    localStorage.setItem('aura_base_map', selectedMap);
    localStorage.setItem('aura_high_contrast', isContrast ? 'true' : 'false');
    localStorage.setItem('aura_large_font', isFont ? 'true' : 'false');
    localStorage.setItem('aura_speech_alerts', isSpeech ? 'true' : 'false');

    document.body.classList.toggle('high-contrast', isContrast);
    document.body.classList.toggle('large-font', isFont);

    // Apply base map changes to both maps
    if (window.setCityBaseLayer) window.setCityBaseLayer(selectedMap);
    if (window.setCommuterBaseLayer) window.setCommuterBaseLayer(selectedMap);

    // Provide audible confirmation if speech turned on
    if (isSpeech && ('speechSynthesis' in window)) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('Accessibility preferences saved. Google Maps and voice navigation active.'));
    }

    closeModal();
  });
}
