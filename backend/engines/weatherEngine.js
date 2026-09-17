/**
 * Weather & Waterlogging Prediction Engine
 * Computes runoff accumulation, drainage capacity deficits, and road waterlogging risk.
 */

function assessWaterloggingRisk(road, weather) {
  const rainIntensity = weather.rainIntensityMmHr || 0;
  const drainageCap = (road.drainageIndex || 0.5) * 50; // mm/hr capacity

  const deficit = Math.max(0, rainIntensity - drainageCap);
  
  let riskLevel = 'LOW';
  let waterLevelMm = 0;
  let recommendedAction = 'Normal drainage operating within safety tolerance.';

  if (rainIntensity >= 40 && road.drainageIndex < 0.5) {
    riskLevel = 'CRITICAL';
    waterLevelMm = Math.round(deficit * 1.8);
    recommendedAction = `Immediate road closure recommended. Water depth ~${waterLevelMm}mm. Divert traffic to elevated bypass.`;
  } else if (rainIntensity >= 30 && road.drainageIndex < 0.65) {
    riskLevel = 'HIGH';
    waterLevelMm = Math.round(deficit * 1.2);
    recommendedAction = `Broadcast hazard warning. Restrict low-clearance vehicles. Direct commuters to alternate higher elevation arterial.`;
  } else if (rainIntensity >= 15) {
    riskLevel = 'MEDIUM';
    waterLevelMm = Math.round(deficit * 0.5);
    recommendedAction = 'Monitor stormwater drain grates. Speed advisory 30 km/h.';
  }

  return {
    roadId: road.id,
    roadName: road.name,
    rainIntensityMmHr: rainIntensity,
    drainageIndex: road.drainageIndex,
    waterloggingRisk: riskLevel,
    estimatedWaterLevelMm: waterLevelMm,
    recommendedAction,
    alertPolice: riskLevel === 'HIGH' || riskLevel === 'CRITICAL',
    alertCommuters: riskLevel === 'HIGH' || riskLevel === 'CRITICAL'
  };
}

module.exports = { assessWaterloggingRisk };
