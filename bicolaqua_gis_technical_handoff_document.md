# BICOLAQUA-GIS — COMPREHENSIVE TECHNICAL HANDOFF DOCUMENT (FOR GOOGLE ANTIGRAVITY)

---

## 1. Project Overview

* **Project Name:** BicolAqua-GIS — 3D Community Water Access and Quality Mapping Platform
* **Repository:** `https://github.com/mzep98/bicolaqua-gis`
* **Live Deployment:** `https://bicolaqua-gis.vercel.app/`
* **Geographic Scope:** Naga City, Camarines Sur, Philippines (covering 27 barangays, centered around `13.6238° N, 123.1935° E`, bounded by the Bicol River, Naga River, and Mt. Isarog eastern foothills).
* **Core Purpose:** Provide a geographically credible, interactive 3D GIS platform for community water access, water quality monitoring, Water Vulnerability Index (WVI) assessment, flood susceptibility visualization, emergency tanker routing, community incident reporting, role-based workspaces, and offline-first field inspection synchronization.
* **Technology Stack & Architecture:**
  * **Frontend:** React 18, Vite, Tailwind CSS, `three` (Three.js), `@react-three/fiber` (R3F), `@react-three/drei`, `lucide-react`.
  * **Backend:** Python FastAPI (`http://127.0.0.1:8000/api/v1`) with PostgreSQL/PostGIS integration (not directly inspected in this chat; frontend gracefully falls back to cached/initial state when offline or unreachable).
  * **Primary Inspected Frontend Files:**
    * `frontend/src/App.jsx` — Main UI shell, search/filtering, role-based authentication, workspace switching, offline queue sync, community incident reporting, and HUD overlays.
    * `frontend/src/components/BicolMap3D.jsx` — Three.js / React Three Fiber `<Canvas>`, terrain mesh, river/road ribbons, bridges, 3D buildings, water facilities, tanker routing animation, and `<Html>` overlays.
    * `frontend/src/data/nagaGeoData.js` — Coordinate projection (`geoToWorld`), analytical terrain elevation (`getTerrainY`), Dijkstra road routing (`getShortestRoadRouteCoords`), river/road/bridge/landmark coordinates, 27-barangay GeoJSON polygons, building/tree placement generators, initial water points, incident reports, and role definitions.
    * `frontend/src/utils/offlineQueue.js` — `localStorage`-backed offline inspection queue and cached water point storage (referenced in `App.jsx`; contents not pasted in this session).
    * `frontend/src/components/BicolAquaLogo.jsx` — Brand SVG/logo component (referenced in `App.jsx`; contents not pasted in this session).

---

## 2. Original Requirements

### Mandatory Requirements
1. **Continue Existing Repository:** Do not build a replacement application; modify the existing codebase in `mzep98/bicolaqua-gis`.
2. **Replace Primitive 3D Modeling Strategy:** Eliminate blob-like primitive placeholders. Implement a hybrid modeling approach combining external `.glb`/`.gltf` assets (when provided) with detailed, multi-part architectural and infrastructure models (distinct residential, commercial, civic/landmark, and water infrastructure structures).
3. **Sample Validation Gate:** Validate 3 representative 3D models (1 realistic residential building, 1 realistic commercial building, 1 realistic water facility) inside the running application before expanding across the entire city.
4. **Geospatial & Physical Accuracy:**
   * Objects must not float above rivers/terrain, sink below ground, or overlap roads, bridges, or other buildings.
   * Preserve legitimate riverbank/waterfront proximity for water facilities while eliminating physically impossible placements.
   * Distinguish verified geographic/telemetry data from simulated or estimated data.
   * Maintain a coherent, connected road network where tanker routes follow valid roads and bridges without passing through buildings.
5. **Interface Simplification & Predominantly White UI:**
   * Reduce excessive map tags, badges, and labels that clutter the screen; reveal detailed metadata on hover/selection.
   * Maintain a predominantly white interface (`bg-white`, subtle slate borders/grays, restrained `#0284C7` sky-blue accent) while keeping natural/vibrant colors in the 3D geographic scene.
6. **Generalized Role Selection & Authentication:**
   * Support exactly three general user categories: **Community User**, **LGU Personnel**, and **Administrator**.
   * Role selection must trigger credential authentication for privileged roles (`LGU_PERSONNEL`, `ADMIN`), not act as an unauthenticated switcher.
   * Strictly exclude hardcoded personal names (engineers, coaches, students) or fabricated personal accounts.
