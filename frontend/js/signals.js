/**
 * Traffic Signals & Upstream Queue Guard Module
 * Renders the 4-phase signal matrix, monitors downstream queue thresholds,
 * displays upstream holding status, and handles control room manual overrides.
 */

function updateSignalsMatrix(state) {
  const container = document.getElementById('signals-matrix-container');
  if (!container || !state || !state.intersections) return;

  const html = state.intersections.map(inter => {
    const sig = inter.signal;
    const isHold = sig.upstreamHold;
    const isEmergency = sig.emergencyOverride;
    const states = sig.currentStates || { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' };

    return `
      <div class="signal-row-card ${isHold ? 'hold-active' : ''}">
        <div class="signal-card-header">
          <div>
            <div class="signal-name">${inter.name}</div>
            <div style="font-size: 0.68rem; color: var(--text-muted);">ID: ${inter.id} | Type: ${inter.type}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${isHold ? '<span class="badge badge-danger">⛔ UPSTREAM HOLD</span>' : ''}
            ${isEmergency ? '<span class="badge badge-success">🚑 GREEN CORRIDOR</span>' : ''}
            <div class="signal-timer-badge">${sig.countdown}s</div>
          </div>
        </div>

        <!-- 4-Direction Traffic Light States -->
        <div class="signal-phases-grid">
          ${['NORTH', 'SOUTH', 'EAST', 'WEST'].map(dir => {
            const st = states[dir] || 'RED';
            return `
              <div class="signal-dir-box">
                <span class="dir-label">${dir}</span>
                <div class="traffic-light-head">
                  <div class="light-dot red ${st === 'RED' ? 'active' : ''}"></div>
                  <div class="light-dot yellow ${st === 'YELLOW' ? 'active' : ''}"></div>
                  <div class="light-dot green ${st === 'GREEN' ? 'active' : ''}"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${isHold ? `
          <div class="signal-hold-alert">
            <span>⛔ METERING FLOW:</span> ${sig.holdReason || 'Downstream queue overflow protection.'}
          </div>
        ` : ''}

        ${isEmergency ? `
          <div style="font-size: 0.7rem; color: var(--accent-cyan); font-weight: 600;">
            ${sig.overrideReason || 'Emergency Priority Lock active.'}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
          <button class="btn btn-xs btn-secondary" onclick="window.openManualOverrideModal('${inter.id}', '${inter.name}')">
            Override Signal
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Modal open helper
window.openManualOverrideModal = function(id, name) {
  const modal = document.getElementById('modal-override');
  const title = document.getElementById('override-modal-title');
  if (modal && title) {
    title.innerText = `Manual Signal Override: ${name}`;
    modal.dataset.intersectionId = id;
    modal.classList.remove('hidden');
  }
};

window.updateSignalsMatrix = updateSignalsMatrix;
