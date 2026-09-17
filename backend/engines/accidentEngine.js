/**
 * Accident-Prone Location & Risk Prediction Engine
 * Correlates historical accident density, rainfall slickness, peak hours, and geometric collision risk.
 */

function assessAccidentRisk(intersection, roads, simHour, weather) {
  let baseScore = intersection.isAccidentHotspot ? 0.65 : 0.20;
  
  // Weather slickness factor
  let rainFactor = 0;
  if (weather && weather.rainIntensityMmHr > 0) {
    // Wet roads increase braking distance and hydroplaning risk
    rainFactor = Math.min(0.35, (weather.rainIntensityMmHr / 100) * 0.65);
  }

  // Evening peak rush visibility & driver fatigue factor (17:00 - 19:30)
  let peakRushFactor = 0;
  if (simHour >= 17.0 && simHour <= 19.5) {
    peakRushFactor = 0.25;
  } else if (simHour >= 8.0 && simHour <= 9.5) {
    peakRushFactor = 0.15;
  }

  // Connected road density
  const connectedRoadObjects = roads.filter(r => intersection.connectedRoads.includes(r.id));
  const avgDensity = connectedRoadObjects.length > 0 
    ? connectedRoadObjects.reduce((acc, r) => acc + (r.currentVehicles / r.capacity), 0) / connectedRoadObjects.length
    : 0.5;

  const totalRisk = Math.min(1.0, baseScore + rainFactor + peakRushFactor + (avgDensity * 0.2));

  let riskLevel = 'LOW RISK';
  if (totalRisk >= 0.70) {
    riskLevel = 'HIGH RISK';
  } else if (totalRisk >= 0.45) {
    riskLevel = 'MEDIUM RISK';
  }

  // Recommendations for signal timing and police alert
  let recommendations = [];
  if (riskLevel === 'HIGH RISK') {
    recommendations = [
      'Increase yellow change-interval clearance by +1.5s to prevent dilemma-zone collisions.',
      'Extend green time for heavy volume northbound arterial to flush queue.',
      'Throttle incoming upstream feeder signals to reduce intersection convergence velocity.',
      'Dispatch mobile traffic patrol unit for visual presence & speed compliance.'
    ];
  } else if (riskLevel === 'MEDIUM RISK') {
    recommendations = [
      'Enable automated red-light speed radar warning flashes.',
      'Maintain balanced phase split to avoid spillover queues.'
    ];
  } else {
    recommendations = ['Standard automated signal rotation.'];
  }

  return {
    intersectionId: intersection.id,
    intersectionName: intersection.name,
    riskScore: Math.round(totalRisk * 100) / 100,
    riskLevel,
    isHotspot: intersection.isAccidentHotspot || false,
    historicalCount: intersection.historicalAccidentCount || 8,
    contributingFactors: [
      { name: 'Historical Incident Weight', value: intersection.isAccidentHotspot ? 'High Baseline (38 accidents)' : 'Low Baseline' },
      { name: 'Weather / Road Slickness', value: weather.rainIntensityMmHr > 20 ? `Heavy Rain (${weather.rainIntensityMmHr} mm/h)` : 'Normal Friction' },
      { name: 'Time-of-Day Pattern', value: simHour >= 17 && simHour <= 19 ? 'Evening Peak Office Rush' : 'Off-Peak Hours' },
      { name: 'Intersection Vehicle Density', value: `${Math.round(avgDensity * 100)}% Capacity` }
    ],
    recommendedActions: recommendations
  };
}

module.exports = { assessAccidentRisk };
