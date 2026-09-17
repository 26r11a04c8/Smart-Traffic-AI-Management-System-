/**
 * Dynamic Commuter Routing & Diversion Engine
 * Calculates original baseline routes vs AI-optimized diversion routes
 * based on live congestion, road closures, waterlogging, fire hazards, and emergency corridors.
 */

function calculateCommuterRoutes(originId, destinationId, store) {
  const { intersections, roads, incidents, weather, ambulances } = store;

  const startInt = intersections.find(i => i.id === originId) || intersections[0]; // Central Square
  const endInt = intersections.find(i => i.id === destinationId) || intersections[3]; // School Zone Plaza

  // Build adjacency list representation of road graph
  const graph = {};
  intersections.forEach(i => { graph[i.id] = []; });

  roads.forEach(road => {
    // Determine dynamic travel cost in seconds
    let travelTimeSeconds = (road.lengthMeters / ((road.currentSpeedKmh || 30) * 1000 / 3600));
    let isBlocked = (road.status === 'BLOCKED');
    let incidentNotes = [];

    // Check incidents on this road
    incidents.forEach(inc => {
      if (inc.roadId === road.id || inc.affectedRoads?.includes(road.id)) {
        if (inc.type === 'FIRE') {
          isBlocked = true;
          travelTimeSeconds += 1800; // 30 mins delay
          incidentNotes.push('🔥 Road blocked due to active Fire Incident');
        } else if (inc.type === 'ACCIDENT') {
          travelTimeSeconds += 720; // 12 mins delay
          incidentNotes.push('🚨 Crash site investigation - Lane restricted');
        } else if (inc.type === 'CONSTRUCTION') {
          travelTimeSeconds += 480; // 8 mins delay
          incidentNotes.push(`🚧 Active Roadworks (${inc.blockedLanes || 1} lanes closed)`);
        } else if (inc.type === 'EVENT') {
          travelTimeSeconds += 600; // 10 mins delay
          incidentNotes.push(`🎪 Public Gathering Event Congestion: ${inc.name}`);
        }
      }
    });

    // Check waterlogging risk
    if (weather.rainIntensityMmHr >= 35 && road.drainageIndex < 0.5) {
      travelTimeSeconds += 600; // 10 mins delay
      incidentNotes.push(`🌊 Water accumulation hazard (${road.waterLevelMm || 35}mm flood depth)`);
      if (road.drainageIndex < 0.4 && weather.rainIntensityMmHr >= 45) {
        isBlocked = true;
      }
    }

    // Check emergency green corridor crossing
    ambulances.forEach(amb => {
      if (amb.junctionWaypoints.some(jw => jw.intersectionId === road.from || jw.intersectionId === road.to)) {
        incidentNotes.push(`🚑 Active Emergency Green Corridor nearby`);
      }
    });

    // Bidirectional road connections
    graph[road.from].push({
      roadId: road.id,
      roadName: road.name,
      to: road.to,
      lengthMeters: road.lengthMeters,
      baseSpeedKmh: road.speedLimitKmh,
      currentSpeedKmh: road.currentSpeedKmh,
      travelTimeSeconds: Math.round(travelTimeSeconds),
      isBlocked,
      incidentNotes,
      coordinates: road.coordinates
    });

    graph[road.to].push({
      roadId: road.id,
      roadName: road.name,
      to: road.from,
      lengthMeters: road.lengthMeters,
      baseSpeedKmh: road.speedLimitKmh,
      currentSpeedKmh: road.currentSpeedKmh,
      travelTimeSeconds: Math.round(travelTimeSeconds),
      isBlocked,
      incidentNotes,
      coordinates: [...road.coordinates].reverse()
    });
  });

  // Calculate Primary Direct Route (Standard shortest geometric path, unweighted by live hazards)
  const directPath = findDijkstraPath(graph, startInt.id, endInt.id, false);

  // Calculate AI Smart Dynamic Route (Penalizes hazards, avoids blocked roads)
  const smartPath = findDijkstraPath(graph, startInt.id, endInt.id, true);

  // Compile Route summaries
  const formatRoute = (resPath, isAlt = false) => {
    if (!resPath || resPath.nodes.length === 0) {
      return null;
    }

    let totalMeters = 0;
    let totalSeconds = 0;
    let allCoords = [];
    let allNotes = [];
    let roadSegments = [];

    resPath.edges.forEach(edge => {
      totalMeters += edge.lengthMeters;
      totalSeconds += edge.travelTimeSeconds;
      allCoords.push(...edge.coordinates);
      if (edge.incidentNotes?.length > 0) {
        allNotes.push(...edge.incidentNotes);
      }
      roadSegments.push({
        id: edge.roadId,
        name: edge.roadName,
        speedKmh: edge.currentSpeedKmh,
        notes: edge.incidentNotes
      });
    });

    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));

    return {
      nodeIds: resPath.nodes,
      roadSegments,
      totalDistanceKm: (totalMeters / 1000).toFixed(1),
      etaMinutes: totalMinutes,
      coordinates: allCoords,
      hazards: Array.from(new Set(allNotes)),
      isBlocked: resPath.edges.some(e => e.isBlocked)
    };
  };

  const primary = formatRoute(directPath, false);
  const smart = formatRoute(smartPath, true);

  // Compare routes
  let diversionRecommended = false;
  let diversionReason = null;

  if (primary && smart) {
    if (primary.isBlocked) {
      diversionRecommended = true;
      diversionReason = 'Direct route is blocked by an active incident or severe waterlogging. AI alternate route recommended.';
    } else if (primary.etaMinutes > smart.etaMinutes + 4) {
      diversionRecommended = true;
      const savedMinutes = primary.etaMinutes - smart.etaMinutes;
      diversionReason = `Heavy congestion ahead on direct route. AI diversion saves ${savedMinutes} minutes.`;
    }
  }

  return {
    origin: { id: startInt.id, name: startInt.name, lat: startInt.lat, lng: startInt.lng },
    destination: { id: endInt.id, name: endInt.name, lat: endInt.lat, lng: endInt.lng },
    primaryRoute: primary,
    recommendedAlternateRoute: smart,
    diversionRecommended,
    diversionReason
  };
}

