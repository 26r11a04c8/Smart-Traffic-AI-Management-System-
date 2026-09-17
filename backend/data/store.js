/**
 * Smart Traffic Management & Emergency Response System - Data Store & Seed
 */

const SEED_INTERSECTIONS = [
  {
    id: 'INT_1',
    name: 'Central Square Junction',
    lat: 12.9716,
    lng: 77.5946,
    type: '4-way',
    connectedRoads: ['RD_1', 'RD_3', 'RD_5', 'RD_10'],
    isAccidentHotspot: false,
    accidentRiskScore: 0.28,
    signal: {
      activePhase: 'NORTH_SOUTH',
      countdown: 32,
      cycleTimes: {
        NORTH: { green: 35, yellow: 4, red: 45 },
        SOUTH: { green: 35, yellow: 4, red: 45 },
        EAST: { green: 25, yellow: 4, red: 55 },
        WEST: { green: 25, yellow: 4, red: 55 }
      },
      currentStates: { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  },
  {
    id: 'INT_2',
    name: 'Tech Park Junction',
    lat: 12.9820,
    lng: 77.6050,
    type: '4-way',
    connectedRoads: ['RD_1', 'RD_2', 'RD_8', 'RD_10'],
    isAccidentHotspot: true, // Known high-risk accident junction
    historicalAccidentCount: 38,
    accidentRiskScore: 0.76, // High baseline risk during evening & rain
    signal: {
      activePhase: 'EAST_WEST',
      countdown: 20,
      cycleTimes: {
        NORTH: { green: 30, yellow: 4, red: 50 },
        SOUTH: { green: 30, yellow: 4, red: 50 },
        EAST: { green: 35, yellow: 4, red: 45 },
        WEST: { green: 35, yellow: 4, red: 45 }
      },
      currentStates: { NORTH: 'RED', SOUTH: 'RED', EAST: 'GREEN', WEST: 'GREEN' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  },
  {
    id: 'INT_3',
    name: 'Metro Interchange Crossing',
    lat: 12.9610,
    lng: 77.6030,
    type: '4-way',
    connectedRoads: ['RD_3', 'RD_4', 'RD_7'],
    isAccidentHotspot: false,
    accidentRiskScore: 0.35,
    signal: {
      activePhase: 'NORTH_SOUTH',
      countdown: 28,
      cycleTimes: {
        NORTH: { green: 30, yellow: 4, red: 40 },
        SOUTH: { green: 30, yellow: 4, red: 40 },
        EAST: { green: 20, yellow: 4, red: 50 },
        WEST: { green: 20, yellow: 4, red: 50 }
      },
      currentStates: { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  },
  {
    id: 'INT_4',
    name: 'School Zone Plaza',
    lat: 12.9730,
    lng: 77.6180,
    type: '4-way',
    connectedRoads: ['RD_2', 'RD_7', 'RD_9'],
    isAccidentHotspot: false,
    accidentRiskScore: 0.42, // Rises dramatically at 08:00 and 15:30
    signal: {
      activePhase: 'EAST_WEST',
      countdown: 15,
      cycleTimes: {
        NORTH: { green: 25, yellow: 4, red: 45 },
        SOUTH: { green: 25, yellow: 4, red: 45 },
        EAST: { green: 30, yellow: 4, red: 40 },
        WEST: { green: 30, yellow: 4, red: 40 }
      },
      currentStates: { NORTH: 'RED', SOUTH: 'RED', EAST: 'GREEN', WEST: 'GREEN' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  },
  {
    id: 'INT_5',
    name: 'Harbor Expressway Cross',
    lat: 12.9550,
    lng: 77.5850,
    type: '3-way',
    connectedRoads: ['RD_4', 'RD_6', 'RD_8'],
    isAccidentHotspot: false,
    accidentRiskScore: 0.22,
    signal: {
      activePhase: 'NORTH_SOUTH',
      countdown: 35,
      cycleTimes: {
        NORTH: { green: 40, yellow: 4, red: 30 },
        SOUTH: { green: 40, yellow: 4, red: 30 },
        EAST: { green: 20, yellow: 4, red: 50 },
        WEST: { green: 20, yellow: 4, red: 50 }
      },
      currentStates: { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  },
  {
    id: 'INT_6',
    name: 'Hospital Hub Trauma Center',
    lat: 12.9650,
    lng: 77.5750,
    type: '4-way',
    connectedRoads: ['RD_5', 'RD_6', 'RD_10'],
    isAccidentHotspot: false,
    accidentRiskScore: 0.18,
    signal: {
      activePhase: 'NORTH_SOUTH',
      countdown: 40,
      cycleTimes: {
        NORTH: { green: 35, yellow: 4, red: 35 },
        SOUTH: { green: 35, yellow: 4, red: 35 },
        EAST: { green: 25, yellow: 4, red: 45 },
        WEST: { green: 25, yellow: 4, red: 45 }
      },
      currentStates: { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' },
      emergencyOverride: false,
      upstreamHold: false,
      holdReason: null
    }
  }
];

const SEED_ROADS = [
  {
    id: 'RD_1',
    name: 'Central - Tech Main Avenue',
    from: 'INT_1',
    to: 'INT_2',
    coordinates: [[12.9716, 77.5946], [12.9768, 77.5998], [12.9820, 77.6050]],
    lengthMeters: 1650,
    capacity: 120,
    currentVehicles: 88,
    speedLimitKmh: 50,
    currentSpeedKmh: 24,
    lanes: 3,
    drainageIndex: 0.45, // prone to waterlogging under heavy rain
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 280,
    congestionLevel: 'HIGH',
    status: 'OPEN'
  },
  {
    id: 'RD_2',
    name: 'Tech - School Innovation Boulevard',
    from: 'INT_2',
    to: 'INT_4',
    coordinates: [[12.9820, 77.6050], [12.9775, 77.6115], [12.9730, 77.6180]],
    lengthMeters: 1800,
    capacity: 100,
    currentVehicles: 72,
    speedLimitKmh: 50,
    currentSpeedKmh: 28,
    lanes: 2,
    drainageIndex: 0.35, // low elevation, prone to waterlogging
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 190,
    congestionLevel: 'MODERATE',
    status: 'OPEN'
  },
  {
    id: 'RD_3',
    name: 'Central - Metro Arterial Road',
    from: 'INT_1',
    to: 'INT_3',
    coordinates: [[12.9716, 77.5946], [12.9663, 77.5988], [12.9610, 77.6030]],
    lengthMeters: 1450,
    capacity: 110,
    currentVehicles: 85,
    speedLimitKmh: 50,
    currentSpeedKmh: 22,
    lanes: 3,
    drainageIndex: 0.70,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 240,
    congestionLevel: 'HIGH',
    status: 'OPEN'
  },
  {
    id: 'RD_4',
    name: 'Metro - Harbor South Expressway',
    from: 'INT_3',
    to: 'INT_5',
    coordinates: [[12.9610, 77.6030], [12.9580, 77.5940], [12.9550, 77.5850]],
    lengthMeters: 2100,
    capacity: 150,
    currentVehicles: 60,
    speedLimitKmh: 60,
    currentSpeedKmh: 45,
    lanes: 3,
    drainageIndex: 0.85,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 80,
    congestionLevel: 'LOW',
    status: 'OPEN'
  },
  {
    id: 'RD_5',
    name: 'Central - Hospital Medical Corridor',
    from: 'INT_1',
    to: 'INT_6',
    coordinates: [[12.9716, 77.5946], [12.9683, 77.5848], [12.9650, 77.5750]],
    lengthMeters: 2250,
    capacity: 100,
    currentVehicles: 48,
    speedLimitKmh: 50,
    currentSpeedKmh: 38,
    lanes: 2,
    drainageIndex: 0.75,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 60,
    congestionLevel: 'MODERATE',
    status: 'OPEN'
  },
  {
    id: 'RD_6',
    name: 'Hospital - Harbor West Riverway',
    from: 'INT_6',
    to: 'INT_5',
    coordinates: [[12.9650, 77.5750], [12.9600, 77.5800], [12.9550, 77.5850]],
    lengthMeters: 1550,
    capacity: 90,
    currentVehicles: 30,
    speedLimitKmh: 40,
    currentSpeedKmh: 36,
    lanes: 2,
    drainageIndex: 0.40,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 40,
    congestionLevel: 'LOW',
    status: 'OPEN'
  },
  {
    id: 'RD_7',
    name: 'Metro - School Campus Connect',
    from: 'INT_3',
    to: 'INT_4',
    coordinates: [[12.9610, 77.6030], [12.9670, 77.6105], [12.9730, 77.6180]],
    lengthMeters: 2050,
    capacity: 100,
    currentVehicles: 55,
    speedLimitKmh: 50,
    currentSpeedKmh: 34,
    lanes: 2,
    drainageIndex: 0.65,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 90,
    congestionLevel: 'MODERATE',
    status: 'OPEN'
  },
  {
    id: 'RD_8',
    name: 'Tech - Harbor Ring Bypass',
    from: 'INT_2',
    to: 'INT_5',
    coordinates: [[12.9820, 77.6050], [12.9700, 77.5700], [12.9550, 77.5850]],
    lengthMeters: 3800,
    capacity: 180,
    currentVehicles: 65,
    speedLimitKmh: 70,
    currentSpeedKmh: 62,
    lanes: 4,
    drainageIndex: 0.90, // elevated highway, almost zero flood risk
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 50,
    congestionLevel: 'LOW',
    status: 'OPEN'
  },
  {
    id: 'RD_9',
    name: 'School Plaza - East City Arterial',
    from: 'INT_4',
    to: 'INT_2',
    coordinates: [[12.9730, 77.6180], [12.9850, 77.6250], [12.9820, 77.6050]],
    lengthMeters: 2400,
    capacity: 120,
    currentVehicles: 50,
    speedLimitKmh: 50,
    currentSpeedKmh: 42,
    lanes: 2,
    drainageIndex: 0.80,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 70,
    congestionLevel: 'LOW',
    status: 'OPEN'
  },
  {
    id: 'RD_10',
    name: 'Tech - Hospital Direct Flyover',
    from: 'INT_2',
    to: 'INT_6',
    coordinates: [[12.9820, 77.6050], [12.9735, 77.5900], [12.9650, 77.5750]],
    lengthMeters: 3200,
    capacity: 140,
    currentVehicles: 80,
    speedLimitKmh: 60,
    currentSpeedKmh: 48,
    lanes: 3,
    drainageIndex: 0.95,
    waterlogged: false,
    waterLevelMm: 0,
    queueLengthMeters: 90,
    congestionLevel: 'LOW',
    status: 'OPEN'
  }
];

class TrafficDataStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.intersections = JSON.parse(JSON.stringify(SEED_INTERSECTIONS));
    this.roads = JSON.parse(JSON.stringify(SEED_ROADS));
    this.simTimeSeconds = 17 * 3600; // default 5:00:00 PM for peak scenario
    this.simRunning = true;
    this.simSpeed = 1; // 1x, 2x, 5x
    this.weather = {
      condition: 'HEAVY_RAIN',
      rainIntensityMmHr: 45, // 45 mm/hr = Heavy rain
      temperatureC: 23,
      isSimulated: true
    };
    this.incidents = [];
    this.ambulances = [];
    this.alerts = [
      {
        id: 'ALT_INIT_1',
        timestamp: new Date().toISOString(),
        location: 'Tech Park Junction (INT_2)',
        severity: 'HIGH',
        category: 'ACCIDENT_RISK',
        reason: 'Office rush hour (5:00 PM) coinciding with 45mm/h heavy rainfall on low drainage approach.',
        recommendedAction: 'Increase green clearance for northbound arterial. Throttle incoming traffic from RD_1 upstream.',
        confidence: 88,
        factors: [
          { name: 'Historical Incident Weight', impact: '+38%' },
          { name: 'Rainfall & Surface Friction', impact: '+26%' },
          { name: 'Peak Office Rush Density', impact: '+24%' }
        ]
      },
      {
        id: 'ALT_INIT_2',
        timestamp: new Date().toISOString(),
        location: 'Tech - School Innovation Blvd (RD_2)',
        severity: 'HIGH',
        category: 'WATERLOGGING_RISK',
        reason: 'Rainfall exceeds drainage threshold (45mm/h vs 25mm/h cap). Water accumulation predicted in 10 minutes.',
        recommendedAction: 'Broadcast commuter alert for Route Diversion via Harbor Ring Bypass (RD_8).',
        confidence: 91,
        factors: [
          { name: 'Rain Intensity', impact: '+45%' },
          { name: 'Low Elevation Basin', impact: '+32%' },
          { name: 'Drainage Soil Saturation', impact: '+14%' }
        ]
      }
    ];

    this.historicalHourlyPatterns = [
      { hour: 6, label: '06:00', volumePercent: 20, congestion: 'LOW' },
      { hour: 7, label: '07:00', volumePercent: 42, congestion: 'LOW' },
      { hour: 8, label: '08:00', volumePercent: 86, congestion: 'HIGH', note: 'School & Morning Office Opening' },
      { hour: 9, label: '09:00', volumePercent: 92, congestion: 'SEVERE', note: 'Peak Morning Commute' },
      { hour: 10, label: '10:00', volumePercent: 68, congestion: 'MODERATE' },
      { hour: 11, label: '11:00', volumePercent: 55, congestion: 'MODERATE' },
      { hour: 12, label: '12:00', volumePercent: 60, congestion: 'MODERATE' },
      { hour: 13, label: '13:00', volumePercent: 58, congestion: 'MODERATE' },
      { hour: 14, label: '14:00', volumePercent: 52, congestion: 'LOW' },
      { hour: 15, label: '15:00', volumePercent: 65, congestion: 'MODERATE' },
      { hour: 15.5, label: '15:30', volumePercent: 88, congestion: 'HIGH', note: 'School Closing Rush' },
      { hour: 16, label: '16:00', volumePercent: 74, congestion: 'MODERATE' },
      { hour: 17, label: '17:00', volumePercent: 96, congestion: 'SEVERE', note: 'Peak Evening Office Rush' },
      { hour: 18, label: '18:00', volumePercent: 94, congestion: 'SEVERE' },
      { hour: 19, label: '19:00', volumePercent: 80, congestion: 'HIGH' },
      { hour: 20, label: '20:00', volumePercent: 58, congestion: 'MODERATE' },
      { hour: 21, label: '21:00', volumePercent: 40, congestion: 'LOW' },
      { hour: 22, label: '22:00', volumePercent: 25, congestion: 'LOW' }
    ];
  }

  getSimTimeFormatted() {
    const totalSeconds = Math.floor(this.simTimeSeconds) % (24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  getSimHour() {
    const totalSeconds = Math.floor(this.simTimeSeconds) % (24 * 3600);
    return totalSeconds / 3600;
  }
}

const store = new TrafficDataStore();
module.exports = { store, TrafficDataStore };