7. **Preserve All Working Functionality:** Do not break `MapCameraRig`, offline inspection queueing (`localStorage`), FastAPI sync, Dijkstra tanker routing, WVI calculation, water-point selection/telemetry, 2D/3D synchronization, or role permissions.

### Preferences & Direction
* **3D Visual Direction:** Polished, detailed, gamified isometric/city-builder aesthetic (inspired by detailed simulation/city-building games) combined with credible GIS spatial relationships.
* **Workflow Discipline:** Diagnose root causes in source code first, explain solutions concisely, implement directly, and verify in the running rendered application.

---

## 3. Implementation History

Because this assistant operated without direct filesystem write access to the user's local machine, changes were delivered as code modules/replacements that the user pasted into their local repository across four turns:

1. **Turn 1 — Initial Validation Component (`SampleModelsValidation.jsx`) & OSM Pipeline Blueprint:**
   * Provided a standalone `SampleModelsValidation.jsx` module featuring `useVerifiedGLTF`, `RecessedWindowBay`, `HipRoofAssembly`, `SampleResidentialBuilding`, `SampleCommercialBuilding`, and `SampleWaterFacility`.
   * *Outcome:* Did not appear in the user's running app because `BicolMap3D.jsx` still used its internal `ValidationSampleShowcase` gated behind an unwired `validationMode` prop, and `useOptionalGLTF(null)` never loaded external `.glb` files.
2. **Turn 2 — First `BicolMap3D.jsx` & `nagaGeoData.js` Replacement:**
   * Added `useNormalizedGLTF` (bounding-box scaling and `min.y = 0` pivot grounding), `HIP_ROOF_GEOMETRY`, `RecessedWindow`, `FootprintExtrudedBuilding` (L- and U-shaped parcel polygons), multi-wing landmarks (`cathedral`, `basilica`, `mall`, `university`, `hall`), higher-density road-aligned building placement in `nagaGeoData.js`, and a floating validation toggle button.
   * *Outcome:* User reported improvement in building shapes, but identified three remaining failures: (a) water pumps still lacked detail, (b) the 3D environment looked dim and gray instead of vibrant green, and (c) the user subsequently reported excessive UI tags/badges and objects floating/overlapping rivers.
3. **Turn 3 — Lighting, Green Terrain & High-Detail Water Pump Rebuild (`BicolMap3D.jsx`):**
   * Removed the gray `urbanGrad` radial overlay in `useSceneTextures()`, added `THREE.SRGBColorSpace` to procedural `CanvasTexture` instances, shifted terrain colors to sunlit greens (`#58943D`–`#7EBA5E`), raised ambient/hemisphere/directional light intensities with `ACESFilmicToneMapping`, and rebuilt `DetailedWaterFacilityModel` (specifically adding a multi-part cast-iron deep-well handpump with bolted flange, ribbed barrel, gooseneck spout, water stream, yellow 20L jerrycan, fulcrum lever, and sanitary curb pad, plus cross-braced steel water towers).
   * *Outcome:* User pasted `App.jsx` showing `validationMode` wired in the header (`Validate 3D Models` button) and predominantly white UI implemented, then issued a comprehensive follow-up specification with two new city-builder visual references and requested a strict **diagnostic audit before making further edits**.
4. **Turn 4 — Comprehensive 3D Model Developer Diagnostic Audit (Current State):**
   * Performed a full source-code audit across `BicolMap3D.jsx`, `nagaGeoData.js`, and `App.jsx` without modifying code, producing a prioritized P0–P5 engineering report (documented in Sections 5 and 6 below).

---

## 4. Current Application State

