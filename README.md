# 🚦 Smart Traffic AI Management System

**AI-Powered Urban Traffic Management & Emergency Green Corridor System**

An intelligent traffic control platform that combines real-time IoT simulation, explainable machine learning, macroscopic traffic flow physics, and adaptive signal optimization to reduce urban gridlock, give emergency vehicles zero-delay green corridors, and provide commuters with accessible, real-time navigation.

>Problem Statement 5: Traffic Congestion Prediction Agent (Smart City domain).

---

## 📌 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [The AI & Mathematical Engines](#the-ai--mathematical-engines)
- [Accessibility & Inclusivity](#accessibility--inclusivity)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [FAQ / Judge Q&A](#faq--judge-qa)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

Traffic congestion in urban areas is dynamic — it shifts continuously based on time of day, weather, road incidents, and travel patterns. This project builds an AI-powered system that:

- Predicts and classifies congestion levels across road segments in real time
- Explains *why* a segment is congested (explainable AI, not a black box)
- Identifies peak-time windows and high-risk zones
- Dynamically reroutes traffic around blockages and hazards
- Grants emergency vehicles a preemptive "green wave" corridor
- Presents everything through an accessible, live-updating map dashboard

The system runs as a simulated smart-city environment, making it fully demoable without requiring live municipal traffic sensors.

---

## Key Features

| Feature | Description |
|---|---|
| **Live Congestion Prediction** | Multi-factor scoring engine predicts congestion per road segment in real time |
| **Explainable AI (XAI)** | Every prediction is broken down by contributing factor (e.g., density, rain, rush hour) |
| **Traffic Physics Modeling** | Greenshields macroscopic flow model estimates speed breakdown before gridlock occurs |
| **Adaptive Signal Control** | Green-phase durations dynamically allocated based on real-time queue lengths |
| **Upstream Queue Metering** | Prevents intersection spillback by holding upstream traffic when downstream nears capacity |
| **Emergency Green Corridor** | Ambulance routes get preemptive green signals 30 seconds ahead of arrival |
| **Dynamic Diversion Routing** | Modified Dijkstra routing reroutes commuters around hazards, saving 13+ minutes |
| **Accessible Navigation** | One-click handoff to Google Maps turn-by-turn navigation |
| **Voice Alerts (TTS)** | Web Speech API announces high-priority alerts for visually impaired users |
| **High-Contrast / Font Scaling** | WCAG-compliant accessibility modes built into the UI |

---

## Tech Stack

| Layer | Technologies | Purpose |
|---|---|---|
| **Runtime** | Node.js (v18+) | Asynchronous, event-driven server handling concurrent simulations |
| **Backend Framework** | Express.js | REST APIs for telemetry, signal overrides, route queries, incident injection |
| **Real-Time Layer** | Socket.IO (WebSockets) | Live city-state streaming (signals, vehicle counts, alerts) at 1–5 Hz |
| **Data Store** | In-memory graph data store | Road network as a graph (nodes = intersections, edges = roads) for sub-millisecond routing |
| **Frontend** | Vanilla HTML5 / CSS3 / ES6+ JS | Lightweight, dependency-free client with no virtual-DOM overhead |
| **Design System** | Custom Vanilla CSS ("Cyber Glassmorphism") | Dark UI theme, responsive flex/grid layout, accessibility tokens |
| **Geospatial & Maps** | Leaflet.js + Google Maps Tile API | High-performance GIS rendering; Street/Satellite/Terrain/Live Traffic layers |
| **Data Visualization** | Chart.js | Volume curves, Greenshields speed-density curves, accident risk charts |
| **Accessibility** | Web Speech API, ARIA, WCAG 2.1 | TTS alerts, screen-reader support, high-contrast mode, font scaling |
| **Testing** | Node Test Runner | Unit/integration tests for prediction accuracy, thresholds, routing fallbacks |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                       │
│   Leaflet Map · Chart.js Dashboards · Accessibility Layer      │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket (Socket.IO) + REST
┌───────────────────────────▼─────────────────────────────────┐
│                     EXPRESS.JS SERVER                         │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ congestionEngine  │  │  signalEngine    │  │ emergency   │ │
│  │ (XAI prediction)  │  │  (adaptive       │  │ Engine      │ │
│  │                    │  │   signals)       │  │ (green wave)│ │
│  └──────────────────┘  └──────────────────┘  └─────────────┘ │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │  routingEngine    │  │  analytics.js    │                  │
│  │  (Dijkstra)        │  │  (Greenshields)  │                  │
│  └──────────────────┘  └──────────────────┘                  │
│                                                                │
│           In-Memory Road Network Graph (nodes/edges)          │
└─────────────────────────────────────────────────────────────┘
```

Each intersection and corridor is designed as an independent state machine, making the system modular and horizontally scalable.

---

## The AI & Mathematical Engines

### A. Explainable Congestion Prediction Engine (`congestionEngine.js`)
A feature-weighted, multi-factor scoring model inspired by Random Forest Regression.

**Inputs:** vehicle density, road capacity, time-of-day rush multipliers, rainfall intensity (mm/h), active incident/lane blockages.

**Output:** an explainability breakdown showing each factor's contribution, e.g.:
> *35% Traffic Density + 30% Rain Waterlogging + 25% Evening Peak*

### B. Traffic Flow Physics — Greenshields Macroscopic Model (`analytics.js`)
Based on the classic transportation engineering equation:

$$v = v_f \left(1 - \frac{k}{k_j}\right)$$

- `v` — current speed (km/h)
- `v_f` — free-flow speed limit
- `k` — traffic density (vehicles/km)
- `k_j` — jam density (gridlock threshold)

Used to predict speed breakdowns and shockwaves *before* gridlock occurs.

### C. Upstream Queue Metering & Adaptive Signals (`signalEngine.js`)
- **Adaptive cycle allocation** (Webster's Method derivative): green-phase duration scales with incoming queue length.
- **Upstream hold (gating):** if a downstream segment exceeds 85% capacity, the upstream signal turns red to prevent spillback.

### D. Emergency Green Wave Corridor (`emergencyEngine.js`)
Calculates an ambulance's forward trajectory and preemptively turns corridor signals green ~30 seconds ahead of arrival, holding cross-traffic red. Normal adaptive operation resumes once the vehicle clears the intersection.

### E. Dynamic Diversion Routing (`routingEngine.js`)
A modified Dijkstra's shortest-path algorithm with a dynamic cost function:

$$\text{Cost} = \text{Distance} \times \left(\frac{\text{Free Flow Speed}}{\text{Current Speed}}\right) + \text{Hazard Penalties}$$

Automatically reroutes around blocked or flooded roads, saving commuters up to 13+ minutes on affected routes.

---

## Accessibility & Inclusivity

- **Google Maps handoff** — one-click "Open Live Route in Google Maps" with real-time GPS and turn-by-turn voice navigation.
- **Web Speech API (TTS)** — audibly announces high-priority alerts (e.g., *"Alert: Tech Park Junction — high accident risk due to rain and heavy rush"*).
- **High-contrast theme** — WCAG AAA–compliant black/neon mode for color-blind users.
- **Font scaling** — one-toggle 15% increase in HUD/KPI text size for low-vision users.

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

```bash
git clone https://github.com/<your-username>/smart-traffic-ai.git
cd smart-traffic-ai
npm install
```

### Running locally

```bash
npm start
```

The server starts on `http://localhost:3000` by default. Open it in a browser to view the live dashboard.

### Running tests

```bash
npm test
```

### Environment variables

Create a `.env` file in the root directory:

```env
PORT=3000
GOOGLE_MAPS_API_KEY=your_api_key_here
```

---

## Project Structure

```
smart-traffic-ai/
├── server/
│   ├── engines/
│   │   ├── congestionEngine.js   # XAI congestion prediction
│   │   ├── signalEngine.js       # Adaptive signal control
│   │   ├── emergencyEngine.js    # Green corridor preemption
│   │   ├── routingEngine.js      # Dynamic diversion routing
│   │   └── analytics.js          # Greenshields flow model
│   ├── graph/                    # In-memory road network graph
│   ├── routes/                   # Express REST endpoints
│   └── socket/                   # Socket.IO event handlers
├── public/
│   ├── index.html
│   ├── css/                      # Cyber glassmorphism design system
│   └── js/                       # Map, charts, accessibility layer
├── tests/
├── .env.example
├── package.json
└── README.md
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/segments` | List all road segments with current congestion state |
| `GET` | `/api/predict?segment_id=&time=` | Predicted congestion level + XAI breakdown |
| `GET` | `/api/peak-times?segment_id=` | Historical peak congestion windows |
| `POST` | `/api/incident` | Inject an incident (accident, flooding, closure) |
| `POST` | `/api/emergency/dispatch` | Trigger a green-corridor emergency route |
| `GET` | `/api/route?from=&to=` | Get an optimal (hazard-aware) route |

Real-time updates (signal states, vehicle counts, alerts) stream over a Socket.IO WebSocket connection at 1–5 Hz.

---

## FAQ / Judge Q&A

**Q: Why Leaflet with Google Maps tiles instead of only the Google Maps JavaScript SDK?**
Leaflet provides lightweight, hardware-accelerated rendering for hundreds of moving vehicles, polylines, and signal markers without heavy API quota usage. We combine Leaflet's rendering performance with official Google Maps tile layers (Street, Satellite, Traffic, Terrain) and direct Google Maps deep-links for native turn-by-turn voice navigation.

**Q: How do you handle real-time concurrency?**
WebSocket rooms via Socket.IO. Instead of client polling, the server broadcasts state deltas ("ticks") at 1 Hz, so clients receive live telemetry with low latency.

**Q: Is the data persistent or in-memory?**
Real-time traffic control needs sub-millisecond reads/writes, so the live road network graph is kept in memory with atomic signal transactions. REST APIs expose historical logs for external/municipal integration.

**Q: Can this be deployed to an entire city?**
Yes — the architecture is modular. Each intersection/corridor runs as an independent state machine, so a production deployment could partition the city into zone-based microservices connected via a message broker (e.g., Apache Kafka or Redis Pub/Sub).

---

## Roadmap

- [ ] Swap synthetic/simulated data for a real historical traffic dataset
- [ ] Add persistent storage (PostgreSQL/TimescaleDB) for historical analytics
- [ ] Replace scoring-based XAI model with a trained ML model (Random Forest / XGBoost)
- [ ] Multi-city / multi-zone deployment support via message broker
- [ ] Mobile-responsive commuter app view

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

### Acknowledgements

Built with Node.js, Express, Socket.IO, Leaflet.js, and Chart.js. Traffic flow modeling based on the Greenshields (1935) macroscopic traffic model.