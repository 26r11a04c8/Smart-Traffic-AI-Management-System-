/**
 * Emergency Vehicle & Dynamic Green Corridor Engine
 * Simulates ambulance movement along a multi-hop route, computes ETAs to intersections,
 * pre-clears upcoming signals (Green Corridor), and overrides conflicting phases to RED.
 */

function updateAmbulancesTick(store) {
  const { ambulances, intersections, alerts } = store;

  for (let i = ambulances.length - 1; i >= 0; i--) {
    const amb = ambulances[i];
    
    // Advance progress along route
    // speed is in km/h (e.g. 60 km/h = 16.6 m/s)
    const metersPerSec = (amb.speedKmh * 1000) / 3600;
    amb.currentDistanceMeters += metersPerSec * store.simSpeed;

    // Check progress ratio
    const ratio = Math.min(1.0, amb.currentDistanceMeters / amb.totalDistanceMeters);
    amb.progressPercent = Math.round(ratio * 100);

    // Update current geographic position interpolated along waypoints
    amb.currentCoords = interpolatePosition(amb.waypoints, ratio);

    // Update ETAs to upcoming intersections along route
    let currentDist = amb.currentDistanceMeters;
    let upcomingJunctions = [];

    amb.junctionWaypoints.forEach(jw => {
      const remainingDist = jw.distanceFromStart - currentDist;
      const etaSeconds = remainingDist > 0 ? Math.round(remainingDist / metersPerSec) : 0;
      upcomingJunctions.push({
        intersectionId: jw.intersectionId,
        intersectionName: jw.intersectionName,
        distanceMeters: Math.max(0, Math.round(remainingDist)),
        etaSeconds: etaSeconds,
        direction: jw.approachDirection, // e.g. 'NORTH', 'EAST'
        status: remainingDist <= 0 ? 'PASSED' : (etaSeconds <= 30 ? 'ACTIVE_GREEN' : 'PREPARE_GREEN')
      });
    });
    amb.upcomingJunctions = upcomingJunctions;

    // Apply Green Corridor signal overrides
    upcomingJunctions.forEach(jw => {
      const inter = intersections.find(int => int.id === jw.intersectionId);
      if (!inter) return;

      if (jw.status === 'ACTIVE_GREEN') {
        // Force GREEN for approaching direction, RED for all others!
        inter.signal.emergencyOverride = true;
        inter.signal.overrideReason = `🚑 Emergency Green Corridor for ${amb.id} (${amb.type || 'Ambulance'})`;
        
        // Turn approach direction GREEN, others RED
        const dir = jw.direction;
        inter.signal.currentStates = {
          NORTH: dir === 'NORTH' ? 'GREEN' : 'RED',
          SOUTH: dir === 'SOUTH' ? 'GREEN' : 'RED',
          EAST: dir === 'EAST' ? 'GREEN' : 'RED',
          WEST: dir === 'WEST' ? 'GREEN' : 'RED'
        };
        inter.signal.countdown = Math.max(5, jw.etaSeconds + 8);
      } else if (jw.status === 'PASSED') {
        // Release intersection if no other emergency vehicle is on it
        const otherActive = ambulances.some(other => 
          other.id !== amb.id && 
          other.upcomingJunctions.some(uj => uj.intersectionId === inter.id && uj.status === 'ACTIVE_GREEN')
        );
        if (!otherActive && inter.signal.emergencyOverride) {
          inter.signal.emergencyOverride = false;
          inter.signal.overrideReason = null;
          inter.signal.countdown = 20; // Resume normal countdown
        }
      }
    });

    // Check if finished route
    if (ratio >= 1.0) {
      // Release all overrides from this ambulance
      amb.junctionWaypoints.forEach(jw => {
        const inter = intersections.find(int => int.id === jw.intersectionId);
        if (inter && inter.signal.emergencyOverride) {
          inter.signal.emergencyOverride = false;
          inter.signal.overrideReason = null;
        }
      });

      alerts.unshift({
        id: `ALT_AMB_DONE_${Date.now()}`,
        timestamp: new Date().toISOString(),
        location: amb.destinationName,
        severity: 'LOW',
        category: 'EMERGENCY_CLEARED',
        reason: `${amb.id} (${amb.callSign}) has safely arrived at destination. Green corridor deactivated.`,
        recommendedAction: 'Resume standard automated signal cycles.',
        confidence: 100
      });

      ambulances.splice(i, 1);
    }
  }
}

function interpolatePosition(waypoints, progressRatio) {
  if (!waypoints || waypoints.length === 0) return [12.9716, 77.5946];
  if (waypoints.length === 1 || progressRatio <= 0) return waypoints[0];
  if (progressRatio >= 1.0) return waypoints[waypoints.length - 1];

  const totalSegments = waypoints.length - 1;
  const scaled = progressRatio * totalSegments;
  const segmentIdx = Math.min(Math.floor(scaled), totalSegments - 1);
  const segFraction = scaled - segmentIdx;

  const p1 = waypoints[segmentIdx];
  const p2 = waypoints[segmentIdx + 1];

  const lat = p1[0] + (p2[0] - p1[0]) * segFraction;
  const lng = p1[1] + (p2[1] - p1[1]) * segFraction;
  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
}