### What Currently Works
* **Predominantly White GIS Interface (`App.jsx`):** Clean white top header (`h-14 bg-white border-b border-slate-200`), floating translucent white HUD cards, WVI risk symbology legend (`Safe <35`, `Advisory 35–64`, `Critical 65+`), and white modals.
* **Generalized Role Selection & Credential Authentication (`App.jsx`, `nagaGeoData.js`):** Three general roles (`Community User`, `LGU Personnel`, `Administrator`) with credential verification modal (`LGU-NAGA-2026` and `ADMIN-GIS-2026`), role-gated workspaces (`Map Overview`, `Water Point Finder`, `LGU Operations`, `Field Inspection`, `Administration`), and zero hardcoded personal names.
* **Core GIS Workflows (`App.jsx`, `nagaGeoData.js`):**
  * Water-point selection syncing between 3D nodes, top-right detail inspector, and sidebar lists.
  * Live WVI recalculation on field inspection submission, offline queueing via `utils/offlineQueue.js`, and FastAPI sync attempt (`POST /api/v1/inspections/sync`).
  * Community incident reporting modal and admin status moderation (`Under LGU Review`, `Tanker Dispatched`, `Resolved`) with audit log tracking.
  * Dijkstra shortest-path routing (`getShortestRoadRouteCoords`) from `CDRRMO_JCT` to each water point's mapped road node (`POINT_ROAD_NODE_MAP`).
  * `MapCameraRig` with `ZOOM_IN`, `ZOOM_OUT`, `RESET`, `OVERVIEW`, node focus, and terrain minimum-Y collision clamping.
* **3D Validation Showcase Mode (`validationMode`):** Accessible via the `"Validate 3D Models"` button in `App.jsx`, displaying residential, commercial, water kiosk, and handpump models on an inspection pedestal.

### What Partially Works
* **Hybrid GLB + Procedural Architecture (`BicolMap3D.jsx`):** `useNormalizedGLTF` is implemented and attempts to load `/models/residential_house.glb`, `/models/commercial_building.glb`, and `/models/water_kiosk.glb`, falling back to procedural multi-mesh assemblies when `.glb` files are absent from `frontend/public/models/`. However, no `.glb` assets exist in the repository yet, and the procedural city still lacks the cohesive block-level polish (sidewalks, crosswalks, parcel bases, varied building archetypes) shown in the visual references.
* **3D Lighting & Terrain Color:** Addressed in Turn 3 code (`SRGBColorSpace`, removal of gray `urbanGrad`, `ACESFilmicToneMapping`), **not yet confirmed in a live screenshot** after the user's latest prompt.

### What Remains Broken (Verified in Source Code)
1. **Stray Diff Characters in `frontend/src/App.jsx`:** Lines 387, 481, 681, 789, 797, and 944 in the user's pasted `App.jsx` contain literal `- ` diff markers inside JSX text nodes (e.g., `- Active Role: ...`, `- Brgy. {pt.barangay}`).
2. **Coordinate Scale & Anisotropy Distortion (`nagaGeoData.js`):** `geoToWorld` uses `(lng - NAGA_CENTER.lng) * 255` without $\cos(\text{lat})$ correction (`1 unit ≈ 434m`), making individual houses (`w = 0.20`) ~87m wide and water pumps ~190m wide relative to real geographic distances.
3. **Objects Floating Above Slopes & Overlapping Rivers/Roads:**
   * `FootprintExtrudedBuilding` has no downward foundation skirt, causing polygon buildings on Mt. Isarog slopes to float on their downhill edges.
   * `BridgeStructures` renders flat horizontal decks at `baseY + 0.032` while `getRoadSurfaceY` moves the tanker along a sinusoidal arch (`+0.088 + sin(t*π)*0.082`), and the underlying ground road ribbon still renders across the water beneath the bridge.
   * `NAGA_RIVER_COORDS` / `BICOL_RIVER_COORDS` Catmull-Rom ribbons are overly wide (`0.60`–`0.80` units) and overlap adjacent waterfront roads/nodes (`DINAGA_JCT`, `SABANG_JCT`, `MAGSAYSAY_BRIDGE_N`).
   * `isClearOfInfrastructure` checks only building center points and isotropic bounding circles rather than rotated 4-corner OBBs, allowing building corners to clip into intersecting roads and neighboring buildings.
4. **Geometric Defects in Extrusions, Roofs & Road Ribbons (`BicolMap3D.jsx`):**
   * `FootprintExtrudedBuilding` calls `extrude.rotateX(-Math.PI / 2)` on `(px, pz)` shapes, mirroring Z-coordinates (`pz -> -Z`) and stretching wall UVs.
   * `HIP_ROOF_GEOMETRY` shares vertices across perpendicular roof slopes and bottom soffit, producing smoothed/rounded normal shading instead of crisp roof facets.
   * `createTerrainRibbonGeometry` skips vertex pairs at sharp road polyline corners, causing inner-edge self-intersections and outer-edge gaps.
