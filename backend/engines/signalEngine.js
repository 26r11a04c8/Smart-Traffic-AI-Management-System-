/**
 * Dynamic Signal Management & Upstream Queue Metering Engine
 * Controls 4-phase adaptive traffic signals and implements upstream queue holding
 * to prevent downstream gridlock.
 */

function updateSignalsTick(store) {
  const { intersections, roads, simHour } = store;

  // 1. First, check upstream-downstream queue thresholds across road links
  // If ANY downstream road fed from an intersection is near capacity (>80%), hold the upstream intersection signal
  intersections.forEach(inter => {
    // Find all roads where this intersection is the feeder ('from')
    const outgoingRoads = roads.filter(r => r.from === inter.id);
    const bottleneckRoad = outgoingRoads.find(r => (r.currentVehicles / r.capacity) >= 0.82);

    if (bottleneckRoad) {
      const capPct = Math.round((bottleneckRoad.currentVehicles / bottleneckRoad.capacity) * 100);
      inter.signal.upstreamHold = true;
      inter.signal.holdReason = `Downstream bottleneck on ${bottleneckRoad.name} (${capPct}% capacity). Upstream metering active.`;
    } else {
      // Check if all outgoing roads are now safe to release (< 70%)
      const allSafe = outgoingRoads.every(r => (r.currentVehicles / r.capacity) < 0.70);
      if (allSafe) {
        inter.signal.upstreamHold = false;
        inter.signal.holdReason = null;
      }
    }
  });

  // 2. Advance signals countdown & phase transitions
  intersections.forEach(inter => {
    const sig = inter.signal;

    // If emergency override is active, the emergency engine has exclusive control
    if (sig.emergencyOverride) {
      return;
    }

    // Decrement countdown
    sig.countdown = Math.max(0, sig.countdown - 1);

    if (sig.countdown <= 0) {
      // Phase cycle switch
      // Phase sequence: NORTH_SOUTH (Green) -> NORTH_SOUTH (Yellow) -> EAST_WEST (Green) -> EAST_WEST (Yellow)
      if (sig.activePhase === 'NORTH_SOUTH') {
        sig.activePhase = 'NS_YELLOW';
        sig.countdown = 4; // 4 second yellow
        sig.currentStates.NORTH = 'YELLOW';
        sig.currentStates.SOUTH = 'YELLOW';
        sig.currentStates.EAST = 'RED';
        sig.currentStates.WEST = 'RED';
      } else if (sig.activePhase === 'NS_YELLOW') {
        sig.activePhase = 'EAST_WEST';
        
        // Calculate adaptive green time based on density & peak hour
        let greenTime = sig.cycleTimes.EAST.green;
        if (sig.upstreamHold) {
          // If upstream hold is active, restrict feeder green time
          greenTime = Math.max(10, Math.round(greenTime * 0.5));
        } else if (simHour >= 17.0 && simHour <= 19.0) {
          // Evening peak bonus
          greenTime = Math.round(greenTime * 1.3);
        }

        sig.countdown = greenTime;
        sig.currentStates.NORTH = 'RED';
        sig.currentStates.SOUTH = 'RED';
        sig.currentStates.EAST = sig.upstreamHold ? 'RED' : 'GREEN';
        sig.currentStates.WEST = sig.upstreamHold ? 'RED' : 'GREEN';
      } else if (sig.activePhase === 'EAST_WEST') {
        sig.activePhase = 'EW_YELLOW';
        sig.countdown = 4;
        sig.currentStates.NORTH = 'RED';
        sig.currentStates.SOUTH = 'RED';
        sig.currentStates.EAST = 'YELLOW';
        sig.currentStates.WEST = 'YELLOW';
      } else {
        // Back to NORTH_SOUTH
        sig.activePhase = 'NORTH_SOUTH';
        let greenTime = sig.cycleTimes.NORTH.green;
        if (simHour >= 17.0 && simHour <= 19.0) {
          greenTime = Math.round(greenTime * 1.35); // Rush hour boost
        }
        sig.countdown = greenTime;
        sig.currentStates.NORTH = sig.upstreamHold ? 'RED' : 'GREEN';
        sig.currentStates.SOUTH = sig.upstreamHold ? 'RED' : 'GREEN';
        sig.currentStates.EAST = 'RED';
        sig.currentStates.WEST = 'RED';
      }
    } else {
      // If upstream hold triggers midway, clamp to RED immediately
      if (sig.upstreamHold) {
        if (sig.currentStates.NORTH === 'GREEN') sig.currentStates.NORTH = 'RED';
        if (sig.currentStates.SOUTH === 'GREEN') sig.currentStates.SOUTH = 'RED';
        if (sig.currentStates.EAST === 'GREEN') sig.currentStates.EAST = 'RED';
        if (sig.currentStates.WEST === 'GREEN') sig.currentStates.WEST = 'RED';
      }
    }
  });
}

function calculateAdaptiveSignalTimings(intersection, roads, simHour) {
  // AI Adaptive Signal Timing Recommendation
  const isPeak = (simHour >= 7.8 && simHour <= 9.8) || (simHour >= 16.8 && simHour <= 19.5);
  const connRoads = roads.filter(r => intersection.connectedRoads.includes(r.id));
  
  let nsVehicles = 0;
  let ewVehicles = 0;
  connRoads.forEach(r => {
    if (r.id === 'RD_1' || r.id === 'RD_3' || r.id === 'RD_5' || r.id === 'RD_4') {
      nsVehicles += r.currentVehicles;
    } else {
      ewVehicles += r.currentVehicles;
    }
  });

  const total = Math.max(1, nsVehicles + ewVehicles);
  const nsRatio = nsVehicles / total;
  const ewRatio = ewVehicles / total;

  const totalCycle = isPeak ? 90 : 60;
  const nsGreen = Math.min(55, Math.max(15, Math.round(totalCycle * nsRatio)));
  const ewGreen = Math.min(55, Math.max(15, Math.round(totalCycle * ewRatio)));

  return {
    intersectionId: intersection.id,
    mode: isPeak ? 'PEAK_ADAPTIVE' : 'BALANCED',
    recommendedCycle: {
      NORTH_SOUTH: { green: nsGreen, yellow: 4, red: ewGreen + 4 },
      EAST_WEST: { green: ewGreen, yellow: 4, red: nsGreen + 4 }
    },
    reasoning: `Vehicle flow distribution: NS = ${Math.round(nsRatio * 100)}%, EW = ${Math.round(ewRatio * 100)}%. ${isPeak ? 'Applied peak hour green extension.' : 'Standard adaptive cycle.'}`
  };
}

module.exports = { updateSignalsTick, calculateAdaptiveSignalTimings };
