/**
 * AI-POWERED SMART TRAFFIC MANAGEMENT & EMERGENCY RESPONSE SYSTEM
 * Master Backend Server (Express + Socket.IO)
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { store } = require('./backend/data/store');
const { predictRoadCongestion } = require('./backend/engines/congestionEngine');
const { assessAccidentRisk } = require('./backend/engines/accidentEngine');
const { assessWaterloggingRisk } = require('./backend/engines/weatherEngine');
const { updateSignalsTick, calculateAdaptiveSignalTimings } = require('./backend/engines/signalEngine');
const { updateAmbulancesTick, createAmbulanceMission } = require('./backend/engines/emergencyEngine');
const { calculateCommuterRoutes } = require('./backend/engines/routingEngine');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to compile full current state with all AI inferences
function getFullCityState() {
  const simHour = store.getSimHour();

  // 1. Calculate AI Congestion & Explainability for all road segments
  const enrichedRoads = store.roads.map(road => {
    const aiPrediction = predictRoadCongestion(road, simHour, store.weather, store.incidents);
    const waterlogging = assessWaterloggingRisk(road, store.weather);

    return {
      ...road,
      currentSpeedKmh: Math.max(12, Math.round(road.speedLimitKmh * (1 - (road.currentVehicles / road.capacity) * 0.6) * (store.weather.rainIntensityMmHr > 20 ? 0.75 : 1))),
      aiPrediction,
      waterloggingRisk: waterlogging.waterloggingRisk,
      waterLevelMm: waterlogging.estimatedWaterLevelMm
    };
  });

  // 2. Calculate Accident Risk for all intersections
  const enrichedIntersections = store.intersections.map(inter => {
    const risk = assessAccidentRisk(inter, store.roads, simHour, store.weather);
    const adaptiveTimings = calculateAdaptiveSignalTimings(inter, store.roads, simHour);
    return {
      ...inter,
      accidentAssessment: risk,
      adaptiveTimings
    };
  });

  // 3. Overall KPI Metrics
  const totalVehicles = store.roads.reduce((sum, r) => sum + r.currentVehicles, 0);
  const totalCapacity = store.roads.reduce((sum, r) => sum + r.capacity, 0);
  const cityCongestionIndex = Math.round((totalVehicles / totalCapacity) * 100);
  const activeUpstreamHolds = store.intersections.filter(i => i.signal.upstreamHold).length;
  const activeCorridors = store.ambulances.length;

  return {
    simTime: store.getSimTimeFormatted(),
    simHour: Number(simHour.toFixed(2)),
    simRunning: store.simRunning,
    simSpeed: store.simSpeed,
    weather: store.weather,
    kpi: {
      cityCongestionIndex,
      totalVehicles,
      totalCapacity,
      activeUpstreamHolds,
      activeCorridors,
      activeIncidents: store.incidents.length,
      activeAlerts: store.alerts.length
    },
    intersections: enrichedIntersections,
    roads: enrichedRoads,
    incidents: store.incidents,
    ambulances: store.ambulances,
    alerts: store.alerts.slice(0, 25)
  };
}

// ---------------- REST API ROUTES ----------------

// GET Full City State Snapshot
app.get('/api/city/state', (req, res) => {
  res.json(getFullCityState());
});

// GET All Intersections & Signals
app.get('/api/intersections', (req, res) => {
  res.json(store.intersections);
});

// GET All Road Segments
app.get('/api/roads', (req, res) => {
  res.json(store.roads);
});

// POST Manual Signal Override
app.post('/api/signals/:id/override', (req, res) => {
  const { id } = req.params;
  const { direction, state, duration } = req.body;
  const inter = store.intersections.find(i => i.id === id);
  if (!inter) {
    return res.status(404).json({ error: 'Intersection not found' });
  }

  inter.signal.emergencyOverride = true;
  inter.signal.overrideReason = `Manual Control Room Override by Operator`;
  if (direction && inter.signal.currentStates[direction]) {
    inter.signal.currentStates[direction] = state || 'GREEN';
  }
  if (duration) {
    inter.signal.countdown = duration;
  }

  io.emit('state', getFullCityState());
  res.json({ success: true, signal: inter.signal });
});

// POST Simulation Controls & Preset Scenarios
app.post('/api/simulation/control', (req, res) => {
  const { action, value, preset } = req.body;

  if (action === 'play') {
    store.simRunning = true;
  } else if (action === 'pause') {
    store.simRunning = false;
  } else if (action === 'speed') {
    store.simSpeed = Number(value) || 1;
  } else if (action === 'setTime') {
    // Expecting HH:MM
    if (value) {
      const [h, m] = value.split(':').map(Number);
      store.simTimeSeconds = (h * 3600) + (m * 60);
    }
  } else if (action === 'reset') {
    store.reset();
  } else if (action === 'scenario') {
    applyDemoScenario(preset);
  }

  const updatedState = getFullCityState();
  io.emit('state', updatedState);
  res.json({ success: true, state: updatedState });
});

// POST Trigger Ambulance Mission (Green Corridor)
app.post('/api/emergency/ambulance', (req, res) => {
  const { id, callSign, startIntersectionId, endIntersectionId, speedKmh } = req.body;
  const mission = createAmbulanceMission({
    id,
    callSign,
    startIntersectionId: startIntersectionId || 'INT_2',
    endIntersectionId: endIntersectionId || 'INT_6',
    speedKmh: speedKmh || 65
  }, store);

  const updatedState = getFullCityState();
  io.emit('state', updatedState);
  io.emit('new_alert', store.alerts[0]);
  res.json({ success: true, mission });
});

// POST Create Incident (Fire, Accident, Construction, Event)
app.post('/api/incidents', (req, res) => {
  const { type, name, roadId, locationName, blockedLanes, description } = req.body;
  
  const incident = {
    id: `INC_${Date.now()}`,
    type: type || 'ACCIDENT',
    name: name || `${type} Incident`,
    roadId: roadId || 'RD_1',
    locationName: locationName || 'Main Avenue',
    blockedLanes: blockedLanes || 1,
    description: description || 'Traffic restriction active. Emergency responders on scene.',
    timestamp: new Date().toISOString()
  };

  store.incidents.push(incident);

  // If Fire or Major Hazard, mark road status as BLOCKED
  const affectedRoad = store.roads.find(r => r.id === incident.roadId);
  if (affectedRoad) {
    if (incident.type === 'FIRE') {
      affectedRoad.status = 'BLOCKED';
    } else {
      affectedRoad.currentVehicles = Math.min(affectedRoad.capacity, affectedRoad.currentVehicles + 25);
    }
  }

  // Generate Alert
  store.alerts.unshift({
    id: `ALT_${incident.id}`,
    timestamp: new Date().toISOString(),
    location: incident.locationName,
    severity: incident.type === 'FIRE' ? 'CRITICAL' : 'HIGH',
    category: `INCIDENT_${incident.type}`,
    reason: `${incident.type} reported on ${incident.locationName}: ${incident.description}`,
    recommendedAction: incident.type === 'FIRE' 
      ? 'Evacuate sector. Divert all non-emergency traffic to Ring Bypass. Set incoming signals RED.' 
      : 'Reduce lane capacity. Extend green wave on alternate diversion route.',
    confidence: 95,
    factors: [
      { name: 'Incident Type', impact: incident.type },
      { name: 'Lane Impairment', impact: `${incident.blockedLanes} Lanes Restricted` },
      { name: 'Diversion Status', impact: 'Activated' }
    ]
  });

  const updatedState = getFullCityState();
  io.emit('state', updatedState);
  io.emit('new_alert', store.alerts[0]);
  res.json({ success: true, incident });
});

// DELETE Incident
app.delete('/api/incidents/:id', (req, res) => {
  const { id } = req.params;
  const idx = store.incidents.findIndex(inc => inc.id === id);
  if (idx !== -1) {
    const removed = store.incidents.splice(idx, 1)[0];
    const road = store.roads.find(r => r.id === removed.roadId);
    if (road && road.status === 'BLOCKED') {
      road.status = 'OPEN';
    }
  }
  const updatedState = getFullCityState();
  io.emit('state', updatedState);
  res.json({ success: true });
});

// POST Weather Settings
app.post('/api/weather', (req, res) => {
  const { condition, rainIntensityMmHr, temperatureC } = req.body;
  if (condition) store.weather.condition = condition;
  if (rainIntensityMmHr !== undefined) store.weather.rainIntensityMmHr = Number(rainIntensityMmHr);
  if (temperatureC !== undefined) store.weather.temperatureC = Number(temperatureC);

  // If heavy rain, update road water levels
  store.roads.forEach(road => {
    if (store.weather.rainIntensityMmHr > 30 && road.drainageIndex < 0.5) {
      road.waterlogged = true;
      road.waterLevelMm = Math.round((store.weather.rainIntensityMmHr - (road.drainageIndex * 50)) * 1.5);
    } else {
      road.waterlogged = false;
      road.waterLevelMm = 0;
    }
  });

  const updatedState = getFullCityState();
  io.emit('state', updatedState);
  res.json({ success: true, weather: store.weather });
});

// GET Commuter Route Planner (Normal vs AI Diversion Route)
app.get('/api/navigation/route', (req, res) => {
  const origin = req.query.origin || 'INT_1';
  const destination = req.query.destination || 'INT_4';
  const routingResult = calculateCommuterRoutes(origin, destination, store);
  res.json(routingResult);
});

// GET Analytics Data
app.get('/api/analytics', (req, res) => {
  const accidentHotspots = store.intersections.map(int => ({
    name: int.name,
    historicalCount: int.historicalAccidentCount || 6,
    riskScore: assessAccidentRisk(int, store.roads, store.getSimHour(), store.weather).riskScore
  }));

  const speedVsDensity = [
    { density: '10%', avgSpeedKmh: 58 },
    { density: '30%', avgSpeedKmh: 52 },
    { density: '50%', avgSpeedKmh: 42 },
    { density: '70%', avgSpeedKmh: 28 },
    { density: '85%', avgSpeedKmh: 16 },
    { density: '95%', avgSpeedKmh: 8 }
  ];

  res.json({
    hourlyPatterns: store.historicalHourlyPatterns,
    accidentHotspots,
    speedVsDensity
  });
});

// ---------------- DEMO SCENARIO LOGIC ----------------
function applyDemoScenario(preset) {
  if (preset === 'final_demo') {
    // SECTION 23 FINAL DEMO SCENARIO:
    // It is 5:00 PM (17:00).
    // Office closing time causes increased traffic.
    // Heavy rainfall is predicted (45 mm/hr).
    // Historically accident-prone junction (INT_2 Tech Park) has high risk.
    // Upstream signal hold activated on RD_1.
    // Ambulance triggered with dynamic green corridor.
    // Road incident/hazard triggered with AI route diversion.
    store.reset();
    store.simTimeSeconds = 17 * 3600; // 5:00 PM
    store.weather = {
      condition: 'HEAVY_RAIN',
      rainIntensityMmHr: 48,
      temperatureC: 22,
      isSimulated: true
    };
    
    // Set heavy traffic on Central-Tech Main Ave (RD_1) to trigger upstream metering
    const rd1 = store.roads.find(r => r.id === 'RD_1');
    if (rd1) {
      rd1.currentVehicles = 112; // 112 / 120 = 93% capacity!
      rd1.queueLengthMeters = 340;
    }
    const rd2 = store.roads.find(r => r.id === 'RD_2');
    if (rd2) {
      rd2.currentVehicles = 88; // 88% capacity
      rd2.waterlogged = true;
      rd2.waterLevelMm = 42;
    }

    // Spawn Ambulance after 2 seconds
    setTimeout(() => {
      createAmbulanceMission({
        id: 'AMB-EMERGENCY-911',
        callSign: 'Metro Cardiac Unit 01',
        startIntersectionId: 'INT_2',
        endIntersectionId: 'INT_6',
        speedKmh: 70
      }, store);
      io.emit('state', getFullCityState());
    }, 1500);

    // Add Fire Hazard Incident near Main Avenue diversion
    store.incidents.push({
      id: 'INC_FIRE_DEMO',
      type: 'FIRE',
      name: 'Commercial Complex Fire Hazard',
      roadId: 'RD_1',
      locationName: 'Central - Tech Main Avenue (RD_1)',
      blockedLanes: 2,
      description: 'Major fire containment perimeter established. Northbound lanes impassable.',
      timestamp: new Date().toISOString()
    });

    store.alerts.unshift({
      id: `ALT_EVAL_${Date.now()}`,
      timestamp: new Date().toISOString(),
      location: 'City Core Corridor',
      severity: 'CRITICAL',
      category: 'EVALUATION_SCENARIO_ACTIVE',
      reason: 'Scenario Active: 5:00 PM Office Rush + 48mm/h Heavy Rain + Upstream Queue Metering + Ambulance Corridor.',
      recommendedAction: 'AI System executing: Upstream Signal Metering (Signal A Hold), Emergency Green Corridor, Dynamic Commuter Diversions.',
      confidence: 96,
      factors: [
        { name: 'Sim Time', impact: '17:00:00 Peak Office Rush' },
        { name: 'Downstream Queue', impact: 'RD_1 at 93% capacity (Upstream Hold Active)' },
        { name: 'Waterlogging Risk', impact: 'RD_2 Innovation Blvd at 42mm Water Level' },
        { name: 'Ambulance Green Corridor', impact: 'Dispatched to Hospital Hub Trauma Center' }
      ]
    });
  } else if (preset === 'ambulance_only') {
    createAmbulanceMission({
      id: `AMB-${Math.floor(100 + Math.random() * 899)}`,
      callSign: 'Trauma Unit 108',
      startIntersectionId: 'INT_5',
      endIntersectionId: 'INT_6',
      speedKmh: 65
    }, store);
  } else if (preset === 'heavy_rain') {
    store.weather = {
      condition: 'HEAVY_RAIN',
      rainIntensityMmHr: 55,
      temperatureC: 21,
      isSimulated: true
    };
    store.roads.forEach(r => {
      if (r.drainageIndex < 0.5) {
        r.waterlogged = true;
        r.waterLevelMm = 45;
      }
    });
  } else if (preset === 'construction') {
    store.incidents.push({
      id: `INC_CONST_${Date.now()}`,
      type: 'CONSTRUCTION',
      name: 'Metro Line Underground Excavation',
      roadId: 'RD_7',
      locationName: 'Metro - School Campus Connect (RD_7)',
      blockedLanes: 1,
      description: 'Pipeline maintenance. 1 lane closed for 48 hours.',
      timestamp: new Date().toISOString()
    });
  } else if (preset === 'clear') {
    store.reset();
  }
}

// ---------------- REAL-TIME SIMULATION TICK ----------------
let tickCounter = 0;

setInterval(() => {
  if (!store.simRunning) return;

  tickCounter++;
  // Advance sim clock (1 real second = 1 second * simSpeed)
  store.simTimeSeconds += (1 * store.simSpeed);

  // 1. Advance signals & upstream queue holding
  updateSignalsTick(store);

  // 2. Advance active ambulances & emergency green corridors
  updateAmbulancesTick(store);

  // 3. Fluctuate vehicle queue dynamically based on peak hours and signal states
  const simHour = store.getSimHour();
  store.roads.forEach(road => {
    // Downstream signal green check
    const downInt = store.intersections.find(i => i.id === road.to);
    let isDownstreamGreen = false;
    if (downInt) {
      isDownstreamGreen = Object.values(downInt.signal.currentStates).includes('GREEN');
    }

    // Inflow depends on time of day
    let inflow = (simHour >= 17 && simHour <= 19) ? 2.2 : 0.8;
    // If upstream intersection is on hold, inflow drops
    const upInt = store.intersections.find(i => i.id === road.from);
    if (upInt && upInt.signal.upstreamHold) {
      inflow = 0.1; // restricted
    }

    // Outflow
    let outflow = isDownstreamGreen ? 1.8 : 0.4;
    
    // Update road vehicle count
    road.currentVehicles = Math.max(15, Math.min(road.capacity, Math.round(road.currentVehicles + (inflow - outflow) * store.simSpeed)));
    road.queueLengthMeters = Math.round((road.currentVehicles / road.capacity) * (road.lengthMeters * 0.45));
  });

  // Emit state to connected clients every second
  io.emit('state', getFullCityState());
}, 1000);

// WebSocket connection handling
io.on('connection', (socket) => {
  socket.emit('state', getFullCityState());

  socket.on('request_state', () => {
    socket.emit('state', getFullCityState());
  });

  socket.on('control_sim', (data) => {
    if (data.preset) {
      applyDemoScenario(data.preset);
    } else if (data.action) {
      if (data.action === 'play') store.simRunning = true;
      if (data.action === 'pause') store.simRunning = false;
      if (data.action === 'speed') store.simSpeed = Number(data.value) || 1;
      if (data.action === 'reset') store.reset();
    }
    io.emit('state', getFullCityState());
  });
});

server.listen(PORT, () => {
  console.log(`[SmartTrafficAI] Server active on http://localhost:${PORT}`);
  console.log(`[SmartTrafficAI] Traffic Decision Pipeline & Simulation Tick Engine running`);
});