5. **Excessive DOM `<Html>` Clutter & Draw-Call Overhead:**
   * Up to 36 simultaneous `<Html>` overlays (27 barangay district badges + 8 verbose water point pills + CDRRMO hub label) render at once, cluttering the viewport.
   * `DioramaTrees` mounts ~1,350 individual `<mesh>` components instead of `THREE.InstancedMesh`, and `DirectionalLight` shadow frustum (`36 × 36` units) is too wide for crisp architectural contact shadows.

---

## 5. Outstanding Problems and Root Causes

| ID | Issue & Observed Symptom | Root Cause (Confirmed in Source Code) | Affected Files & Functions | Proposed Solution |
| :--- | :--- | :--- | :--- | :--- |
| **ISS-01** | **Severe Scale Distortion & E-W Stretch:** Houses and water pumps appear stadium-sized relative to roads and rivers. | `geoToWorld` multiplies degrees by `255` (`1 unit ≈ 434m`) and omits $\cos(13.6238^\circ) \approx 0.9718$ on longitude. Building/pump dimensions (`0.20–0.58`) are 10x–20x too large for that scale. | `nagaGeoData.js`: `geoToWorld`, `NAGA_BUILDING_CLUSTERS`, `NAGA_LANDMARKS` | Apply $\cos(\text{NAGA\_CENTER.lat})$ to `x` in `geoToWorld`; recalibrate building footprints (`0.10–0.18`), road widths (`0.08–0.13`), and water-point scale (`0.55–0.65`) so 3–5 structures fit naturally per block. |
| **ISS-02** | **Polygon Buildings Float on Slopes:** Extruded L/U-shaped buildings hover on downhill terrain edges in upland barangays. | `FootprintExtrudedBuilding` extrudes from `y = 0` to `b.h` without a sub-terrain foundation skirt (`y = -0.32` to `0.01`). | `BicolMap3D.jsx`: `FootprintExtrudedBuilding` | Extrude a matching sub-terrain concrete foundation plinth downward (`-0.32` to `0.008`) for every `b.footprint` polygon. |
| **ISS-03** | **Bridges & Tankers Float / Double-Render Over Rivers:** Tankers float above flat bridge decks while ground asphalt ribbons cut across the water underneath. | `BridgeStructures` renders a flat box at `baseY + 0.032`, whereas `getRoadSurfaceY` uses a sinusoidal arch (`+0.088 + sin(t*π)*0.082`). Also, `NAGA_ROADS_COORDS` draws ground ribbons through bridge spans. | `BicolMap3D.jsx`: `BridgeStructures`, `getRoadSurfaceY`, `TerrainRibbons`; `nagaGeoData.js`: `NAGA_CONTINUOUS_ROAD_CORRIDORS` | Match `BridgeStructures` deck geometry to the exact parabolic curve of `getRoadSurfaceY`, include approach ramps meeting `yOffset = 0.044`, and split road corridors at bridge endpoints. |
| **ISS-04** | **Rivers Overlap Roads & Waterfront Parcels:** Riverbanks encroach onto Dinaga, Sabang, and Tabuco streets. | `NAGA_RIVER_COORDS` (`width = 0.60`) and `BICOL_RIVER_COORDS` (`width = 0.80`) use wide Catmull-Rom splines close to road nodes (`DINAGA_JCT`, `SABANG_JCT`). | `nagaGeoData.js`: `NAGA_RIVER_COORDS`, `BICOL_RIVER_COORDS`, `SAMPLED_RIVER_SEGMENTS` | Narrow river channel widths (`0.26` Naga River, `0.42` Bicol River), refine river control points between bridge abutments, and enforce dense spline clearance checks. |
| **ISS-05** | **Building Corners Overlap Roads & Neighbors:** Rotated buildings clip into intersections and adjacent structures. | `isClearOfInfrastructure` checks only building centers and an isotropic radius (`Math.hypot(w, d) * 0.44`), ignoring rotated rectangular corners. | `nagaGeoData.js`: `isClearOfInfrastructure`, `NAGA_BUILDING_CLUSTERS` | Check all 4 rotated footprint corners plus center against road segments, river splines, landmarks, and OBB footprints of placed buildings. |
| **ISS-06** | **Mirrored Z-Axis & Stretched Wall UVs on Polygon Extrusions:** L/U buildings mirror across X-axis and stretch facade textures. | `THREE.ExtrudeGeometry` rotated by `rotateX(-Math.PI / 2)` maps shape `Y` (`pz`) to `-Z` and generates planar UVs. | `BicolMap3D.jsx`: `FootprintExtrudedBuilding` | Negate `pz` (`shape.moveTo(px, -pz)`) before `rotateX(-Math.PI / 2)` and build metric-UV wall geometry so facade textures tile cleanly. |
| **ISS-07** | **Pillowy Roof Shading & Sharp-Corner Road Ribbon Tears:** Hip roofs lack crisp edges; road corners pinch/fold. | `HIP_ROOF_GEOMETRY` shares vertices across 90° edges before `computeVertexNormals()`; `createTerrainRibbonGeometry` skips miter normals at polyline bends. | `BicolMap3D.jsx`: `HIP_ROOF_GEOMETRY`, `createTerrainRibbonGeometry` | Call `.toNonIndexed()` before `computeVertexNormals()` on roof geometries; compute clamped bisector miter normals at polyline vertices in `createTerrainRibbonGeometry`. |
| **ISS-08** | **Coplanar Z-Fighting & Lack of Gamified Block Context:** Flickering surfaces on multi-story buildings; scene lacks sidewalks, crosswalks, and parcel pads. | Full-depth window/mullion boxes pierce through core wall boxes (`0.003` separation); buildings sit directly on terrain without paved lots or intersection crosswalks. | `BicolMap3D.jsx`: `DetailedCommercialBuildingModel`, `TerrainRibbons` | Offset exterior facade elements cleanly outside core walls (`>= 0.012` separation) and add paved parcel pads, sidewalks, and intersection crosswalk markings. |
| **ISS-09** | **Screen Clutter from 36+ Simultaneous `<Html>` Tags:** Overlapping barangay and water-point badges obscure the 3D city. | `TerrainRibbons` renders 27 permanent `<Html>` barangay badges, and `WaterFacilityNode` renders wide multi-text pills at all zoom levels. | `BicolMap3D.jsx`: `TerrainRibbons`, `WaterFacilityNode`; `App.jsx` | Toggle barangay labels off by default (with a map layer toggle), and replace wide water-point pills with compact color-coded status pins that expand on hover/selection. |
| **ISS-10** | **High Draw Calls (~4,500/frame) & Blurry Shadow Frustum:** Frame drops on lower-end GPUs; missing small-object contact shadows. | `DioramaTrees` mounts ~1,350 individual `<mesh>` nodes; directional light shadow frustum (`36 × 36`) is overly wide. | `BicolMap3D.jsx`: `DioramaTrees`, `NagaMapScene` | Convert `DioramaTrees` to 3 `THREE.InstancedMesh` layers (3 draw calls total) and tighten shadow frustum to `[-12, 12]` with `shadow-normalBias={0.015}`. |
| **ISS-11** | **Stray `- ` Diff Text in `App.jsx`:** Literal `- ` characters render in UI strings. | Copy-paste artifact in `App.jsx` lines 387, 481, 681, 789, 797, and 944. | `frontend/src/App.jsx` | Remove stray `- ` prefixes and restore clean bullet separators (`•`). |

