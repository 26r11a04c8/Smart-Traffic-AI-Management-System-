/**
 * Commuter Navigation & Dynamic Diversion Module (View 2)
 * Provides normal road users with trip planning, delay predictions,
 * hazard notifications, and dynamic AI diversion route recommendations.
 */

let commuterMap = null;
let primaryRouteLayer = null;
let alternateRouteLayer = null;
let navOriginMarker = null;
let navDestMarker = null;

function initCommuterMap() {
  const mapElem = document.getElementById('commuter-map');
  if (!mapElem || commuterMap) return;

  commuterMap = L.map('commuter-map', {
    center: [12.9700, 77.5950],
    zoom: 13,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(commuterMap);
}

async function calculateAndDisplayRoute() {
  if (!commuterMap) initCommuterMap();

  const origin = document.getElementById('nav-origin')?.value || 'INT_1';
  const destination = document.getElementById('nav-destination')?.value || 'INT_4';

  try {
    const res = await fetch(`/api/navigation/route?origin=${origin}&destination=${destination}`);
    const data = await res.json();
    renderRouteResults(data);
  } catch (err) {
    console.error('Error fetching route:', err);
  }
}

function renderRouteResults(data) {
  const resultsContainer = document.getElementById('route-results-card');
  const hudEta = document.getElementById('hud-eta');
  const hudSaved = document.getElementById('hud-saved');
  const hudStatus = document.getElementById('hud-status');
  const alertsFeed = document.getElementById('nav-alerts-feed');

  if (!resultsContainer) return;

  const { origin, destination, primaryRoute, recommendedAlternateRoute, diversionRecommended, diversionReason } = data;

  // Clear previous layers
  if (primaryRouteLayer) commuterMap.removeLayer(primaryRouteLayer);
  if (alternateRouteLayer) commuterMap.removeLayer(alternateRouteLayer);
  if (navOriginMarker) commuterMap.removeLayer(navOriginMarker);
  if (navDestMarker) commuterMap.removeLayer(navDestMarker);

  // Add Origin / Destination Markers
  navOriginMarker = L.marker([origin.lat, origin.lng], {
    icon: L.divIcon({
      html: '<div style="background:#10b981; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px #10b981;"></div>',
      className: 'nav-dot',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(commuterMap).bindPopup(`<b>Origin:</b> ${origin.name}`);

  navDestMarker = L.marker([destination.lat, destination.lng], {
    icon: L.divIcon({
      html: '<div style="background:#ef4444; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px #ef4444;"></div>',
      className: 'nav-dot',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(commuterMap).bindPopup(`<b>Destination:</b> ${destination.name}`);

  // Draw Primary Route (Dotted Red / Orange if incident/hazard, or solid Blue)
  if (primaryRoute && primaryRoute.coordinates.length > 0) {
    const isProblematic = primaryRoute.isBlocked || diversionRecommended;
    primaryRouteLayer = L.polyline(primaryRoute.coordinates, {
      color: isProblematic ? '#ef4444' : '#3b82f6',
      weight: 6,
      opacity: 0.8,
      dashArray: isProblematic ? '8, 8' : null
    }).addTo(commuterMap);
  }

  // Draw Recommended Alternate Route (Solid Emerald Green with glow)
  if (recommendedAlternateRoute && recommendedAlternateRoute.coordinates.length > 0) {
    alternateRouteLayer = L.polyline(recommendedAlternateRoute.coordinates, {
      color: '#10b981',
      weight: 8,
      opacity: 0.95
    }).addTo(commuterMap);

    // Fit map bounds to show full route
    const allCoords = [
      ...(primaryRoute?.coordinates || []),
      ...(recommendedAlternateRoute?.coordinates || [])
    ];
    if (allCoords.length > 0) {
      commuterMap.fitBounds(L.polyline(allCoords).getBounds(), { padding: [40, 40] });
    }
  }

  // Update HUD
  const activeEta = recommendedAlternateRoute ? recommendedAlternateRoute.etaMinutes : (primaryRoute?.etaMinutes || 20);
  if (hudEta) hudEta.innerText = `${activeEta} mins`;

  if (diversionRecommended && primaryRoute && recommendedAlternateRoute) {
    const saved = Math.max(1, primaryRoute.etaMinutes - recommendedAlternateRoute.etaMinutes);
    if (hudSaved) hudSaved.innerText = `⚡ ${saved} mins saved by AI diversion`;
    if (hudStatus) hudStatus.innerText = `🟡 Alternate Route Active`;
  } else {
    if (hudSaved) hudSaved.innerText = `Direct flow clear`;
    if (hudStatus) hudStatus.innerText = `🟢 Normal Flow`;
  }

  // Build Route Comparison HTML Cards
  let cardsHtml = '';

  // AI Alternate Route Card (Recommended)
  if (recommendedAlternateRoute) {
    cardsHtml += `
      <div class="route-card smart-recommended">
        <div class="route-top">
          <span class="route-eta text-success">${recommendedAlternateRoute.etaMinutes} MINS</span>
          <span class="route-dist">${recommendedAlternateRoute.totalDistanceKm} km</span>
        </div>
        <span class="route-badge badge-success">✓ AI RECOMMENDED DIVERSION</span>
        <div class="route-desc">
          ${diversionReason || 'Optimal route with synchronized green waves and clear arterial flow.'}
        </div>
        <div style="margin-top: 8px; font-size: 0.72rem; color: var(--text-muted);">
          Via: <strong>${recommendedAlternateRoute.roadSegments.map(s => s.name.split(' ')[0]).join(' → ')}</strong>
        </div>
      </div>
    `;
  }

  // Original Direct Route Card
  if (primaryRoute) {
    const isBad = primaryRoute.isBlocked || diversionRecommended;
    cardsHtml += `
      <div class="route-card ${isBad ? 'original-blocked' : ''}">
        <div class="route-top">
          <span class="route-eta ${isBad ? 'text-danger' : 'text-primary'}">${primaryRoute.etaMinutes} MINS</span>
          <span class="route-dist">${primaryRoute.totalDistanceKm} km</span>
        </div>
        <span class="route-badge ${isBad ? 'badge-danger' : 'badge-info'}">
          ${isBad ? '⚠️ HEAVY DELAY / HAZARD' : 'DIRECT ROUTE'}
        </span>
        <div class="route-desc">
          ${primaryRoute.isBlocked ? 'Road impassable ahead. Emergency services on scene.' : 'Direct geometric path.'}
          ${primaryRoute.hazards.length > 0 ? `<br/><span style="color: var(--accent-red);">${primaryRoute.hazards.join('<br/>')}</span>` : ''}
        </div>
      </div>
    `;
  }

  resultsContainer.innerHTML = cardsHtml;

  // Build Commuter Safety Alerts Feed
  if (alertsFeed) {
    const combinedHazards = [
      ...(primaryRoute?.hazards || []),
      ...(recommendedAlternateRoute?.hazards || [])
    ];

    if (combinedHazards.length === 0) {
      alertsFeed.innerHTML = '<div style="font-size: 0.74rem; color: var(--accent-green); padding: 8px 0;">✓ No critical hazards detected on recommended path.</div>';
    } else {
      alertsFeed.innerHTML = Array.from(new Set(combinedHazards)).map(hz => `
        <div style="background: rgba(239, 68, 68, 0.08); border-left: 2px solid var(--accent-red); padding: 6px 10px; font-size: 0.73rem; margin-bottom: 6px;">
          ${hz}
        </div>
      `).join('');
    }
  }
}

// Invalidate commuter map size when switching to Navigation View
function refreshCommuterMap() {
  setTimeout(() => {
    if (commuterMap) {
      commuterMap.invalidateSize();
    } else {
      initCommuterMap();
    }
    calculateAndDisplayRoute();
  }, 200);
}

window.initCommuterMap = initCommuterMap;
window.calculateAndDisplayRoute = calculateAndDisplayRoute;
window.refreshCommuterMap = refreshCommuterMap;
