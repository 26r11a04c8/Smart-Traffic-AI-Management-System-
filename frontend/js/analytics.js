/**
 * Traffic Analytics & AI Intelligence Module (View 3)
 * Renders Chart.js visualizations for 24-hour peak congestion profiles,
 * speed-density degradation, accident hotspot rankings, and AI adaptive signal effectiveness.
 */

let chartHourly = null;
let chartSpeedDensity = null;
let chartAccidents = null;
let chartEffectiveness = null;

async function initAnalyticsCharts() {
  try {
    const res = await fetch('/api/analytics');
    const data = await res.json();
    renderCharts(data);
  } catch (err) {
    console.error('Error fetching analytics:', err);
  }
}

function renderCharts(data) {
  // Chart 1: 24-Hour Traffic Volume & Recurring Peak Surges
  const ctxHourly = document.getElementById('chart-hourly')?.getContext('2d');
  if (ctxHourly && !chartHourly) {
    const labels = data.hourlyPatterns.map(p => p.label);
    const volumes = data.hourlyPatterns.map(p => p.volumePercent);

    chartHourly = new Chart(ctxHourly, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Traffic Volume (% Capacity)',
          data: volumes,
          borderColor: '#00f2fe',
          backgroundColor: 'rgba(0, 242, 254, 0.12)',
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#00f2fe',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: function(context) {
                const pattern = data.hourlyPatterns[context.dataIndex];
                return pattern.note ? `Note: ${pattern.note}` : '';
              }
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' }, min: 0, max: 100 }
        }
      }
    });
  }

  // Chart 2: Speed vs Density Degradation Curve (Greenshields)
  const ctxSpeed = document.getElementById('chart-speed-density')?.getContext('2d');
  if (ctxSpeed && !chartSpeedDensity) {
    const labels = data.speedVsDensity.map(d => d.density);
    const speeds = data.speedVsDensity.map(d => d.avgSpeedKmh);

    chartSpeedDensity = new Chart(ctxSpeed, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Avg Speed (km/h)',
          data: speeds,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#f59e0b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' }, min: 0, max: 70 }
        }
      }
    });
  }

  // Chart 3: Accident Hotspot Frequency & Vulnerability
  const ctxAccidents = document.getElementById('chart-accidents')?.getContext('2d');
  if (ctxAccidents && !chartAccidents) {
    const labels = data.accidentHotspots.map(h => h.name.split(' ')[0]);
    const counts = data.accidentHotspots.map(h => h.historicalCount);

    chartAccidents = new Chart(ctxAccidents, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Recorded Historical Accidents',
          data: counts,
          backgroundColor: data.accidentHotspots.map(h => h.riskScore >= 0.7 ? '#ef4444' : '#3b82f6'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  }

  // Chart 4: Adaptive Signal Diversion Effectiveness (Before vs After)
  const ctxEff = document.getElementById('chart-effectiveness')?.getContext('2d');
  if (ctxEff && !chartEffectiveness) {
    chartEffectiveness = new Chart(ctxEff, {
      type: 'bar',
      data: {
        labels: ['Peak Office Rush (17:00)', 'Heavy Rainfall Surge', 'Incident Clearance', 'Corridor Clearance'],
        datasets: [
          {
            label: 'Fixed Static Timing Delay (min)',
            data: [28, 35, 42, 18],
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderRadius: 4
          },
          {
            label: 'AURA AI Adaptive Timing (min)',
            data: [15, 18, 19, 6],
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#f8fafc', font: { family: 'Outfit' } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  }
}

window.initAnalyticsCharts = initAnalyticsCharts;