---

## 6. Latest Implementation Priorities

Execute strictly in the following P0–P5 dependency order:

1. **P0 — Coordinate Scale, River/Road Alignment & Collision Integrity (`nagaGeoData.js`):**
   * *Why first:* Every 3D mesh, bridge, building, and camera position depends on `geoToWorld` and `isClearOfInfrastructure`.
   * *Requirements:* Add $\cos(13.6238^\circ)$ correction; recalibrate river widths (`0.26` Naga, `0.42` Bicol) and road widths (`0.13` primary, `0.08` secondary); upgrade `isClearOfInfrastructure` to 4-corner rotated footprint + dense Catmull-Rom river spline checks; generate parcel-proportioned city blocks with varied residential/commercial archetypes.
2. **P1 — Terrain Grounding, Bridge/Tanker Alignment & Geometry Repair (`BicolMap3D.jsx`):**
   * *Depends on:* P0 coordinates and road/river widths.
   * *Requirements:* Add sub-terrain foundation skirts to `FootprintExtrudedBuilding`; fix Z-mirroring (`px, -pz`) and wall UVs; align `BridgeStructures` deck geometry with `getRoadSurfaceY` parabolic height curve and split underlying road ribbons across water spans; convert `HIP_ROOF_GEOMETRY` to non-indexed flat normals; add bisector miter normals to `createTerrainRibbonGeometry`.