function findDijkstraPath(graph, startNode, endNode, penalizeHazards = true) {
  const distances = {};
  const previous = {};
  const prevEdges = {};
  const unvisited = new Set(Object.keys(graph));

  Object.keys(graph).forEach(node => {
    distances[node] = Infinity;
  });
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    let curr = null;
    let minDistance = Infinity;

    unvisited.forEach(node => {
      if (distances[node] < minDistance) {
        minDistance = distances[node];
        curr = node;
      }
    });

    if (curr === null || distances[curr] === Infinity || curr === endNode) {
      break;
    }

    unvisited.delete(curr);

    const neighbors = graph[curr] || [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.to)) continue;

      let cost = edge.travelTimeSeconds;
      if (penalizeHazards) {
        if (edge.isBlocked) {
          cost += 99999; // Strong penalty for blocked roads
        }
      } else {
        // Geometric unweighted cost
        cost = (edge.lengthMeters / (50 * 1000 / 3600)); // standard 50km/h
      }

      const alt = distances[curr] + cost;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = curr;
        prevEdges[edge.to] = edge;
      }
    }
  }

  // Backtrack path
  const nodes = [];
  const edges = [];
  let curr = endNode;

  while (curr) {
    nodes.unshift(curr);
    if (previous[curr]) {
      edges.unshift(prevEdges[curr]);
      curr = previous[curr];
    } else {
      break;
    }
  }

  if (nodes[0] !== startNode) {
    return { nodes: [], edges: [] };
  }

  return { nodes, edges };
}

module.exports = { calculateCommuterRoutes };
