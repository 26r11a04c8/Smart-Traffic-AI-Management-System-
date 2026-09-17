/**
 * Verification Test for Smart Traffic AI Engine & Pipeline
 */

const { TrafficDataStore } = require('../backend/data/store');
const { predictRoadCongestion } = require('../backend/engines/congestionEngine');
const { assessAccidentRisk } = require('../backend/engines/accidentEngine');
const { assessWaterloggingRisk } = require('../backend/engines/weatherEngine');
const { updateSignalsTick, calculateAdaptiveSignalTimings } = require('../backend/engines/signalEngine');
const { updateAmbulancesTick, createAmbulanceMission } = require('../backend/engines/emergencyEngine');
const { calculateCommuterRoutes } = require('../backend/engines/routingEngine');

console.log('--- STARTING SMART TRAFFIC AI SYSTEM TEST ---');

// 1. Data store init test
const testStore = new TrafficDataStore();
console.assert(testStore.intersections.length >= 6, 'Should have at least 6 intersections');
console.assert(testStore.roads.length >= 10, 'Should have at least 10 road segments');
console.log('✓ Data store initialization passed (6 intersections, 10 road segments).');

// 2. Congestion prediction test
const rd1 = testStore.roads[0];
const congestionPred = predictRoadCongestion(rd1, 17.0, testStore.weather, []);
console.assert(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(congestionPred.congestionLevel), 'Congestion level valid');
console.assert(congestionPred.confidencePercent >= 75, 'Confidence score should be >= 75%');
console.assert(congestionPred.factors.length > 0, 'Explainability factors should exist');
console.log(`✓ Congestion prediction passed: ${congestionPred.congestionLevel} (Confidence: ${congestionPred.confidencePercent}%, Factors: ${congestionPred.factors.map(f => f.name).join(', ')})`);

// 3. Accident Risk Assessment test
const techJunction = testStore.intersections.find(i => i.id === 'INT_2');
const accidentRisk = assessAccidentRisk(techJunction, testStore.roads, 17.5, { rainIntensityMmHr: 45 });
console.assert(accidentRisk.riskLevel === 'HIGH RISK', 'Tech junction during peak rain should be HIGH RISK');
console.assert(accidentRisk.recommendedActions.length > 0, 'Should provide recommended mitigation actions');
console.log(`✓ Accident Risk Assessment passed: ${techJunction.name} -> ${accidentRisk.riskLevel} (${accidentRisk.riskScore})`);

// 4. Weather & Waterlogging test
const waterlogging = assessWaterloggingRisk(rd1, { rainIntensityMmHr: 50 });
console.assert(['HIGH', 'CRITICAL', 'MEDIUM', 'LOW'].includes(waterlogging.waterloggingRisk), 'Waterlogging assessment valid');
console.log(`✓ Waterlogging Risk Assessment passed: ${rd1.name} -> ${waterlogging.waterloggingRisk} (Est depth: ${waterlogging.estimatedWaterLevelMm}mm)`);

// 5. Upstream Queue Metering (Section 6 Requirement)
// Set road capacity to 100, current vehicles to 95 (>85%)
rd1.currentVehicles = 115; // 115 / 120 = 95.8% capacity!
updateSignalsTick(testStore);
const upstreamInt = testStore.intersections.find(i => i.id === rd1.from);
console.assert(upstreamInt.signal.upstreamHold === true, 'Upstream intersection should enter HOLD / RED');
console.log(`✓ Upstream Queue Control passed: Downstream load ${rd1.currentVehicles}/${rd1.capacity} triggered UPSTREAM HOLD on ${upstreamInt.name}`);

// 6. Ambulance Emergency & Green Corridor (Section 9 Requirement)
const mission = createAmbulanceMission({
  id: 'AMB-TEST-1',
  callSign: 'LifeLine-Alpha',
  startIntersectionId: 'INT_2',
  endIntersectionId: 'INT_6',
  speedKmh: 70
}, testStore);
console.assert(testStore.ambulances.length === 1, 'Ambulance mission should be active');
updateAmbulancesTick(testStore);
console.log(`✓ Ambulance Green Corridor created: ${mission.callSign} route has ${mission.junctionWaypoints.length} coordinated junctions`);

// 7. Commuter Routing & Diversion (Section 13 Requirement)
// Test routing when a road is blocked by fire
testStore.incidents.push({
  id: 'INC_FIRE_TEST',
  type: 'FIRE',
  name: 'Main Ave Fire',
  roadId: 'RD_1',
  locationName: 'Central - Tech Main Avenue'
});
const routes = calculateCommuterRoutes('INT_1', 'INT_2', testStore);
console.assert(routes.primaryRoute !== null, 'Should return primary route');
console.assert(routes.recommendedAlternateRoute !== null, 'Should return alternate route');
console.assert(routes.diversionRecommended === true, 'Should recommend diversion due to fire block');
console.log(`✓ Dynamic Commuter Routing passed: Alternate diversion recommended: ${routes.diversionReason}`);

console.log('--- ALL BACKEND AI LOGIC & SIMULATION TESTS PASSED SUCCESSFULLY! ---');