3. **P2 — Gamified City-Builder Environment & Architectural Polish (`BicolMap3D.jsx`):**
   * *Depends on:* P0/P1 parcel layout and grounded geometry.
   * *Requirements:* Eliminate coplanar z-fighting on commercial/residential facades; add paved urban block pads, sidewalks, intersection crosswalks, rooftop details (solar panels, AC units, rooftop gardens), and preserve the upgraded water pumps (`Handpump` with jerrycan/lever, `Public Kiosk` with braced steel tower, `School Filtration` clarifier, `Communal Spring`).
4. **P3 — Rendering Performance & Shadow/Material Optimization (`BicolMap3D.jsx`):**
   * *Depends on:* P1/P2 mesh structures.
   * *Requirements:* Convert `DioramaTrees` to `THREE.InstancedMesh`; hoist shared materials/geometries and dispose on unmount; tighten directional shadow camera frustum (`[-12, 12]`) with `shadow-normalBias={0.015}` while preserving `SRGBColorSpace` textures and sunlit green terrain.
5. **P4 — Interface Decluttering & `App.jsx` Cleanup (`BicolMap3D.jsx`, `App.jsx`):**
   * *Depends on:* P2 interactive pins.
   * *Requirements:* Clean up stray `- ` characters in `App.jsx`; add a `"Labels"` toggle button in the map control bar (defaulting passive 27-barangay `<Html>` tags to hidden or subtle zoom-gated labels); replace bulky water-point pills with compact interactive status pins that expand on hover/select; preserve all role auth, WVI telemetry, offline queueing, incident reporting, and tanker routing features.

---

## 7. Design and Visual References

Five visual references were provided across the conversation:

1. **Current Baseline Screenshot (`Screenshot 2026-11-13 at 9.43.11 AM.jpg`):**
   * *Shows:* The pre-refactor state with a dark slate header, gray terrain wash, sparse box-and-pyramid houses clipping into black roads, and 35+ overlapping text badges covering the map.
2. **Bulos 3D GIS Reference (`Screenshot 2026-11-13 at 8.41.14 AM.jpg`):**
   * *Takeaways adopted:* Predominantly white floating UI cards (`bg-white`), clean search bar, crisp blue river path, lush green terrain, and restrained, minimal map pins (`RH-05 90`, `MB-04 99`) that do not overwhelm the 3D terrain.
3. **3D Urban Massing GIS Reference (`kvTpQOAE...jpg`):**
   * *Takeaways adopted:* High-density, parcel-aligned building footprints following street grids and riverbanks, clean bridges connecting road corridors across river bends, and realistic scale ratios between buildings, roads, and rivers.
4. **Stylized Gamified City Reference 1 (`pdfDFtY-...jpg`):**
   * *Takeaways adopted:* Crisp multi-story architectural massing with floor banding, rooftop structures, warm sunlit green ground parcels, river crossings, and high-contrast depth.
5. **Isometric City-Builder References (`irina-kovalenko-map4.jpg` & `isometric-cityscape-block-vector-35883344.avif`):**
   * *Takeaways required for next phase:* Paved city blocks with perimeter sidewalks, zebra crosswalks at intersections, varied building typologies (stepped corner buildings, courtyard apartments, pitched-roof houses, rooftop gardens/HVAC), street trees lining avenues, and cohesive simulation-game polish.

**Rejected Approaches (Do Not Repeat):**
* Scattering single `BoxGeometry` cubes with painted window dots or 4-vertex smooth-shaded pyramids.
* Painting gray radial gradients (`urbanGrad`) over the terrain texture or leaving procedural `CanvasTexture` instances without `THREE.SRGBColorSpace`.
* Displaying all 27 barangay labels and multi-line facility badges simultaneously at full opacity.

---

## 8. Technical Implementation Details

* **Coordinate Projection (`frontend/src/data/nagaGeoData.js`):**
  * `NAGA_CENTER = { lat: 13.6238, lng: 123.1935 }`, `BASE_ELEVATION = 0.05`.
  * Current `geoToWorld(lat, lng)` computes `x = (lng - NAGA_CENTER.lng) * 255`, `z = -(lat - NAGA_CENTER.lat) * 255`, `y = getTerrainY(x, z)`. (Needs `Math.cos(NAGA_CENTER.lat * Math.PI / 180)` factor on `x`).
  * `getTerrainY(x, z)` models a smooth lowland basin around the Bicol/Naga river confluence rising toward Mt. Isarog foothills in the northeast (`x ≈ 9.8, z ≈ -5.2`, peak `+2.45` units).
