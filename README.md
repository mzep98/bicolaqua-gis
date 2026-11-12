# BicolAqua 3D GIS — Naga City Water Atlas

An interactive 3D geospatial decision-support system for municipal water governance, water quality telemetry, flood-risk assessment, and emergency water tanker logistics across all **27 barangays of Naga City, Camarines Sur, Philippines**.

---

## Core Features

### 1. Interactive 3D Geospatial City Diorama (`BicolMap3D`)
* **27-Barangay Municipal Coverage:** Full planar tessellation and terrain-draped boundaries covering all 27 official Naga City barangays—from the Bicol River floodplain (*Abella, Sabang, Mabolo, Dinaga, Tabuco, Triangulo*) to the Mt. Isarog foothills (*Cararayan, San Isidro, Pacol, Carolina, Panicuason*).
* **Topography & Hydrology:** Continuous elevation modeling from the Naga–Bicol River confluence up to Mt. Isarog, featuring verified river channels and four civil-engineering river crossings (**Tabuco Bridge**, **Delfin Rosales / Mabolo Bridge**, **Magsaysay Bridge**, and **Balatas Crossing**).
* **Street-Aligned Urban Architecture & Landmarks:** Procedural street-aligned urban blocks paired with multi-part 3D models of recognizable Naga City landmarks (**Naga Metropolitan Cathedral**, **Basilica Minore de Peñafrancia**, **SM City Naga**, **Naga City Hall**, and **Ateneo de Naga University**).
* **Custom 3D Water Facility Nodes:** Distinct 3D infrastructure assemblies (**Handpumps**, **Communal Springs**, **Public Kiosks with Elevated Tanks**, **School Filtration Stations**, and the **CDRRMO Logistics Depot**) with live pulsing status rings driven by each station's **Water Vulnerability Index (WVI)**:
  * **Safe (`< 35`):** Compliant water quality parameters
  * **Moderate (`35 – 64`):** Boil-water advisory / elevated turbidity or TDS
  * **Critical (`≥ 65`):** Coliform contamination or hardware failure requiring immediate intervention
* **Automated Shortest-Path Tanker Routing:** Graph-based Dijkstra routing along Naga City's primary road and bridge network, complete with animated 3D water tanker units deploying from the CDRRMO Depot to critical facilities and a toggleable flood-susceptibility overlay.

### 2. Role-Based Actor Workspaces
* **Map View (Default):** Unobstructed 3D city exploration with global search, layer toggles (Flood Susceptibility & Tanker Corridors), 360° camera controls, and a contextual facility telemetry inspector.
* **LGU WASH:** City-wide governance KPIs (total population served, mean city WVI, active dispatches) and a filterable triage dock.
* **CDRRMO:** Emergency response dispatch tracker with a 5-stage deployment timeline and flood-exposure prioritization.
* **BHW Field:** Field inspection kit for Barangay Health Workers to log pH, TDS (ppm), turbidity (NTU), hardware status, and coliform strip results.
* **Resident:** Public Safe Water Point Finder with source-type and safety-tier filters, plus a community incident reporting modal.

### 3. Offline-First Resilience
* Designed for field deployment in areas with intermittent connectivity. Field inspections submitted while offline are queued locally in `localStorage` and synchronized to the FastAPI/PostGIS backend once connectivity is restored. When run standalone without a live backend server, the frontend seamlessly operates using built-in Naga City baseline telemetry.

---

## System Architecture

```text
bicolaqua-gis/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BicolMap3D.jsx        # Three.js / React Three Fiber 3D terrain, roads, bridges, landmarks & facilities
│   │   │   └── BicolAquaLogo.jsx     # Scalable vector brand mark
│   │   ├── data/
│   │   │   └── nagaGeoData.js        # WGS84-to-world projection, 27-barangay GeoJSON, road graph & Dijkstra router
│   │   ├── utils/
│   │   │   └── offlineQueue.js       # LocalStorage offline inspection queue & telemetry cache
│   │   ├── App.jsx                   # Consolidated HUD, search/filter engine & actor workspaces
│   │   └── index.css                 # Tailwind CSS configuration & brand palette tokens
│   └── package.json
└── backend/                          # FastAPI + PostGIS REST API (/api/v1/water-points, /api/v1/inspections/sync)
```

---

## Tech Stack

* **3D Rendering & GIS:** Three.js, React Three Fiber (`@react-three/fiber`), `@react-three/drei`
* **Frontend Framework:** React, Vite, Tailwind CSS, Lucide Icons
* **Backend & Spatial Database (Optional):** Python FastAPI, PostgreSQL / PostGIS

---

## Brand Color System

| Token | Color | Hex | Usage |
| :--- | :--- | :--- | :--- |
| Primary Dark | Yale Blue | `#033F56` | Navigation anchors, active workspace tabs, depot & headers |
| Primary Brand | Baltic Blue | `#01658E` | Interactive controls, secondary text, institutional accents |
| Secondary Hydro | Pacific Blue | `#00B3CD` | 3D Naga & Bicol River surfaces, live telemetry status |
| Accent Bright | Strong Cyan | `#2ED5E5` | Flood-susceptibility zones, active highlights |
| Accent Soft | Electric Aqua | `#91EFF7` | Card borders, subtle surface tints |
| Accent Warm 1 | Atomic Tangerine | `#FD7132` | Emergency tanker dispatch routes, critical alerts |
| Accent Warm 2 | Tangerine Dream | `#FE9659` | Barangay boundary outlines, warm highlights |
| Canvas Base | White | `#FDFDFD` | Floating HUD cards and high-contrast surfaces |

---

## Local Development

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser to explore the 3D Naga City Water Atlas.