function createAmbulanceMission({ id, callSign, startIntersectionId, endIntersectionId, speedKmh = 65 }, store) {
  const { intersections, roads } = store;
  
  // Build path between start and end
  // For demo consistency, we map out standard multi-hop routes
  let pathRoads = [];
  let waypoints = [];
  let junctionWaypoints = [];

  if (startIntersectionId === 'INT_5' && endIntersectionId === 'INT_6') {
    // Harbor -> Hospital via INT_5 -> INT_3 -> INT_1 -> INT_6
    pathRoads = ['RD_4', 'RD_3', 'RD_5'];
    junctionWaypoints = [
      { intersectionId: 'INT_3', intersectionName: 'Metro Interchange Crossing', distanceFromStart: 2100, approachDirection: 'SOUTH' },
      { intersectionId: 'INT_1', intersectionName: 'Central Square Junction', distanceFromStart: 3550, approachDirection: 'SOUTH' },
      { intersectionId: 'INT_6', intersectionName: 'Hospital Hub Trauma Center', distanceFromStart: 5800, approachDirection: 'EAST' }
    ];
  } else if (startIntersectionId === 'INT_4' && endIntersectionId === 'INT_6') {
    // School Zone -> Central -> Hospital via INT_4 -> INT_1 (via RD_2, RD_1) -> INT_6
    pathRoads = ['RD_2', 'RD_1', 'RD_5'];
    junctionWaypoints = [
      { intersectionId: 'INT_2', intersectionName: 'Tech Park Junction', distanceFromStart: 1800, approachDirection: 'EAST' },
      { intersectionId: 'INT_1', intersectionName: 'Central Square Junction', distanceFromStart: 3450, approachDirection: 'NORTH' },
      { intersectionId: 'INT_6', intersectionName: 'Hospital Hub Trauma Center', distanceFromStart: 5700, approachDirection: 'EAST' }
    ];
  } else {
    // Default Route: INT_2 -> INT_1 -> INT_6 (Tech Park to Hospital Hub Trauma Center)
    pathRoads = ['RD_1', 'RD_5'];
    junctionWaypoints = [
      { intersectionId: 'INT_1', intersectionName: 'Central Square Junction', distanceFromStart: 1650, approachDirection: 'NORTH' },
      { intersectionId: 'INT_6', intersectionName: 'Hospital Hub Trauma Center', distanceFromStart: 3900, approachDirection: 'EAST' }
    ];
  }

  // Calculate total distance & flatten waypoints
  let totalDistanceMeters = junctionWaypoints[junctionWaypoints.length - 1].distanceFromStart;
  
  const startInt = intersections.find(i => i.id === startIntersectionId) || intersections[1];
  const endInt = intersections.find(i => i.id === endIntersectionId) || intersections[5];
  
  waypoints = [
    [startInt.lat, startInt.lng],
    ...junctionWaypoints.map(jw => {
      const it = intersections.find(i => i.id === jw.intersectionId);
      return [it.lat, it.lng];
    })
  ];

  const mission = {
    id: id || `AMB-${Math.floor(100 + Math.random() * 900)}`,
    callSign: callSign || 'Apollo Emergency-01',
    type: 'Emergency Life Support Unit',
    startName: startInt.name,
    destinationName: endInt.name,
    speedKmh: speedKmh || 65,
    totalDistanceMeters,
    currentDistanceMeters: 0,
    progressPercent: 0,
    waypoints,
    junctionWaypoints,
    currentCoords: [startInt.lat, startInt.lng],
    upcomingJunctions: []
  };

  store.ambulances.push(mission);

  // Generate Police & Control Room Alert
  store.alerts.unshift({
    id: `ALT_AMB_${Date.now()}`,
    timestamp: new Date().toISOString(),
    location: `${mission.startName} → ${mission.destinationName}`,
    severity: 'CRITICAL',
    category: 'EMERGENCY_AMBULANCE',
    reason: `🚨 Life Support Ambulance (${mission.callSign}) dispatched. ETA to destination: ~${Math.round(totalDistanceMeters / ((speedKmh * 1000) / 3600))} seconds.`,
    recommendedAction: 'ACTIVATE DYNAMIC GREEN CORRIDOR. Synchronize traffic signals along trajectory to lock-step GREEN. Restrict cross-traffic.',
    confidence: 98,
    factors: [
      { name: 'Vehicle Priority Class', impact: 'Code Red / Priority 1' },
      { name: 'Speed Profile', impact: `${speedKmh} km/h High Velocity` },
      { name: 'Corridor Lock-step', impact: `${junctionWaypoints.length} Signal Preemptions` }
    ]
  });

  return mission;
}

module.exports = { updateAmbulancesTick, createAmbulanceMission };