* **Road Graph & Tanker Routing (`nagaGeoData.js`):**
  * `NAGA_ROAD_NODES` (56 named WGS84 intersections), `NAGA_ROAD_EDGES` (61 weighted edges), `NAGA_BRIDGES` (4 bridges: `BRIDGE_TABUCO`, `BRIDGE_MABOLO`, `BRIDGE_MAGSAYSAY`, `BRIDGE_BALATAS`), `POINT_ROAD_NODE_MAP` (`NAGA-01` through `NAGA-08`), and `getShortestRoadRouteCoords(pointId)` (Dijkstra pathfinder from `CDRRMO_JCT`).
* **3D Component Hierarchy (`frontend/src/components/BicolMap3D.jsx`):**
  * `BicolMap3D` -> `<Canvas shadows gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}>` -> `NagaMapScene` -> `MapCameraRig`, `NagaTerrainMesh`, `TerrainRibbons` (includes `BridgeStructures`), `ValidationSampleShowcase` (when `validationMode === true`), `CityArchitecturalBuilding` (dispatches landmarks, `FootprintExtrudedBuilding`, `DetailedCommercialBuildingModel`, `DetailedResidentialHouseModel`), `DioramaTrees`, `WaterFacilityNode` (`DetailedWaterFacilityModel`), and `TankerDispatchRoute` (`DetailedTankerTruckMesh`).
* **Optional External `.glb` Asset Pipeline:**
  * `useNormalizedGLTF(url, targetW, targetD, targetH)` loads from `/models/*.glb` (`public/models/`), computes `THREE.Box3`, grounds `min.y` to `0`, and normalizes scale. Currently falls back cleanly to multi-part procedural models because `public/models/` has no `.glb` files yet.
* **Role & Data Provenance Schema (`nagaGeoData.js`, `App.jsx`):**
  * `ROLE_DEFINITIONS`: `COMMUNITY` (no code required), `LGU_PERSONNEL` (`LGU-NAGA-2026`), `ADMIN` (`ADMIN-GIS-2026`).
  * Each water point carries `data_provenance` (`'Simulated Baseline'` vs. `'Verified Field Inspection'` upon inspection submission) and `wvi_score` (`<35` Safe, `35–64` Moderate/Boil Advisory, `>=65` Critical).

---

## 9. Previous Errors and Failed Attempts

1. **Gated Validation Component Without UI Trigger:** Early implementation placed `ValidationSampleShowcase` behind `validationMode`, which `App.jsx` did not pass initially. *Lesson:* Always verify prop wiring across `App.jsx` and `BicolMap3D.jsx`.
2. **Color Space & Gray Terrain Washout:** Omitting `texture.colorSpace = THREE.SRGBColorSpace` and adding a gray radial gradient (`urbanGrad`) caused Three.js linear rendering to turn the entire map dim and muddy gray. *Lesson:* Explicitly set `SRGBColorSpace` on all color `CanvasTexture` assets.
3. **Oversized Foundation Slabs (`w * 1.28`) & Piercing Window Boxes:** Early building models used grey plinth boxes wider than the building (`w * 1.28`) and solid window boxes passing all the way through building cores, creating a "boxes sticking out of boxes" appearance and z-fighting. *Lesson:* Keep sub-terrain slope foundations strictly inset (`w * 0.90`) beneath ground level and offset facade details outside core walls.
4. **Assuming File Edits Applied Remotely:** The user initially assumed edits were written directly to their local repo when code blocks were only output in chat. *Lesson:* Clearly state which files were modified or require saving, and verify actual rendered output before advancing phases.
5. **Stray Diff Markers in `App.jsx`:** Pasting diff snippets introduced `- ` prefixes into JSX strings in `App.jsx`.

---

## 10. Recommended Next Steps

1. **Verify Live Runtime & Inspect Missing Files:**
   * Inspect `frontend/package.json`, `frontend/src/utils/offlineQueue.js`, and `backend/` (if present) to confirm installed Three.js/R3F versions and API contract.
   * Clean up the 6 stray `- ` text markers in `frontend/src/App.jsx` and confirm the Turn 3 `BicolMap3D.jsx` renders bright green terrain and detailed water pumps without runtime errors.
