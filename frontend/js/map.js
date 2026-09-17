/**
 * Map Visualization Module (Leaflet.js)
 * High-tech dark vector map rendering live road traffic flow, adaptive signals,
 * upstream hold warnings, waterlogging zones, incidents, and ambulance green corridors.
 */

let cityMap = null;
let roadLayers = {};
let intersectionMarkers = {};
let ambulanceMarker = null;
let corridorPolyline = null;
let incidentMarkers = [];
let waterlogMarkers = [];

function initCityMap() {
  const mapElement = document.getElementById('city-map');
  if (!mapElement || cityMap) return;

  // Center on Bangalore coordinates around Central Square
  cityMap = L.map('city-map', {
    center: [12.9700, 77.5950],
    zoom: 14,
    zoomControl: true,
    attributionControl: false
  });

  // Base Dark Tile Layer (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(cityMap);
}

function updateCityMap(state) {
  if (!cityMap) initCityMap();
  if (!state) return;

  const { roads, intersections, ambulances, incidents, weather } = state;

  // 1. Render Road Segments & Traffic Congestion
  const showTraffic = document.getElementById('layer-traffic')?.checked ?? true;
  roads.forEach(road => {
    const coords = road.coordinates;
    let color = '#10b981'; // LOW
    let weight = 6;
    let opacity = 0.85;

    const level = road.aiPrediction?.congestionLevel || road.congestionLevel;
    if (road.status === 'BLOCKED') {
      color = '#ef4444';
      weight = 8;
    } else if (level === 'SEVERE') {
      color = '#ef4444';
      weight = 8;
    } else if (level === 'HIGH') {
      color = '#f97316';
      weight = 7;
    } else if (level === 'MODERATE') {
      color = '#f59e0b';
      weight = 6;
    }

    if (!showTraffic) {
      color = '#475569';
      weight = 4;
    }

    if (!roadLayers[road.id]) {
      const poly = L.polyline(coords, {
        color,
        weight,
        opacity,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(cityMap);

      poly.on('click', () => {
        selectRoadInspector(road, state);
      });

      roadLayers[road.id] = poly;
    } else {
      roadLayers[road.id].setStyle({ color, weight, opacity });
    }
  });

  // 2. Render Intersections & Live Signals
  const showSignals = document.getElementById('layer-signals')?.checked ?? true;
  intersections.forEach(inter => {
    const latlng = [inter.lat, inter.lng];
    const sig = inter.signal;
    const isHold = sig.upstreamHold;
    const isCorridor = sig.emergencyOverride;

    // Determine active primary color
    let lightColor = '#10b981';
    const activeStates = Object.values(sig.currentStates);
    if (activeStates.includes('GREEN')) lightColor = '#10b981';
    else if (activeStates.includes('YELLOW')) lightColor = '#f59e0b';
    else lightColor = '#ef4444';

    if (isHold) lightColor = '#ef4444';

    const markerHtml = `
      <div class="inter-marker-wrapper ${isHold ? 'hold-active' : ''} ${isCorridor ? 'corridor-active' : ''}">
        ${isHold ? '<div class="hold-badge-pulse">⛔ HOLD</div>' : ''}
        ${isCorridor ? '<div class="corridor-badge-pulse">🚑 CORRIDOR</div>' : ''}
        <div class="inter-signal-pill" style="border-color: ${lightColor};">
          <span class="signal-dot-mini" style="background: ${lightColor}; box-shadow: 0 0 8px ${lightColor};"></span>
          <span class="inter-countdown">${sig.countdown}s</span>
        </div>
        <div class="inter-name-label">${inter.name.split(' ')[0]}</div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: markerHtml,
      className: 'custom-intersection-marker',
      iconSize: [80, 50],
      iconAnchor: [40, 25]
    });

    if (!intersectionMarkers[inter.id]) {
      const marker = L.marker(latlng, { icon: customIcon }).addTo(cityMap);
      marker.on('click', () => {
        selectIntersectionInspector(inter, state);
      });
      intersectionMarkers[inter.id] = marker;
    } else {
      intersectionMarkers[inter.id].setIcon(customIcon);
      intersectionMarkers[inter.id].setOpacity(showSignals ? 1 : 0);
    }
  });

  // 3. Render Active Ambulances & Emergency Green Corridor
  const showEmergency = document.getElementById('layer-emergency')?.checked ?? true;
  const activeAmb = ambulances && ambulances.length > 0 ? ambulances[0] : null;

  if (activeAmb && showEmergency) {
    // Show Toast Overlay
    const overlay = document.getElementById('ambulance-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      document.getElementById('amb-card-id').innerText = `${activeAmb.id} // ${activeAmb.callSign}`;
      document.getElementById('amb-card-bar').style.width = `${activeAmb.progressPercent}%`;

      const junctionsHtml = activeAmb.upcomingJunctions.map(j => `
        <div class="amb-junction-pill ${j.status === 'ACTIVE_GREEN' ? 'active-green' : ''}">
          <strong>${j.intersectionName.split(' ')[0]}</strong>: 
          ${j.status === 'PASSED' ? 'Passed' : (j.status === 'ACTIVE_GREEN' ? '🟢 GREEN WAVE (' + j.etaSeconds + 's)' : '🟡 In ' + j.etaSeconds + 's')}
        </div>
      `).join('');
      document.getElementById('amb-card-junctions').innerHTML = junctionsHtml;
    }

    // Render Ambulance Moving Marker
    const ambHtml = `
      <div class="ambulance-live-marker">
        <span class="amb-pulse-wave"></span>
        <span class="amb-symbol">🚑</span>
      </div>
    `;
    const ambIcon = L.divIcon({
      html: ambHtml,
      className: 'custom-ambulance-icon',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (!ambulanceMarker) {
      ambulanceMarker = L.marker(activeAmb.currentCoords, { icon: ambIcon, zIndexOffset: 1000 }).addTo(cityMap);
    } else {
      ambulanceMarker.setLatLng(activeAmb.currentCoords);
    }

    // Render Glowing Neon Green Corridor Polyline
    if (!corridorPolyline) {
      corridorPolyline = L.polyline(activeAmb.waypoints, {
        color: '#00f2fe',
        weight: 9,
        opacity: 0.9,
        dashArray: '10, 10'
      }).addTo(cityMap);
    } else {
      corridorPolyline.setLatLngs(activeAmb.waypoints);
    }
  } else {
    // Hide ambulance overlay and clean up markers
    const overlay = document.getElementById('ambulance-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (ambulanceMarker) {
      cityMap.removeLayer(ambulanceMarker);
      ambulanceMarker = null;
    }
    if (corridorPolyline) {
      cityMap.removeLayer(corridorPolyline);
      corridorPolyline = null;
    }
  }

  // 4. Render Waterlogging Hazards
  const showWater = document.getElementById('layer-waterlogging')?.checked ?? true;
  waterlogMarkers.forEach(m => cityMap.removeLayer(m));
  waterlogMarkers = [];

  if (showWater) {
    roads.filter(r => r.waterlogged || r.waterLevelMm > 20).forEach(road => {
      const midCoord = road.coordinates[Math.floor(road.coordinates.length / 2)];
      const waterHtml = `
        <div class="water-hazard-badge">
          🌊 <span>${road.waterLevelMm}mm Flood</span>
        </div>
      `;
      const waterIcon = L.divIcon({
        html: waterHtml,
        className: 'custom-hazard-icon',
        iconSize: [90, 24],
        iconAnchor: [45, 12]
      });
      const wm = L.marker(midCoord, { icon: waterIcon }).addTo(cityMap);
      waterlogMarkers.push(wm);
    });
  }

  // 5. Render Incidents (Fire, Accident, Construction)
  incidentMarkers.forEach(m => cityMap.removeLayer(m));
  incidentMarkers = [];

  incidents.forEach(inc => {
    const road = roads.find(r => r.id === inc.roadId);
    if (!road) return;
    const center = road.coordinates[Math.floor(road.coordinates.length / 2)];

    let iconSymbol = '⚠️';
    let bgClass = 'bg-danger';
    if (inc.type === 'FIRE') { iconSymbol = '🔥'; }
    else if (inc.type === 'CONSTRUCTION') { iconSymbol = '🚧'; }
    else if (inc.type === 'ACCIDENT') { iconSymbol = '🚨'; }
    else if (inc.type === 'EVENT') { iconSymbol = '🎪'; }

    const incHtml = `
      <div class="incident-map-badge">
        <span>${iconSymbol}</span>
        <span class="inc-text">${inc.type}</span>
      </div>
    `;
    const incIcon = L.divIcon({
      html: incHtml,
      className: 'custom-incident-icon',
      iconSize: [80, 26],
      iconAnchor: [40, 13]
    });
    const im = L.marker(center, { icon: incIcon }).addTo(cityMap);
    im.bindPopup(`
      <div style="font-family: var(--font-main); color: #000; padding: 4px;">
        <strong>${inc.name}</strong><br/>
        Type: ${inc.type}<br/>
        Lanes: ${inc.blockedLanes} Closed<br/>
        Road: ${road.name}
      </div>
    `);
    incidentMarkers.push(im);
  });
}

function selectRoadInspector(road, state) {
  const container = document.getElementById('inspector-details');
  if (!container) return;

  const pred = road.aiPrediction;
  const capRatio = Math.round((road.currentVehicles / road.capacity) * 100);

  container.innerHTML = `
    <div class="inspector-item">
      <div class="d-flex justify-between align-center mb-2">
        <h4 style="color: #fff; font-size: 0.9rem;">${road.name}</h4>
        <span class="badge ${pred.congestionLevel === 'SEVERE' ? 'badge-danger' : (pred.congestionLevel === 'HIGH' ? 'badge-warning' : 'badge-success')}">
          ${pred.congestionLevel}
        </span>
      </div>
      
      <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 8px;">
        ID: <strong>${road.id}</strong> | Capacity: <strong>${road.currentVehicles} / ${road.capacity} vehicles (${capRatio}%)</strong>
      </div>

      <div style="font-size: 0.74rem; margin-bottom: 6px;">
        Speed: <strong>${road.currentSpeedKmh} km/h</strong> (Limit: ${road.speedLimitKmh} km/h) | Queue: <strong>${road.queueLengthMeters}m</strong>
      </div>

      <div style="font-size: 0.74rem; margin-bottom: 8px;">
        Drainage Cap: <strong>${Math.round(road.drainageIndex * 50)} mm/h</strong> | Water Level: <strong>${road.waterLevelMm || 0} mm</strong>
      </div>

      <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; font-size: 0.72rem;">
        <span style="color: var(--accent-cyan); font-weight: 700;">AI Explainability Breakdown:</span><br/>
        ${pred.factors.map(f => `• ${f.name}: <strong>${f.impact}</strong>`).join('<br/>')}
      </div>
    </div>
  `;
}

function selectIntersectionInspector(inter, state) {
  const container = document.getElementById('inspector-details');
  if (!container) return;

  const sig = inter.signal;
  const acc = inter.accidentAssessment;

  container.innerHTML = `
    <div class="inspector-item">
      <div class="d-flex justify-between align-center mb-2">
        <h4 style="color: #fff; font-size: 0.9rem;">${inter.name}</h4>
        <span class="badge ${acc?.riskLevel === 'HIGH RISK' ? 'badge-danger' : 'badge-info'}">
          ${acc?.riskLevel || 'NORMAL'}
        </span>
      </div>

      <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 8px;">
        Active Phase: <strong>${sig.activePhase}</strong> | Countdown: <strong>${sig.countdown}s</strong>
      </div>

      <div style="font-size: 0.74rem; margin-bottom: 8px;">
        Upstream Hold Status: <strong>${sig.upstreamHold ? '⛔ ACTIVE (METERING FLOW)' : '🟢 FREE FLOW'}</strong>
      </div>

      ${sig.holdReason ? `<div style="font-size: 0.72rem; color: var(--accent-red); margin-bottom: 8px;">Reason: ${sig.holdReason}</div>` : ''}

      <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 10px;">
        <span style="color: var(--accent-yellow); font-weight: 700;">AI Recommended Timing:</span><br/>
        ${inter.adaptiveTimings?.reasoning || 'Standard adaptive cycle active.'}
      </div>

      <button class="btn btn-xs btn-primary w-100" onclick="window.openManualOverrideModal('${inter.id}', '${inter.name}')">
        ⚙️ Manual Control Room Override
      </button>
    </div>
  `;
}

window.initCityMap = initCityMap;
window.updateCityMap = updateCityMap;