2. **Execute P0 (`nagaGeoData.js` Geospatial & Block Calibration):**
   * Add $\cos(\text{lat})$ correction in `geoToWorld`, tighten river and road widths to realistic proportions, implement 4-corner rotated OBB + dense Catmull-Rom spline collision filtering, and structure dense, parcel-aligned city blocks.
3. **Execute P1 & P2 (`BicolMap3D.jsx` Grounding, Bridges, Architecture & City-Builder Polish):**
   * Add sub-terrain foundations and Z-orientation fix to `FootprintExtrudedBuilding`; unify bridge deck geometry with `getRoadSurfaceY` and split road corridors across water spans; fix roof flat normals and road corner miters; add paved urban block pads, sidewalks, crosswalks, and varied building silhouettes inspired by the isometric game references.
4. **Execute P3 & P4 (Instancing, Shadow Frustum & HUD Decluttering):**
   * Convert `DioramaTrees` to `THREE.InstancedMesh`, tighten directional shadow bounds to `[-12, 12]`, add a map `"Labels"` toggle in `App.jsx` (hiding passive barangay tags by default), and convert water-point badges into compact interactive pins that expand on hover/select.
5. **End-to-End Visual & Functional QA:**
   * Test in the running Vite app across default view, zoomed street view, `Validate 3D Models` mode, all 3 user roles (`Community User`, `LGU Personnel`, `Administrator`), offline inspection queueing, and tanker route animation.

---

### A. Concise Executive Summary
BicolAqua-GIS is a React 18 / Three.js / React Three Fiber 3D GIS platform for Naga City's 27 barangays backed by Python FastAPI. Core GIS features (WVI scoring, Dijkstra tanker routing, offline inspection queueing, incident reporting, predominantly white UI, and 3-role credential authentication) are implemented and functional in `App.jsx` and `nagaGeoData.js`. However, the 3D scene still suffers from coordinate scale distortion (`1 unit ≈ 434m` without cosine latitude correction), river/road/building overlaps, floating polygon extrusions on sloped terrain, mismatched bridge-to-tanker deck heights, un-instanced tree draw calls, and excessive `<Html>` badge clutter. Following the P0–P4 roadmap in Section 6 will resolve all spatial, geometric, and UI clutter issues while preserving existing GIS functionality.

### B. Prioritized List of Remaining Tasks
1. **[P0 - Immediate]** Fix stray `- ` characters in `frontend/src/App.jsx` and apply $\cos(\text{lat})$ scale calibration, realistic river/road widths, and 4-corner OBB + river-spline collision checks in `frontend/src/data/nagaGeoData.js`.
2. **[P1 - High]** Fix `FootprintExtrudedBuilding` Z-mirroring and add sub-terrain slope foundations; align `BridgeStructures` parabolic decks with `getRoadSurfaceY` and split underlying road ribbons; fix non-indexed roof normals and road miter corners in `frontend/src/components/BicolMap3D.jsx`.
3. **[P2 - High]** Eliminate coplanar facade z-fighting and add gamified city-builder block details (paved parcel pads, sidewalks, intersection crosswalks, varied architectural silhouettes) in `BicolMap3D.jsx`.
4. **[P3 - Medium]** Convert `DioramaTrees` to `THREE.InstancedMesh`, hoist shared materials/geometries, and tighten directional shadow frustum to `[-12, 12]`.
5. **[P4 - Medium]** Declutter map `<Html>` overlays by hiding passive barangay labels behind a map toggle and replacing bulky water-point pills with compact hover/select pins in `BicolMap3D.jsx` and `App.jsx`.

### C. Files and Resources Antigravity Should Inspect First
1. `frontend/src/components/BicolMap3D.jsx` — 3D scene, terrain/road/river builders, architectural models, water facilities, lighting, and `<Html>` overlays.
2. `frontend/src/data/nagaGeoData.js` — `geoToWorld`, `getTerrainY`, road/river/bridge coordinates, Dijkstra router, building/tree placement generators, and water-point/role datasets.
3. `frontend/src/App.jsx` — Main UI shell, workspace routing, role authentication modal, offline sync, and map HUD controls.
4. `frontend/package.json` & `frontend/src/utils/offlineQueue.js` — Dependency versions (`three`, `@react-three/fiber`, `@react-three/drei`) and `localStorage` persistence logic.
5. `frontend/public/models/` (check directory) — Confirm whether any `.glb`/`.gltf` assets exist locally or if `useNormalizedGLTF` is currently operating in procedural fallback mode.