import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Eye, EyeOff, Landmark, Moon, Pause, Play, Sun, Sunrise, Sunset, Truck } from 'lucide-react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
import { AmbientLight, DirectionalLight, LightingEffect, PointLight } from '@deck.gl/core';
import MapboxMap, { Layer, Marker, Source, useControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import {
  CDRRMO_HUB,
  INITIAL_EVACUATION_CAMPS_FALLBACK,
  INITIAL_NAGA_POINTS,
  NAGA_FLOOD_HAZARD_GEOJSON,
  TANKER_ROUTES,
  buildBarangayChoroplethGeoJson,
  buildWhiteClayBuildingsGeoJson,
  getFacilityHazardCrossRef,
  getShortestRoadRouteCoords,
  getWaterFacilityPlacement,
} from '../data/nagaGeoData';
import {
  BUILDING_ARCHETYPE_CONFIGS,
  CIVIC_HALL_MIN_ZOOM,
  MAX_VIEWPORT_BUILDINGS,
  buildCityBuildingPool,
  buildSimCityLotGeoJson,
  selectViewportCityBuildings,
} from './CityBuildingBatcher';
import {
  NAGA_OSM_PRIMARY_ROADS,
  NAGA_OSM_SECONDARY_ROADS,
  NAGA_TERTIARY_ROADS,
} from '../data/nagaOsmRoads';
import {
  buildBarangayEnvironment,
  buildBarangayEnvironmentLayers,
  loadEnvironmentGlbCatalog,
} from './BarangayEnvironment3D';

const TERRAIN_EXAGGERATION = 1.3;
const SHOW_3D_MODELS_MIN_ZOOM = 12.8;
const WHITE_EXTRUSION_HIDE_ZOOM = 14.9;
const BARANGAY_INSPECT_ZOOM = 15.6;
const BARANGAY_INSPECT_MIN_ZOOM = 14.8;
const BARANGAY_INSPECT_PITCH = 58;
const DEFAULT_MIN_ZOOM = 10;
const DEFAULT_MAX_ZOOM = 20;

const TANKER_MODEL_PATH = '/models/water_tanker.glb';
const SHOPHOUSE_MODEL_URL = '/models/shophouse_commercial.glb?v=2';
const TERRAIN_CONFIG = { source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION };
const INTERACTIVE_LAYER_IDS = [
  'bicol-barangays-fill',
  'bicol-barangay-risk-columns',
  // ...keep any other existing IDs you already have here
];
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

// Adaptive streetscape enabled across all 27 Naga City barangays
const STREETSCAPE_BARANGAYS = null;

function multiplyMat4(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function getNodeLocalMat4(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return Float64Array.from(node.matrix);
  }
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function transformPointMat4(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

async function inspectGlbFitMetrics(sourceUrl, targetRawSize = [12.5, 11.4, 13.5]) {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return { scaleMult: [1, 1, 1], baseLiftUnits: 0, centerOffset: [0, 0] };
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);
    if (buf.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
      return { scaleMult: [1, 1, 1], baseLiftUnits: 0, centerOffset: [0, 0] };
    }

    const jsonLen = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a) {
      return { scaleMult: [1, 1, 1], baseLiftUnits: 0, centerOffset: [0, 0] };
    }
    const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const visitNode = (nodeIdx, parentMat) => {
      const node = gltf.nodes?.[nodeIdx];
      if (!node) return;
      const worldMat = multiplyMat4(parentMat, getNodeLocalMat4(node));

      if (typeof node.mesh === 'number' && gltf.meshes?.[node.mesh]) {
        for (const prim of gltf.meshes[node.mesh].primitives || []) {
          const acc = gltf.accessors?.[prim.attributes?.POSITION];
          if (Array.isArray(acc?.min) && Array.isArray(acc?.max)) {
            for (const x of [acc.min[0], acc.max[0]]) {
              for (const y of [acc.min[1], acc.max[1]]) {
                for (const z of [acc.min[2], acc.max[2]]) {
                  const [wx, wy, wz] = transformPointMat4(worldMat, x, y, z);
                  if (wx < minX) minX = wx;
                  if (wx > maxX) maxX = wx;
                  if (wy < minY) minY = wy;
                  if (wy > maxY) maxY = wy;
                  if (wz < minZ) minZ = wz;
                  if (wz > maxZ) maxZ = wz;
                }
              }
            }
          }
        }
      }

      for (const childIdx of node.children || []) {
        visitNode(childIdx, worldMat);
      }
    };

    const sceneIdx = gltf.scene ?? 0;
    const rootNodes = gltf.scenes?.[sceneIdx]?.nodes || [];
    for (const rIdx of rootNodes) {
      visitNode(rIdx, identity);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) {
      return { scaleMult: [1, 1, 1], baseLiftUnits: 0, centerOffset: [0, 0] };
    }

    const spanX = Math.max(1e-4, maxX - minX);
    const spanY = Math.max(1e-4, maxY - minY);
    const spanZ = Math.max(1e-4, maxZ - minZ);

    const sx = targetRawSize[0] / spanX;
    const sy = targetRawSize[1] / spanY;
    const sz = targetRawSize[2] / spanZ;

    return {
      scaleMult: [sx, sy, sz],
      baseLiftUnits: -minY * sy,
      centerOffset: [(minX + maxX) * 0.5 * sx, (minZ + maxZ) * 0.5 * sz],
    };
  } catch {
    return { scaleMult: [1, 1, 1], baseLiftUnits: 0, centerOffset: [0, 0] };
  }
}

function normalizeBarangayName(name) {
  return String(name || '')
    .replace(/^brgy\.?\s*/i, '')
    .trim()
    .toLowerCase();
}

const MAJOR_ARTERIAL_ROADS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    ...NAGA_OSM_PRIMARY_ROADS.map((line, idx) => ({
      type: 'Feature',
      properties: { id: `primary-${idx}`, tier: 'primary' },
      geometry: {
        type: 'LineString',
        coordinates: line.map(([lat, lng]) => [lng, lat]),
      },
    })),
    ...NAGA_OSM_SECONDARY_ROADS.map((line, idx) => ({
      type: 'Feature',
      properties: { id: `secondary-${idx}`, tier: 'secondary' },
      geometry: {
        type: 'LineString',
        coordinates: line.map(([lat, lng]) => [lng, lat]),
      },
    })),
    ...NAGA_TERTIARY_ROADS.map((line, idx) => ({
      type: 'Feature',
      properties: { id: `tertiary-${idx}`, tier: 'tertiary' },
      geometry: {
        type: 'LineString',
        coordinates: line.map(([lat, lng]) => [lng, lat]),
      },
    })),
  ],
};

const FACILITY_MODEL_CONFIGS = [
  {
    key: 'hand-pump',
    url: '/models/hand_pump.glb',
    sizeScale: 24,
    facilityIds: new Set(['NAGA-04', 'NAGA-05', 'NAGA-06', 'NAGA-08']),
  },
  {
    key: 'water-tank-1',
    url: '/models/water_tank_1.glb',
    sizeScale: 46,
    facilityIds: new Set(['NAGA-01']),
  },
  {
    key: 'water-tank-2',
    url: '/models/water_tank_2.glb',
    sizeScale: 48,
    facilityIds: new Set(['NAGA-02']),
  },
  {
    key: 'water-tank-3',
    url: '/models/water_tank_3.glb',
    sizeScale: 46,
    facilityIds: new Set(['NAGA-03']),
  },
  {
    key: 'water-tank-4',
    url: '/models/water_tank_4.glb',
    sizeScale: 47,
    facilityIds: new Set(['NAGA-07']),
  },
];

function getFacilityModelKey(point) {
  const matched = FACILITY_MODEL_CONFIGS.find((cfg) => cfg.facilityIds.has(point.id));
  if (matched) return matched.key;
  if (point.source_type === 'Handpump' || point.source_type === 'Gravity Spring Box') {
    return 'hand-pump';
  }
  return 'water-tank-1';
}

function samplePathLngLatAtFraction(path, cumDist, totalLen, fraction) {
  const targetDist = Math.min(totalLen, Math.max(0, totalLen * fraction));
  for (let i = 0; i < path.length - 1; i++) {
    const startD = cumDist[i];
    const endD = cumDist[i + 1];
    if (endD >= targetDist || i === path.length - 2) {
      const segLen = endD - startD;
      const t = segLen > 0 ? Math.min(1, Math.max(0, (targetDist - startD) / segLen)) : 0;
      const p1 = path[i];
      const p2 = path[i + 1];
      return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
    }
  }
  return path[0];
}

function getRouteSamplePoint(path, fraction = 0.68) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const cumDist = [0];
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    cumDist.push(cumDist[i] + segLen);
  }
  const totalLen = cumDist[cumDist.length - 1];
  if (totalLen <= 0) {
    return { lng: path[0][0], lat: path[0][1], bearingDeg: 0 };
  }
  const f = Math.min(1, Math.max(0, fraction));
  const [lng, lat] = samplePathLngLatAtFraction(path, cumDist, totalLen, f);
  const lookBehind = samplePathLngLatAtFraction(path, cumDist, totalLen, Math.max(0, f - 0.018));
  const lookAhead = samplePathLngLatAtFraction(path, cumDist, totalLen, Math.min(1, f + 0.018));
  const midLatRad = (((lookBehind[1] + lookAhead[1]) / 2) * Math.PI) / 180;
  const dEast = (lookAhead[0] - lookBehind[0]) * Math.cos(midLatRad);
  const dNorth = lookAhead[1] - lookBehind[1];
  const bearingDeg = (Math.atan2(dEast, dNorth) * 180) / Math.PI;
  return { lng, lat, bearingDeg };
}

function getMapboxLightPreset(minutes = 720) {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m < 315 || m >= 1140) return 'night';
  if (m < 435) return 'dawn';
  if (m < 1005) return 'day';
  return 'dusk';
}

function computeSolarBasemapPalette(solarState) {
  const m = solarState?.minutes ?? 720;
  const night = Math.max(0, Math.min(1, solarState?.streetLightFactor ?? 0));
  const dawnW = Math.max(0, 1 - Math.abs(m - 360) / 110);
  const duskW = Math.max(0, 1 - Math.abs(m - 1080) / 110);
  const twilight = Math.max(dawnW, duskW);

  const mixRgb = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  const blend3 = (day, twi, ngt) => mixRgb(mixRgb(day, ngt, night), twi, twilight * 0.65);
  const toHex = ([r, g, b]) =>
    '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  const toCss = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

  const fogColor = blend3([214, 232, 248], [252, 186, 134], [20, 32, 56]);
  const fogHigh = blend3([56, 132, 224], [104, 92, 162], [10, 18, 38]);
  const fogSpace = blend3([220, 236, 250], [42, 46, 86], [6, 11, 24]);

  return {
    lightPreset: getMapboxLightPreset(m),
    colorLand: toHex(blend3([167, 223, 158], [184, 174, 126], [26, 40, 58])),
    colorGreenspace: toHex(blend3([138, 209, 126], [148, 156, 108], [19, 32, 48])),
    colorWater: toHex(blend3([34, 211, 238], [68, 134, 178], [14, 42, 74])),
    colorRoads: toHex(blend3([241, 245, 249], [236, 214, 192], [51, 65, 85])),
    colorTrunks: toHex(blend3([203, 213, 225], [214, 184, 158], [71, 85, 105])),
    colorMotorways: toHex(blend3([148, 163, 184], [180, 146, 126], [100, 116, 139])),
    fog: {
      range: [1.5, 10],
      color: toCss(fogColor),
      'high-color': toCss(fogHigh),
      'horizon-blend': Number((0.05 + night * 0.09 + twilight * 0.06).toFixed(2)),
      'space-color': toCss(fogSpace),
      'star-intensity': Number(Math.min(0.75, night * 0.65 + twilight * 0.15).toFixed(2)),
    },
  };
}

function applyMapboxStandardConfig(map, hideMinorRoads, solarState) {
  if (!map) return;
  const palette = computeSolarBasemapPalette(solarState);

  if (map.setConfigProperty) {
    const safeSetBasemapConfig = (key, value) => {
      if (value === undefined) return;
      try {
        map.setConfigProperty('basemap', key, value);
      } catch {
        // Ignore unsupported Standard style config key
      }
    };

    safeSetBasemapConfig('show3dObjects', false);
    safeSetBasemapConfig('show3dBuildings', false);
    if (map.__lastLightPreset !== palette.lightPreset) {
      safeSetBasemapConfig('lightPreset', palette.lightPreset);
      map.__lastLightPreset = palette.lightPreset;
    }
    safeSetBasemapConfig('theme', 'default');
    safeSetBasemapConfig('showPointOfInterestLabels', false);
    safeSetBasemapConfig('showTransitLabels', true);
    safeSetBasemapConfig('showRoadLabels', true);
    safeSetBasemapConfig('showPlaceLabels', true);
    safeSetBasemapConfig('showPedestrianRoads', false);
    safeSetBasemapConfig('showHdRoads', false);
    safeSetBasemapConfig('showRoadsAndTransit', true);
    safeSetBasemapConfig('colorLand', palette.colorLand);
    safeSetBasemapConfig('colorGreenspace', palette.colorGreenspace);
    safeSetBasemapConfig('colorCommercial', palette.colorLand);
    safeSetBasemapConfig('colorEducation', palette.colorLand);
    safeSetBasemapConfig('colorMedical', palette.colorLand);
    safeSetBasemapConfig('colorIndustrial', palette.colorLand);
    safeSetBasemapConfig('colorBuildings', palette.colorLand);
    safeSetBasemapConfig('colorWater', palette.colorWater);
    safeSetBasemapConfig('colorRoads', palette.colorRoads);
    safeSetBasemapConfig('colorTrunks', palette.colorTrunks);
    safeSetBasemapConfig('colorMotorways', palette.colorMotorways);
  }

  if (map.setFog) {
    try {
      map.setFog(palette.fog);
    } catch {
      // Ignore fog error during style transition
    }
  }
}

const INITIAL_VIEW_STATE = {
  longitude: 122.5,
  latitude: 13.0,
  zoom: 2.1,
  pitch: 0,
  bearing: 0,
};

const GLOBE_FOG = {
  color: 'rgb(214, 232, 248)',
  'high-color': 'rgb(56, 132, 224)',
  'horizon-blend': 0.04,
  'space-color': 'rgb(220, 236, 250)',
  'star-intensity': 0.0,
};


  

function getStatusRgb(wviScore) {
  if (wviScore >= 65) return [239, 68, 68];
  if (wviScore >= 35) return [245, 158, 11];
  return [16, 185, 129];
}

function getStatusHex(wviScore) {
  if (wviScore >= 65) return '#EF4444';
  if (wviScore >= 35) return '#F59E0B';
  return '#10B981';
}

function haversineKm(coords) {
  let km = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    km += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return km;
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(c1, c2, t) {
  return [
    Math.round(lerpNum(c1[0], c2[0], t)),
    Math.round(lerpNum(c1[1], c2[1], t)),
    Math.round(lerpNum(c1[2], c2[2], t)),
  ];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function formatMinutesToHHMM(totalMinutes) {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Smoothly fades streetlights in 17:30-18:30 (1050-1110) and out 05:30-06:30 (330-390)
function computeStreetLightFactor(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const smooth = (t) => t * t * (3 - 2 * t);
  if (m >= 1110 || m <= 330) return 1.0;
  if (m >= 390 && m <= 1050) return 0.0;
  if (m > 1050 && m < 1110) return smooth((m - 1050) / 60);
  return 1.0 - smooth((m - 330) / 60);
}

const SOLAR_KEYFRAMES = [
  // 00:00 Midnight — Deep cobalt-indigo night ambiance & dark slate roads
  { min: 0, sunColor: [56, 88, 175], sunInt: 0.28, ambColor: [52, 78, 148], ambInt: 0.62, skyColor: [72, 108, 196], skyInt: 0.52, bounceColor: [255, 172, 78], bounceInt: 0.38, groundEmissive: 0.16, shadowOpacity: 0.14 },
  // 05:00 Pre-dawn
  { min: 300, sunColor: [84, 114, 188], sunInt: 0.42, ambColor: [72, 98, 162], ambInt: 0.68, skyColor: [96, 128, 198], skyInt: 0.58, bounceColor: [235, 162, 92], bounceInt: 0.34, groundEmissive: 0.22, shadowOpacity: 0.18 },
  // 06:00 Sunrise — Warm golden low sun & long soft architectural shadows
  { min: 360, sunColor: [255, 176, 98], sunInt: 2.85, ambColor: [238, 196, 168], ambInt: 0.84, skyColor: [188, 216, 250], skyInt: 0.88, bounceColor: [224, 184, 148], bounceInt: 0.42, groundEmissive: 0.38, shadowOpacity: 0.36 },
  // 08:00 Morning — Crisp sunlit neighborhood
  { min: 480, sunColor: [255, 236, 204], sunInt: 3.45, ambColor: [232, 238, 246], ambInt: 0.94, skyColor: [196, 224, 255], skyInt: 1.05, bounceColor: [212, 222, 230], bounceInt: 0.46, groundEmissive: 0.46, shadowOpacity: 0.40 },
  // 12:00 Noon — Natural neutral daylight
  { min: 720, sunColor: [255, 248, 234], sunInt: 3.75, ambColor: [230, 240, 250], ambInt: 1.00, skyColor: [200, 228, 255], skyInt: 1.12, bounceColor: [215, 224, 232], bounceInt: 0.50, groundEmissive: 0.50, shadowOpacity: 0.42 },
  // 16:30 Late Afternoon — Warm golden-hour slant
  { min: 990, sunColor: [255, 222, 174], sunInt: 3.25, ambColor: [236, 226, 220], ambInt: 0.90, skyColor: [204, 222, 252], skyInt: 0.95, bounceColor: [216, 202, 192], bounceInt: 0.42, groundEmissive: 0.44, shadowOpacity: 0.40 },
  // 18:00 Sunset — Deep amber-orange horizon + streetlights fading in
  { min: 1080, sunColor: [255, 142, 74], sunInt: 2.45, ambColor: [212, 152, 156], ambInt: 0.76, skyColor: [164, 168, 224], skyInt: 0.74, bounceColor: [242, 164, 96], bounceInt: 0.38, groundEmissive: 0.32, shadowOpacity: 0.34 },
  // 19:00 Dusk-to-Night — Cobalt-blue twilight with glowing amber streetlamps
  { min: 1140, sunColor: [68, 102, 186], sunInt: 0.36, ambColor: [58, 86, 158], ambInt: 0.65, skyColor: [78, 114, 202], skyInt: 0.55, bounceColor: [255, 176, 82], bounceInt: 0.40, groundEmissive: 0.18, shadowOpacity: 0.16 },
  // 24:00 Midnight
  { min: 1440, sunColor: [56, 88, 175], sunInt: 0.28, ambColor: [52, 78, 148], ambInt: 0.62, skyColor: [72, 108, 196], skyInt: 0.52, bounceColor: [255, 172, 78], bounceInt: 0.38, groundEmissive: 0.16, shadowOpacity: 0.14 },
];

function computeSolarState(timeMinutes) {
  const m = ((timeMinutes % 1440) + 1440) % 1440;
  let k0 = SOLAR_KEYFRAMES[0];
  let k1 = SOLAR_KEYFRAMES[SOLAR_KEYFRAMES.length - 1];
  for (let i = 0; i < SOLAR_KEYFRAMES.length - 1; i++) {
    if (m >= SOLAR_KEYFRAMES[i].min && m <= SOLAR_KEYFRAMES[i + 1].min) {
      k0 = SOLAR_KEYFRAMES[i];
      k1 = SOLAR_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = Math.max(1, k1.min - k0.min);
  const t = (m - k0.min) / span;
  const streetLightFactor = computeStreetLightFactor(m);

  const isDayArc = m >= 330 && m <= 1110;
  const dayProgress = isDayArc ? (m - 330) / 780 : 0.5;
  const sunAngleRad = dayProgress * Math.PI;
  const sunEast = isDayArc ? Math.cos(sunAngleRad) : -0.25;
  const sunUp = isDayArc ? Math.max(0.16, Math.sin(sunAngleRad)) : 0.75;
  const sunNorth = -0.34;

  const rayDir = [-sunEast * 2.5, -sunNorth * 2.5, -sunUp * 3.0];

  const shadowLenFactor = isDayArc ? Math.min(2.85, 0.92 / Math.max(0.22, sunUp)) : 0.55;
  const shadowOffsetEastM = -sunEast * 9.5 * shadowLenFactor;
  const shadowOffsetNorthM = -sunNorth * 7.2 * shadowLenFactor;

  return {
    minutes: m,
    streetLightFactor,
    sunColor: lerpRgb(k0.sunColor, k1.sunColor, t),
    sunInt: lerpNum(k0.sunInt, k1.sunInt, t),
    ambColor: lerpRgb(k0.ambColor, k1.ambColor, t),
    ambInt: lerpNum(k0.ambInt, k1.ambInt, t),
    skyColor: lerpRgb(k0.skyColor, k1.skyColor, t),
    skyInt: lerpNum(k0.skyInt, k1.skyInt, t),
    bounceColor: lerpRgb(k0.bounceColor, k1.bounceColor, t),
    bounceInt: lerpNum(k0.bounceInt, k1.bounceInt, t),
    groundEmissive: Number(lerpNum(k0.groundEmissive, k1.groundEmissive, t).toFixed(2)),
    shadowOpacity: Number(lerpNum(k0.shadowOpacity, k1.shadowOpacity, t).toFixed(2)),
    rayDir,
    shadowOffsetEastM,
    shadowOffsetNorthM,
    shadowLenFactor,
    bgHex: rgbToHex(lerpRgb([167, 223, 158], [22, 36, 66], streetLightFactor)),
    turfHex: rgbToHex(lerpRgb([214, 158, 138], [68, 44, 52], streetLightFactor)),
    sidewalkHex: rgbToHex(lerpRgb([236, 206, 192], [102, 74, 80], streetLightFactor)),
    curbHex: rgbToHex(lerpRgb([246, 228, 218], [134, 102, 108], streetLightFactor)),
    asphaltHex: rgbToHex(lerpRgb([59, 67, 84], [19, 28, 46], streetLightFactor)),
  };
}


const DeckGLOverlay = React.memo(function DeckGLOverlay({
  staticLayers,
  waterPoints,
  activeMapNodeId,
  show3DModels,
  showTankerRoutes,
  glbModelsReady,
  tankerRoutes,
  terrainSyncTick,
  getGroundPosition,
  handleFacilityPick,
  envData,
  envCatalog,
  solarState,
}) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: true }));
  const [animTime, setAnimTime] = useState(0);


  useEffect(() => {
    let frameId = 0;
    const startMs = performance.now();
    let lastEmitMs = startMs;
    const tick = (now) => {
      if ((typeof document === 'undefined' || !document.hidden) && now - lastEmitMs >= 32) {
        lastEmitMs = now;
        setAnimTime((now - startMs) * 0.001);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

   const lightingEffect = useMemo(() => {
    const lights = {
      ambientLight: new AmbientLight({
        color: solarState.ambColor,
        intensity: solarState.ambInt,
      }),
      keySunLight: new DirectionalLight({
        color: solarState.sunColor,
        intensity: solarState.sunInt,
        direction: solarState.rayDir,
      }),
      skyFillLight: new DirectionalLight({
        color: solarState.skyColor,
        intensity: solarState.skyInt,
        direction: [2.2, 2.0, -1.8],
      }),
      groundBounceLight: new DirectionalLight({
        color: solarState.bounceColor,
        intensity: solarState.bounceInt,
        direction: [0.0, 0.0, 1.0],
      }),
    };

    if (solarState.streetLightFactor > 0.02 && envData) {
      const lamps = (envData.streetLights || []).slice(0, 12);
      lamps.forEach((sl, idx) => {
        const armRad = ((90 - (sl.yawDeg || 0)) * Math.PI) / 180;
        const lng = sl.lng + (Math.sin(armRad) * 4.2) / (111320 * Math.cos((sl.lat * Math.PI) / 180));
        const lat = sl.lat + (Math.cos(armRad) * 4.2) / 110636;
        lights[`streetLamp_${idx}`] = new PointLight({
          color: [255, 196, 98],
          intensity: 2.25 * solarState.streetLightFactor,
          position: [lng, lat, (sl.targetHeightM || 64) * 0.88],
          attenuation: [1, 0.012, 0.0005],
        });
      });

      const shops = (envData.shops || []).slice(0, 6);
      shops.forEach((sh, idx) => {
        lights[`shopWarmGlow_${idx}`] = new PointLight({
          color: [255, 174, 68],
          intensity: 1.65 * solarState.streetLightFactor,
          position: [sh.lng, sh.lat, 28],
          attenuation: [1, 0.016, 0.0007],
        });
      });
    }

    return new LightingEffect(lights);
  }, [solarState, envData]);

  const contactShadowLayers = useMemo(() => {
    const shadows = envData?.contactShadows || [];
    if (shadows.length === 0) return [];
    const offsetShadowLngLat = (lng, lat, eastM, northM) => [
      lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180)),
      lat + northM / 110636,
    ];
    const dE = solarState.shadowOffsetEastM * 0.55;
    const dN = solarState.shadowOffsetNorthM * 0.55;
    const alphaScale = solarState.shadowOpacity / 0.4;

    return [
      new ScatterplotLayer({
        id: 'bicol-env-contact-shadows-outer',
        slot: 'top',
        data: shadows,
        getPosition: (d) => {
          const [sLng, sLat] = offsetShadowLngLat(d.lng, d.lat, dE, dN);
          return getGroundPosition(sLng, sLat, 0, 0.10);
        },
        getRadius: (d) => d.radiusM * 1.22,
        radiusUnits: 'meters',
        filled: true,
        stroked: false,
        getFillColor: [15, 23, 42, Math.round(58 * alphaScale)],
        pickable: false,
        updateTriggers: {
          getPosition: [terrainSyncTick, envData, dE, dN],
          getFillColor: [alphaScale],
        },
      }),
      new ScatterplotLayer({
        id: 'bicol-env-contact-shadows-core',
        slot: 'top',
        data: shadows,
        getPosition: (d) => {
          const [sLng, sLat] = offsetShadowLngLat(d.lng, d.lat, dE * 0.6, dN * 0.6);
          return getGroundPosition(sLng, sLat, 0, 0.13);
        },
        getRadius: (d) => d.radiusM * 0.92,
        radiusUnits: 'meters',
        filled: true,
        stroked: false,
        getFillColor: [15, 23, 42, Math.round(124 * alphaScale)],
        pickable: false,
        updateTriggers: {
          getPosition: [terrainSyncTick, envData, dE, dN],
          getFillColor: [alphaScale],
        },
      }),
    ];
  }, [envData, terrainSyncTick, getGroundPosition, solarState]);

  const environment3DLayers = useMemo(
    () =>
      buildBarangayEnvironmentLayers({
        envData,
        envCatalog,
        getGroundPosition,
        terrainSyncTick,
        animTime,
        streetLightFactor: solarState.streetLightFactor,
      }),
    [envData, envCatalog, getGroundPosition, terrainSyncTick, animTime, solarState.streetLightFactor]
  );

  const tankerUnitsMemo = useMemo(() => {
    if (!show3DModels || !showTankerRoutes || tankerRoutes.length === 0) return [];
    const byId = new Map(waterPoints.map((pt) => [pt.id, pt]));
    const cycleSec = 24;
    return tankerRoutes
      .map((route, idx) => {
        const baseFraction = ((animTime / cycleSec) + idx * 0.34) % 1;
        const progressFraction = 0.08 + 0.84 * baseFraction;
        const sample = getRouteSamplePoint(route.path, progressFraction);
        const facility = byId.get(route.id);
        if (!sample || !facility) return null;
        return {
          id: `TANKER-${route.id}`,
          lng: sample.lng,
          lat: sample.lat,
          bearingDeg: sample.bearingDeg,
          elevation_m: facility.elevation_m,
          facility,
        };
      })
      .filter(Boolean);
  }, [show3DModels, showTankerRoutes, tankerRoutes, waterPoints, animTime]);

  const tankerScenegraphLayer = useMemo(() => {
    if (!glbModelsReady || !show3DModels || !showTankerRoutes || tankerUnitsMemo.length === 0) {
      return null;
    }
    return new ScenegraphLayer({
      id: 'bicol-water-tanker-dispatch-glb',
      slot: 'top',
      visible: show3DModels && showTankerRoutes && tankerUnitsMemo.length > 0,
      data: tankerUnitsMemo,
      scenegraph: TANKER_MODEL_PATH,
      getPosition: (d) => getGroundPosition(d.lng, d.lat, d.elevation_m, 0),
      getOrientation: (d) => [0, 180 - d.bearingDeg, 90],
      sizeScale: 16,
      sizeMinPixels: 28,
      sizeMaxPixels: 140,
      _lighting: 'pbr',
      pickable: true,
      onClick: handleFacilityPick,
      updateTriggers: {
        getPosition: [terrainSyncTick, animTime],
        getOrientation: [animTime],
      },
    });
  }, [
    glbModelsReady,
    show3DModels,
    showTankerRoutes,
    tankerUnitsMemo,
    terrainSyncTick,
    animTime,
    getGroundPosition,
    handleFacilityPick,
  ]);

  const sonarInnerPulseLayer = useMemo(() => {
    const pulseWave = (Math.sin(animTime * 3.2) + 1) * 0.5;
    return new ScatterplotLayer({
      id: 'bicol-water-sonar-inner-pulse',
      slot: 'top',
      data: waterPoints,
      getPosition: (d) => {
        const ov = envData?.facilityOverrides?.[d.id];
        return getGroundPosition(ov ? ov.lng : d.lng, ov ? ov.lat : d.lat, d.elevation_m, 0.35);
      },
      getRadius: (d) => {
        const ov = envData?.facilityOverrides?.[d.id];
        if (ov) return (ov.radiusM || 11.5) + 6 * pulseWave;
        const isSelected = activeMapNodeId === d.id;
        const base = d.wvi_score >= 65 ? 48 : d.wvi_score >= 35 ? 42 : 36;
        const amp = d.wvi_score >= 65 ? 36 : d.wvi_score >= 35 ? 26 : 18;
        return (isSelected ? base + 12 : base) + amp * pulseWave;
      },
      radiusUnits: 'meters',
      radiusMinPixels: 7,
      getFillColor: (d) => {
        const alpha = Math.round((d.wvi_score >= 65 ? 88 : 56) * (1 - 0.55 * pulseWave));
        return [...getStatusRgb(d.wvi_score), alpha];
      },
      stroked: true,
      getLineColor: (d) => {
        const alpha = Math.round(235 - 105 * pulseWave);
        return [...getStatusRgb(d.wvi_score), alpha];
      },
      lineWidthMinPixels: 2,
      lineWidthUnits: 'pixels',
      pickable: true,
      onClick: handleFacilityPick,
      updateTriggers: {
        getPosition: [terrainSyncTick, envData],
        getRadius: [animTime, activeMapNodeId, waterPoints, envData],
        getFillColor: [animTime, waterPoints],
        getLineColor: [animTime, waterPoints],
      },
    });
  }, [
    waterPoints,
    envData,
    activeMapNodeId,
    animTime,
    terrainSyncTick,
    getGroundPosition,
    handleFacilityPick,
  ]);

  const layers = useMemo(
    () => [
      ...staticLayers,
      ...contactShadowLayers,
      ...environment3DLayers,
      sonarInnerPulseLayer,
      ...(tankerScenegraphLayer ? [tankerScenegraphLayer] : []),
    ],
    [staticLayers, contactShadowLayers, environment3DLayers, sonarInnerPulseLayer, tankerScenegraphLayer]
  );

  useEffect(() => {
  overlay.setProps({ layers, effects: [lightingEffect] });
}, [overlay, layers, lightingEffect]);

  return null;
});

const BicolMap3D = React.memo(function BicolMap3D({
  waterPoints = INITIAL_NAGA_POINTS,
  barangaysData = [],
  evacuationCamps = INITIAL_EVACUATION_CAMPS_FALLBACK,
  showFloodLayer = false,
  showTankerRoutes = false,
  showLabels = true,
  activeMapNode = null,
  onNodeSelect,
  cameraCommand = null,
  isLeftDrawerOpen = false,
  isRightDockOpen = false,
}) {
  const mapRef = useRef(null);
  const routeCacheRef = useRef(new Map());
  const [glbModelsReady, setGlbModelsReady] = useState(false);
  const [buildingGlbReady, setBuildingGlbReady] = useState(false);
  const [shophouseFit, setShophouseFit] = useState({
    scaleMult: [1, 1, 1],
    baseLiftUnits: 0,
    centerOffset: [0, 0],
  });
  const [tankerRoutes, setTankerRoutes] = useState([]);
  const [hoveringBarangay, setHoveringBarangay] = useState(false);
  const [show3DModels, setShow3DModels] = useState((INITIAL_VIEW_STATE.zoom ?? 14.2) >= SHOW_3D_MODELS_MIN_ZOOM);
  const [showCivicHallModels, setShowCivicHallModels] = useState(
    (INITIAL_VIEW_STATE.zoom ?? 14.2) >= CIVIC_HALL_MIN_ZOOM
  );
  const [hideWhiteExtrusions, setHideWhiteExtrusions] = useState(false);
  const [viewportSnapshot, setViewportSnapshot] = useState(() => ({
    zoom: INITIAL_VIEW_STATE.zoom ?? 13.68,
    centerLat: INITIAL_VIEW_STATE.latitude,
    centerLng: INITIAL_VIEW_STATE.longitude,
    bounds: null,
  }));
  const lastViewportSyncMsRef = useRef(0);
  const [terrainSyncTick, setTerrainSyncTick] = useState(0);
  const terrainElevationCacheRef = useRef(new Map());
  const terrainProbesRef = useRef([]);
  const terrainIdleBoundRef = useRef(false);
  const [envCatalog, setEnvCatalog] = useState(null);

    const [timeOfDayMinutes, setTimeOfDayMinutes] = useState(720);
  const [isTimePlaying, setIsTimePlaying] = useState(false);
  const [cycleDurationMins, setCycleDurationMins] = useState(5);
  const [activeHudPanel, setActiveHudPanel] = useState(null); // null | 'LEGEND' | 'SOLAR' | 'DISPATCH'
  const [selectedTankerRouteId, setSelectedTankerRouteId] = useState(null);

  const isGlobeZoom = (viewportSnapshot?.zoom ?? 13.68) < 9.5;

  useEffect(() => {
    if (isGlobeZoom) {
      setActiveHudPanel((prev) => (prev === 'DISPATCH' ? null : prev));
      return;
    }
    if (activeMapNode && !activeMapNode.isBarangay) {
      const matching = tankerRoutes.find((r) => r.id === activeMapNode.id);
      if (matching) {
        setSelectedTankerRouteId(matching.id);
        setActiveHudPanel('DISPATCH');
      }
    }
  }, [activeMapNode, tankerRoutes, isGlobeZoom]);

  const solarState = useMemo(() => computeSolarState(timeOfDayMinutes), [timeOfDayMinutes]);
  const solarStateRef = useRef(solarState);
  solarStateRef.current = solarState;
  const solarLightPreset = getMapboxLightPreset(solarState.minutes);
  const solarBasemapPalette = useMemo(() => computeSolarBasemapPalette(solarState), [solarState]);
  const solarFog = solarBasemapPalette.fog;
  const mapBasemapConfig = useMemo(
    () => ({
      basemap: {
        show3dObjects: false,
        show3dBuildings: false,
        showPointOfInterestLabels: false,
        showRoadLabels: true,
        showPlaceLabels: true,
        showTransitLabels: true,
        showRoadsAndTransit: true,
        showPedestrianRoads: false,
        showHdRoads: false,
        theme: 'default',
        lightPreset: solarBasemapPalette.lightPreset,
        colorLand: solarBasemapPalette.colorLand,
        colorGreenspace: solarBasemapPalette.colorGreenspace,
        colorBuildings: solarBasemapPalette.colorLand,
        colorCommercial: solarBasemapPalette.colorLand,
        colorEducation: solarBasemapPalette.colorLand,
        colorMedical: solarBasemapPalette.colorLand,
        colorIndustrial: solarBasemapPalette.colorLand,
        colorWater: solarBasemapPalette.colorWater,
        colorRoads: solarBasemapPalette.colorRoads,
        colorTrunks: solarBasemapPalette.colorTrunks,
        colorMotorways: solarBasemapPalette.colorMotorways,
      },
    }),
    [solarBasemapPalette]
  );

  useEffect(() => {
    if (!isTimePlaying) return undefined;
    let frameId = 0;
    let lastMs = performance.now();
    const simMinsPerRealMs = 1440 / (cycleDurationMins * 60 * 1000);

    const step = (now) => {
      const dt = now - lastMs;
      if (dt >= 32) {
        lastMs = now;
        setTimeOfDayMinutes((prev) => (prev + dt * simMinsPerRealMs) % 1440);
      }
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [isTimePlaying, cycleDurationMins]);

  useEffect(() => {
    let cancelled = false;
    loadEnvironmentGlbCatalog()
      .then((catalog) => {
        if (!cancelled) setEnvCatalog(catalog);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

  const activeBarangayName = activeMapNode?.isBarangay ? activeMapNode.barangay : null;
  const showBarangayBuildings = Boolean(activeBarangayName);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    applyMapboxStandardConfig(map, show3DModels, solarStateRef.current);
  }, [show3DModels]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map) return;

    if (activeBarangayName) {
      map.setMinZoom?.(BARANGAY_INSPECT_MIN_ZOOM);
      map.setMaxZoom?.(19.5);
      setHideWhiteExtrusions(true);
    } else {
      map.setMinZoom?.(0);
      map.setMaxZoom?.(DEFAULT_MAX_ZOOM);
      const z = map.getZoom?.() ?? INITIAL_VIEW_STATE.zoom;
      setHideWhiteExtrusions(z >= WHITE_EXTRUSION_HIDE_ZOOM);
    }
  }, [activeBarangayName]);

  useEffect(() => {
    let cancelled = false;
    const checkHead = (assetUrl) =>
      fetch(assetUrl, { method: 'HEAD' }).then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && !ct.includes('text/html');
      });

    Promise.all(['/models/hand_pump.glb', '/models/water_tank_1.glb'].map(checkHead))
      .then((results) => {
        if (!cancelled && results.every(Boolean)) {
          setGlbModelsReady(true);
        }
      })
      .catch(() => {});

    Promise.all(
      BUILDING_ARCHETYPE_CONFIGS.map((cfg) =>
        checkHead(cfg.key === 'shophouse_commercial' ? SHOPHOUSE_MODEL_URL : cfg.url)
      )
    )
      .then((results) => {
        if (!cancelled && results.every(Boolean)) {
          setBuildingGlbReady(true);
          inspectGlbFitMetrics(SHOPHOUSE_MODEL_URL, [12.5, 11.4, 13.5])
            .then((metrics) => {
              if (!cancelled) setShophouseFit(metrics);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showTankerRoutes) {
      setTankerRoutes([]);
      return;
    }

    let cancelled = false;
    const critical = waterPoints.filter((pt) => pt.wvi_score >= 65 || pt.tanker_dispatched);

    async function loadRoutes() {
      const resolved = await Promise.all(
        critical.map(async (pt) => {
          const cacheKey = `${pt.id}:${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
          if (routeCacheRef.current.has(cacheKey)) {
            return routeCacheRef.current.get(cacheKey);
          }

          let path = null;
          let distanceKm = null;
          let durationMin = null;
          let source = 'street_grid';

          const curated = TANKER_ROUTES[pt.id];
          if (curated?.length >= 2) {
            path = curated.map(([lat, lng]) => [lng, lat]);
            distanceKm = Number(haversineKm(path).toFixed(2));
            durationMin = Math.max(2, Math.round((distanceKm / 26) * 60));
          }

          if (!path && mapboxToken) {
            try {
              const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${CDRRMO_HUB.lng},${CDRRMO_HUB.lat};${pt.lng},${pt.lat}?geometries=geojson&overview=full&access_token=${encodeURIComponent(
                mapboxToken
              )}`;
              const res = await fetch(url);
              if (res.ok) {
                const json = await res.json();
                const route = json?.routes?.[0];
                if (route?.geometry?.coordinates?.length >= 2) {
                  path = route.geometry.coordinates;
                  distanceKm = Number((route.distance / 1000).toFixed(2));
                  durationMin = Math.max(1, Math.round(route.duration / 60));
                  source = 'mapbox_directions';
                }
              }
            } catch {
              // Offline or rate-limited: fall back to local Dijkstra road network
            }
          }

          if (!path) {
            const fallback = getShortestRoadRouteCoords(pt.id) || [];
            path = fallback.map(([lat, lng]) => [lng, lat]);
            distanceKm = Number(haversineKm(path).toFixed(2));
            durationMin = Math.max(2, Math.round((distanceKm / 28) * 60));
            source = 'local_dijkstra';
          }

          const entry = {
            id: pt.id,
            name: pt.name,
            barangay: pt.barangay,
            path,
            distanceKm,
            durationMin,
            source,
          };
          routeCacheRef.current.set(cacheKey, entry);
          return entry;
        })
      );

      if (!cancelled) {
        setTankerRoutes(resolved.filter((r) => r.path && r.path.length >= 2));
      }
    }

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [waterPoints, showTankerRoutes, mapboxToken]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map || !cameraCommand) return;

    if (cameraCommand.action === 'ZOOM_IN') {
      map.zoomIn({ duration: 350 });
    } else if (cameraCommand.action === 'ZOOM_OUT') {
      map.zoomOut({ duration: 350 });
    } else if (cameraCommand.action === 'RESET') {
      map.setMinZoom?.(0);
      map.setMaxZoom?.(DEFAULT_MAX_ZOOM);
      map.setProjection?.('globe');
      map.flyTo({
        center: [123.1817, 13.6218],
        zoom: 1.55,
        pitch: 15,
        bearing: 0,
        duration: prefersReducedMotion() ? 0 : 1800,
        essential: true,
      });
    } else if (cameraCommand.action === 'OVERVIEW') {
      map.setMinZoom?.(DEFAULT_MIN_ZOOM);
      map.setMaxZoom?.(DEFAULT_MAX_ZOOM);
      map.flyTo({
        center: [123.185, 13.621],
        zoom: 12.6,
        pitch: 54,
        bearing: -18,
        duration: prefersReducedMotion() ? 0 : 1800,
        essential: true,
      });
    }
  }, [cameraCommand]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map || !activeMapNode || activeMapNode.lng == null || activeMapNode.lat == null) return;

    const dur = prefersReducedMotion() ? 0 : 1100;
    if (activeMapNode.isBarangay) {
      map.setMinZoom?.(DEFAULT_MIN_ZOOM);
      map.setMaxZoom?.(DEFAULT_MAX_ZOOM);
      map.flyTo({
        center: [activeMapNode.lng, activeMapNode.lat],
        zoom: BARANGAY_INSPECT_ZOOM,
        pitch: BARANGAY_INSPECT_PITCH,
        duration: dur,
        essential: true,
      });
    } else {
      map.flyTo({
        center: [activeMapNode.lng, activeMapNode.lat],
        zoom: Math.max(map.getZoom?.() ?? 14.5, 16.2),
        pitch: 62,
        duration: dur,
        essential: true,
      });
    }
  }, [activeMapNode]);

  const barangayGeoJson = useMemo(
    () => buildBarangayChoroplethGeoJson(waterPoints, barangaysData),
    [waterPoints, barangaysData]
  );

  const selectedBarangayGeometry = useMemo(() => {
    if (!activeBarangayName) return null;
    const targetNorm = normalizeBarangayName(activeBarangayName);
    const match = (barangayGeoJson?.features || []).find(
      (f) => normalizeBarangayName(f?.properties?.name) === targetNorm
    );
    return match?.geometry || null;
  }, [barangayGeoJson, activeBarangayName]);

  const tankerGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: tankerRoutes.map((r) => ({
        type: 'Feature',
        properties: { id: r.id, name: r.name },
        geometry: { type: 'LineString', coordinates: r.path },
      })),
    }),
    [tankerRoutes]
  );

  const selectedBarangayId = activeMapNode?.isBarangay ? activeMapNode.id : '';
  
  const getGroundPosition = useCallback((lng, lat, _fallbackElevM = 0, offsetM = 0) => {
    return [lng, lat, offsetM];
  }, []);


  const syncLoadedTerrainElevations = useCallback((mapInstance) => {
    const map = mapInstance || mapRef.current?.getMap?.() || mapRef.current;
    if (!map || typeof map.queryTerrainElevation !== 'function') return;
    const probes = terrainProbesRef.current;
    let changed = false;

    for (let i = 0; i < probes.length; i++) {
      const p = probes[i];
      if (p?.lat == null || p?.lng == null) continue;

      const sampleCoords = [[p.lng, p.lat]];
      if (Array.isArray(p.lotRing)) {
        for (let c = 0; c < Math.min(4, p.lotRing.length); c++) {
          sampleCoords.push(p.lotRing[c]);
        }
      }

      let maxQueried = -Infinity;
      for (let s = 0; s < sampleCoords.length; s++) {
        const q = map.queryTerrainElevation(sampleCoords[s], { exaggerated: true });
        if (typeof q === 'number' && Number.isFinite(q) && q > maxQueried) {
          maxQueried = q;
        }
      }

      if (Number.isFinite(maxQueried)) {
        const cacheKey = `${Number(p.lng).toFixed(5)},${Number(p.lat).toFixed(5)}`;
        const prev = terrainElevationCacheRef.current.get(cacheKey);
        if (prev === undefined || maxQueried > prev + 0.08) {
          terrainElevationCacheRef.current.set(cacheKey, maxQueried);
          changed = true;
        }
      }
    }
    if (changed) {
      setTerrainSyncTick((t) => t + 1);
    }
  }, []);

  const handleFacilityPick = useCallback(
    ({ object }) => {
      if (!object || !onNodeSelect) return;
      const facility = object.facility || object;
      const haz = getFacilityHazardCrossRef(facility.lat, facility.lng, facility.barangay);
      onNodeSelect({ ...facility, hazardZone: haz });
    },
    [onNodeSelect]
  );

  const facilitiesByModelKey = useMemo(() => {
    const grouped = new Map(FACILITY_MODEL_CONFIGS.map((cfg) => [cfg.key, []]));
    for (const pt of waterPoints) {
      const key = getFacilityModelKey(pt);
      grouped.get(key)?.push(pt);
    }
    return grouped;
  }, [waterPoints]);

  const whiteClayBuildingsGeoJson = useMemo(
    () => buildWhiteClayBuildingsGeoJson(waterPoints),
    [waterPoints]
  );

  const syncViewportSnapshot = useCallback((mapInstance, force = false) => {
    const map = mapInstance || mapRef.current?.getMap?.() || mapRef.current;
    if (!map || typeof map.getZoom !== 'function') return;
    const zoom = Number(map.getZoom()) || 0;
    const now = performance.now();
    if (!force && now - lastViewportSyncMsRef.current < 120) return;
    lastViewportSyncMsRef.current = now;

    const center = map.getCenter?.();
    const rawB = map.getBounds?.();
    const nextBounds = rawB
      ? {
          north: Number(rawB.getNorth().toFixed(5)),
          south: Number(rawB.getSouth().toFixed(5)),
          east: Number(rawB.getEast().toFixed(5)),
          west: Number(rawB.getWest().toFixed(5)),
        }
      : null;
    const nextLat = Number((center?.lat ?? INITIAL_VIEW_STATE.latitude).toFixed(5));
    const nextLng = Number((center?.lng ?? INITIAL_VIEW_STATE.longitude).toFixed(5));

    setViewportSnapshot((prev) => {
      const zDiff = Math.abs(prev.zoom - zoom);
      const cDiff = Math.max(Math.abs(prev.centerLat - nextLat), Math.abs(prev.centerLng - nextLng));
      const boundsChanged =
        (!prev.bounds && Boolean(nextBounds)) ||
        (prev.bounds &&
          nextBounds &&
          Math.max(
            Math.abs(prev.bounds.north - nextBounds.north),
            Math.abs(prev.bounds.south - nextBounds.south),
            Math.abs(prev.bounds.east - nextBounds.east),
            Math.abs(prev.bounds.west - nextBounds.west)
          ) > 0.00015);
      if (!boundsChanged && zDiff < (force ? 0.01 : 0.06) && cDiff < (force ? 0.00005 : 0.00025)) {
        return prev;
      }
      return {
        zoom,
        centerLat: nextLat,
        centerLng: nextLng,
        bounds: nextBounds,
      };
    });
  }, []);

  const cityBuildingPool = useMemo(
    () => buildCityBuildingPool(waterPoints, evacuationCamps),
    [waterPoints, evacuationCamps]
  );

  const viewportBuildings = useMemo(() => {
    if (!activeBarangayName) {
      const overviewSelection = selectViewportCityBuildings(
        cityBuildingPool,
        viewportSnapshot,
        MAX_VIEWPORT_BUILDINGS
      );
      return {
        civicHalls: overviewSelection.civicHalls,
        evacHalls: overviewSelection.evacHalls,
        byArchetype: {
          house_residential: [],
          shophouse_commercial: [],
          midrise_building: [],
        },
      };
    }

    return {
      civicHalls: cityBuildingPool.evacHalls || [],
      evacHalls: cityBuildingPool.evacHalls || [],
      byArchetype: {
        house_residential: [],
        shophouse_commercial: [],
        midrise_building: [],
      },
    };
  }, [activeBarangayName, cityBuildingPool, viewportSnapshot]);

  const simCityLotGeoJson = useMemo(
    () => buildSimCityLotGeoJson(viewportBuildings),
    [viewportBuildings]
  );

  const streetSiteKey = [
    ...waterPoints.map((p) => `${p.id}:${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`),
    ...(cityBuildingPool.evacHalls || []).map((c) => `${c.id}:${Number(c.lat).toFixed(5)},${Number(c.lng).toFixed(5)}`),
  ].join('|');

    const envData = useMemo(() => {
    if (!activeBarangayName || !selectedBarangayGeometry) return null;
    if (STREETSCAPE_BARANGAYS && !STREETSCAPE_BARANGAYS.includes(normalizeBarangayName(activeBarangayName))) {
      return null;
    }
    return buildBarangayEnvironment({
      barangayName: activeBarangayName,
      barangayGeometry: selectedBarangayGeometry,
      buildings: [],
      waterPoints,
      evacHalls: cityBuildingPool.evacHalls || [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBarangayName, selectedBarangayGeometry, streetSiteKey]);
  const hasEnvData = Boolean(envData);

    const dynamicBuildingShadowsGeoJson = useMemo(() => {
    const footprints = envData?.buildingShadowFootprints || [];
    if (footprints.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const cosLat = Math.cos((13.621 * Math.PI) / 180);
    const mPerDegLng = 111320 * cosLat;
    const mPerDegLat = 110636;
    const makeRect = (lng, lat, ux, uy, nx, ny, halfLenM, halfWidthM) => {
      const pt = (along, perp) => [
        Number((lng + (ux * along + nx * perp) / mPerDegLng).toFixed(6)),
        Number((lat + (uy * along + ny * perp) / mPerDegLat).toFixed(6)),
      ];
      return [
        pt(-halfLenM, halfWidthM),
        pt(halfLenM, halfWidthM),
        pt(halfLenM, -halfWidthM),
        pt(-halfLenM, -halfWidthM),
        pt(-halfLenM, halfWidthM),
      ];
    };

    const features = [];
    for (const fp of footprints) {
      const rad = ((fp.bearingDeg || 0) * Math.PI) / 180;
      const ux = Math.sin(rad);
      const uy = Math.cos(rad);
      const nx = -uy;
      const ny = ux;
      const hScale = (fp.heightM || 28) / 28;
      const sLng = fp.lng + (solarState.shadowOffsetEastM * hScale) / mPerDegLng;
      const sLat = fp.lat + (solarState.shadowOffsetNorthM * hScale) / mPerDegLat;
      const pad = 1.8 * solarState.shadowLenFactor;

      features.push(
        {
          type: 'Feature',
          properties: { kind: 'building_shadow_outer' },
          geometry: {
            type: 'Polygon',
            coordinates: [makeRect(sLng, sLat, ux, uy, nx, ny, fp.halfD + 4.5 + pad, fp.halfW + 4.5 + pad)],
          },
        },
        {
          type: 'Feature',
          properties: { kind: 'building_shadow_core' },
          geometry: {
            type: 'Polygon',
            coordinates: [makeRect(sLng, sLat, ux, uy, nx, ny, fp.halfD + 1.2 + pad * 0.5, fp.halfW + 1.2 + pad * 0.5)],
          },
        }
      );
    }
    return { type: 'FeatureCollection', features };
  }, [envData?.buildingShadowFootprints, solarState.shadowOffsetEastM, solarState.shadowOffsetNorthM, solarState.shadowLenFactor]);



  useEffect(() => {
    terrainProbesRef.current = [
      ...viewportBuildings.civicHalls,
      ...waterPoints,
      ...(envData?.probes || []),
    ];
    syncLoadedTerrainElevations();
  }, [viewportBuildings, waterPoints, envData, syncLoadedTerrainElevations]);

  useEffect(() => {
    if (showBarangayBuildings || showCivicHallModels) {
      syncLoadedTerrainElevations();
    }
  }, [showBarangayBuildings, showCivicHallModels, syncLoadedTerrainElevations]);

  const facilityScenegraphLayers = useMemo(() => {
    if (!glbModelsReady || !show3DModels) return [];
    return FACILITY_MODEL_CONFIGS.map((cfg) => {
      const groupData = facilitiesByModelKey.get(cfg.key) || [];
      if (groupData.length === 0) return null;
      return new ScenegraphLayer({
        id: `bicol-water-facility-${cfg.key}`,
        slot: 'top',
        visible: show3DModels && groupData.length > 0,
        data: groupData,
        scenegraph: cfg.url,
        getPosition: (d) => {
          const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
          return getGroundPosition(ov ? ov.lng : d.lng, ov ? ov.lat : d.lat, d.elevation_m, 0);
        },
        getOrientation: (d) => {
          const placement = getWaterFacilityPlacement(d);
          const yawDeg = ((placement?.rot ?? 0) * 180) / Math.PI;
          return [0, yawDeg, 90];
        },
        getScale: (d) => {
          const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
          const sc = ov ? ov.scaleMult : 1;
          return [sc, sc, sc];
        },
        sizeScale: cfg.sizeScale,
        sizeMinPixels: showBarangayBuildings ? 16 : 44,
        sizeMaxPixels: showBarangayBuildings ? 140 : 260,
        _lighting: 'pbr',
        pickable: true,
        onClick: handleFacilityPick,
        updateTriggers: {
          getPosition: [terrainSyncTick, showBarangayBuildings, envData],
          getScale: [showBarangayBuildings, envData],
        },
      });
    }).filter(Boolean);
  }, [
    glbModelsReady,
    show3DModels,
    showBarangayBuildings,
    envData,
    facilitiesByModelKey,
    terrainSyncTick,
    getGroundPosition,
    handleFacilityPick,
  ]);

  const buildingScenegraphLayers = useMemo(() => {
    if (!buildingGlbReady) return [];
    return BUILDING_ARCHETYPE_CONFIGS.map((cfg) => {
      const layerData =
        cfg.key === 'civic_hall'
          ? viewportBuildings.civicHalls
          : viewportBuildings.byArchetype[cfg.key] || [];
      const isVisible =
        cfg.key === 'civic_hall'
          ? showCivicHallModels && layerData.length > 0
          : showBarangayBuildings && layerData.length > 0;
      if (!isVisible) return null;

      const isShophouse = cfg.key === 'shophouse_commercial';
      const resolvedUrl = isShophouse ? SHOPHOUSE_MODEL_URL : cfg.url;
      const groundClearanceM = cfg.key === 'civic_hall' ? 0 : hasEnvData ? 0.25 : 0.45;

      return new ScenegraphLayer({
        id: `bicol-city-building-${cfg.key}`,
        slot: 'top',
        visible: isVisible,
        data: layerData,
        scenegraph: resolvedUrl,
        getPosition: (d) => {
          if (!isShophouse) {
            return getGroundPosition(d.lng, d.lat, d.elevation_m, groundClearanceM);
          }
          const sx = d.scaleVec?.[0] ?? 7.0;
          const sy = d.scaleVec?.[1] ?? 7.2;
          const sz = d.scaleVec?.[2] ?? 7.0;
          const liftM = shophouseFit.baseLiftUnits * sy;

          const cxM = (shophouseFit.centerOffset?.[0] ?? 0) * sx;
          const czM = (shophouseFit.centerOffset?.[1] ?? 0) * sz;
          const yawRad = ((d.yawDeg ?? 0) * Math.PI) / 180;
          const cosY = Math.cos(yawRad);
          const sinY = Math.sin(yawRad);
          const worldCenterEastM = cxM * cosY + czM * sinY;
          const worldCenterNorthM = cxM * sinY - czM * cosY;

          const adjLng = d.lng - worldCenterEastM / (111320 * Math.cos((d.lat * Math.PI) / 180));
          const adjLat = d.lat - worldCenterNorthM / 110636;
          return getGroundPosition(adjLng, adjLat, d.elevation_m, groundClearanceM + liftM);
        },
        getOrientation: (d) => [0, d.yawDeg ?? 0, 90],
        getScale: (d) => {
          const base = d.scaleVec || cfg.getScale;
          if (!isShophouse) {
            return [base[0] * 1.15, base[1] * 1.15, base[2] * 1.15];
          }
          return [
            base[0] * shophouseFit.scaleMult[0],
            base[1] * shophouseFit.scaleMult[1],
            base[2] * shophouseFit.scaleMult[2],
          ];
        },
        getTranslation: [0, 0, cfg.zOffset],
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: false,
        updateTriggers: {
          getPosition: [terrainSyncTick, viewportBuildings, shophouseFit, hasEnvData],
          getOrientation: [viewportBuildings],
          getScale: [viewportBuildings, shophouseFit],
        },
      });
    }).filter(Boolean);
  }, [
    buildingGlbReady,
    shophouseFit,
    viewportBuildings,
    showCivicHallModels,
    showBarangayBuildings,
    hasEnvData,
    terrainSyncTick,
    getGroundPosition,
  ]);

  const beaconAndBaseLayers = useMemo(
    () => [
      new ScatterplotLayer({
        id: 'bicol-water-facilities-base-pads',
        slot: 'top',
        data: waterPoints,
        getPosition: (d) => {
          const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
          return getGroundPosition(ov ? ov.lng : d.lng, ov ? ov.lat : d.lat, d.elevation_m, 0.45);
        },
        getRadius: (d) => {
          const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
          if (ov) return ov.radiusM || 11.5;
          return activeMapNode?.id === d.id ? 26 : 22;
        },
        radiusUnits: 'meters',
        radiusMinPixels: 5,
        getFillColor: (d) => [...getStatusRgb(d.wvi_score), 190],
        stroked: true,
        getLineColor: [255, 255, 255, 240],
        lineWidthMinPixels: 1.5,
        pickable: true,
        onClick: handleFacilityPick,
        updateTriggers: {
          getPosition: [terrainSyncTick, showBarangayBuildings, envData],
          getRadius: [activeMapNode?.id, showBarangayBuildings, envData],
          getFillColor: [waterPoints],
        },
      }),
      new ColumnLayer({
        id: 'bicol-water-facilities-beacons',
        slot: 'top',
        visible: !show3DModels || !glbModelsReady,
        data: waterPoints,
        diskResolution: 12,
        radius: 20,
        extruded: true,
        elevationScale: 1,
        getPosition: (d) => getGroundPosition(d.lng, d.lat, d.elevation_m, 0),
        getElevation: (d) => {
          const base = d.wvi_score >= 65 ? 58 : d.wvi_score >= 35 ? 42 : 28;
          return activeMapNode?.id === d.id ? base + 18 : base;
        },
        getFillColor: (d) => [...getStatusRgb(d.wvi_score), 220],
        getLineColor: [255, 255, 255, 220],
        stroked: true,
        lineWidthMinPixels: 1.5,
        pickable: true,
        onClick: handleFacilityPick,
        updateTriggers: {
          getPosition: [terrainSyncTick],
          getElevation: [activeMapNode?.id, waterPoints],
          getFillColor: [waterPoints],
        },
      }),
    ],
    [
      waterPoints,
      activeMapNode?.id,
      show3DModels,
      showBarangayBuildings,
      envData,
      glbModelsReady,
      terrainSyncTick,
      getGroundPosition,
      handleFacilityPick,
    ]
  );

  const staticDeckLayers = useMemo(() => {
    const sonarOuterDiscLayer = new ScatterplotLayer({
      id: 'bicol-water-sonar-outer-disc',
      slot: 'top',
      data: waterPoints,
      getPosition: (d) => {
        const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
        return getGroundPosition(ov ? ov.lng : d.lng, ov ? ov.lat : d.lat, d.elevation_m, 0.25);
      },
      getRadius: (d) => {
        const ov = showBarangayBuildings ? envData?.facilityOverrides?.[d.id] : null;
        if (ov) return (ov.radiusM || 11.5) * 2.1;
        return activeMapNode?.id === d.id ? 225 : 195;
      },
      radiusUnits: 'meters',
      radiusMinPixels: 18,
      filled: true,
      stroked: false,
      getFillColor: (d) => [...getStatusRgb(d.wvi_score), 34],
      pickable: false,
      updateTriggers: {
        getPosition: [terrainSyncTick],
        getRadius: [activeMapNode?.id],
        getFillColor: [waterPoints],
      },
    });

    const sonarMiddleRingLayer = new ScatterplotLayer({
      id: 'bicol-water-sonar-mid-ring',
      slot: 'top',
      data: waterPoints,
      getPosition: (d) => getGroundPosition(d.lng, d.lat, d.elevation_m, 0.30),
      getRadius: (d) => (activeMapNode?.id === d.id ? 150 : 132),
      radiusUnits: 'meters',
      radiusMinPixels: 12,
      filled: false,
      stroked: true,
      getLineColor: (d) => [...getStatusRgb(d.wvi_score), 178],
      lineWidthMinPixels: 2,
      lineWidthUnits: 'pixels',
      pickable: false,
      updateTriggers: {
        getPosition: [terrainSyncTick],
        getRadius: [activeMapNode?.id],
        getLineColor: [waterPoints],
      },
    });

    return [
      sonarOuterDiscLayer,
      sonarMiddleRingLayer,
      ...beaconAndBaseLayers,
      ...buildingScenegraphLayers,
      ...facilityScenegraphLayers,
    ];
  }, [
    waterPoints,
    activeMapNode?.id,
    terrainSyncTick,
    getGroundPosition,
    beaconAndBaseLayers,
    buildingScenegraphLayers,
    facilityScenegraphLayers,
  ]);

  const syncZoomLodState = useCallback(
    (zoomValue) => {
      const zoom = Number(zoomValue) || 0;
      const nextModels = zoom >= SHOW_3D_MODELS_MIN_ZOOM;
      const nextCivic = zoom >= CIVIC_HALL_MIN_ZOOM;
      const nextHideExtrusions = showBarangayBuildings || zoom >= WHITE_EXTRUSION_HIDE_ZOOM;
      setShow3DModels((prev) => (prev === nextModels ? prev : nextModels));
      setShowCivicHallModels((prev) => (prev === nextCivic ? prev : nextCivic));
      setHideWhiteExtrusions((prev) => (prev === nextHideExtrusions ? prev : nextHideExtrusions));
    },
    [showBarangayBuildings]
  );
  const hasAutoFlownRef = useRef(false);


  /* Sync whole-map basemap & fog with Solar Cycle */
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (map) {
      applyMapboxStandardConfig(map, show3DModels, solarState);
    }
  }, [solarState, show3DModels]);

  const handleMapLoad = useCallback(
    (evt) => {
        const mapInstance = mapRef.current?.getMap?.();
  if (mapInstance) {
    try {
      mapInstance.setConfigProperty('basemap', 'show3dObjects', false);
      mapInstance.setConfigProperty('basemap', 'show3dBuildings', false);
    } catch {}

    if (!hasAutoFlownRef.current) {
      hasAutoFlownRef.current = true;
      mapInstance.flyTo({
        center: [123.185, 13.621],
        zoom: 12.6,
        pitch: 52,
        bearing: -18,
        duration: 2400,
        essential: true,
      });
    }
  }
s
      const map = evt?.target || mapRef.current?.getMap?.() || mapRef.current;
      if (!map) return;
      applyMapboxStandardConfig(map, undefined, solarStateRef.current);
      if (typeof map.getZoom === 'function') {
        syncZoomLodState(map.getZoom());
      }
      if (!terrainIdleBoundRef.current && typeof map.on === 'function') {
        terrainIdleBoundRef.current = true;
        map.on('idle', () => {
          syncViewportSnapshot(map, true);
          syncLoadedTerrainElevations(map);
        });
      }
      setTerrainSyncTick((t) => t + 1);
      syncViewportSnapshot(map, true);
      syncLoadedTerrainElevations(map);
    },
    [syncZoomLodState, syncViewportSnapshot, syncLoadedTerrainElevations]
  );

  const handleMapStyleData = useCallback((evt) => {
       const mapInstance = mapRef.current?.getMap?.();
    try {
      mapInstance?.setConfigProperty('basemap', 'show3dObjects', false);
      mapInstance?.setConfigProperty('basemap', 'show3dBuildings', false);
    } catch {}
    const map = evt?.target || mapRef.current?.getMap?.() || mapRef.current;
    if (map) applyMapboxStandardConfig(map, undefined, solarStateRef.current);
  }, []);

  const handleMapMove = useCallback(
    (evt) => {
      syncZoomLodState(evt?.viewState?.zoom ?? 0);
      syncViewportSnapshot(evt?.target, false);
    },
    [syncZoomLodState, syncViewportSnapshot]
  );

  const handleMapMoveEnd = useCallback(
    (evt) => {
      syncZoomLodState(evt?.viewState?.zoom ?? 0);
      syncViewportSnapshot(evt?.target, true);
      syncLoadedTerrainElevations(evt?.target);
    },
    [syncZoomLodState, syncViewportSnapshot, syncLoadedTerrainElevations]
  );

  const handleMapMouseEnter = useCallback(() => setHoveringBarangay(true), []);
  const handleMapMouseLeave = useCallback(() => setHoveringBarangay(false), []);
  const handleMapClick = useCallback(
    (e) => {
      const feat = e.features?.[0];
      if (feat?.layer?.id === 'bicol-barangays-fill' && feat.properties && onNodeSelect) {
        const p = feat.properties;
        onNodeSelect({
          isBarangay: true,
          id: p.id,
          name: `Brgy. ${p.displayName}`,
          barangay: p.name,
          source_type: 'Barangay Zone',
          data_provenance: 'Naga 27-Brgy GIS',
          wvi_score: Number(p.wvi_score),
          population_served: Number(p.population_exposure),
          flood_tier: p.flood_tier,
          hazard_classification: p.hazard_classification,
          flood_depth: p.flood_depth,
          facility_count: Number(p.facility_count || 0),
          lat: Number(p.lat),
          lng: Number(p.lng),
        });
      }
    },
    [onNodeSelect]
  );

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-100 p-6 text-center">
        <div className="max-w-md rounded-2xl bg-slate-800/90 border border-slate-700 p-5 shadow-xl">
          <p className="text-sm font-semibold text-sky-300">Mapbox Token Required</p>
          <p className="mt-1 text-xs text-slate-300">
            Add <code className="px-1.5 py-0.5 rounded bg-slate-900">VITE_MAPBOX_TOKEN</code> to{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-900">frontend/.env</code> to render the
            3D Naga City Mapbox GL JS v3 terrain.
          </p>
        </div>
      </div>
    );
  }

     const barangayRiskColumnsGeoJson = useMemo(() => {
    const features = barangayGeoJson?.features || [];

    const getCentroid = (ring) => {
      let sumLng = 0;
      let sumLat = 0;
      const n = ring.length > 1 ? ring.length - 1 : ring.length;
      for (let i = 0; i < n; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
      }
      return n > 0 ? [sumLng / n, sumLat / n] : null;
    };

    const scaleRing = (ring, cLng, cLat, scale = 0.92) => {
      const n = ring.length > 1 ? ring.length - 1 : ring.length;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push([
          cLng + (ring[i][0] - cLng) * scale,
          cLat + (ring[i][1] - cLat) * scale,
        ]);
      }
      if (out.length > 0) out.push(out[0]);
      return out;
    };

    const columnFeatures = [];
    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;
      const score = Number(f.properties?.wvi_score ?? 25);

      let scaledGeometry = null;
      if (geom.type === 'Polygon' && geom.coordinates?.[0]?.length >= 4) {
        const centroid = getCentroid(geom.coordinates[0]);
        if (!centroid) continue;
        scaledGeometry = {
          type: 'Polygon',
          coordinates: geom.coordinates.map((r) => scaleRing(r, centroid[0], centroid[1], 0.92)),
        };
      } else if (geom.type === 'MultiPolygon' && geom.coordinates?.length) {
        scaledGeometry = {
          type: 'MultiPolygon',
          coordinates: geom.coordinates.map((poly) => {
            const centroid = poly?.[0]?.length >= 4 ? getCentroid(poly[0]) : null;
            if (!centroid) return poly;
            return poly.map((r) => scaleRing(r, centroid[0], centroid[1], 0.92));
          }),
        };
      }
      if (!scaledGeometry) continue;

      columnFeatures.push({
        type: 'Feature',
        id: f.id,
        properties: {
          ...f.properties,
          wvi_score: score,
          column_height_m: Math.max(120, score * 14),
        },
        geometry: scaledGeometry,
      });
    }

    return { type: 'FeatureCollection', features: columnFeatures };
  }, [barangayGeoJson]);


  return (
    <div className="w-full h-full relative">
            




      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={INITIAL_VIEW_STATE}
        hash={false}
            projection="globe"
        fog={solarFog}
             mapStyle="mapbox://styles/mapbox/standard"
        config={mapBasemapConfig}
        maxPitch={75}
        antialias
        onLoad={handleMapLoad}
        onStyleData={handleMapStyleData}
        onMove={handleMapMove}
        onMoveEnd={handleMapMoveEnd}
        cursor={hoveringBarangay ? 'pointer' : undefined}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        onMouseEnter={handleMapMouseEnter}
        onMouseLeave={handleMapMouseLeave}
        onClick={handleMapClick}
        style={MAP_CONTAINER_STYLE}
      >

      


        {/* Barangay Risk Zones: Toggleable Fill + Subtle Risk Perimeter */}
        <Source id="bicol-barangays-src" type="geojson" data={barangayGeoJson}>
          <Layer
            id="bicol-barangays-fill"
            type="fill"
            slot="middle"
            paint={{
              'fill-color': [
                'step',
                ['get', 'wvi_score'],
                '#16A34A',
                35, '#F5B81B',
                55, '#E88B5A',
                75, '#EF4444',
              ],
              'fill-opacity': showFloodLayer
                ? [
                    'case',
                    ['==', ['get', 'id'], selectedBarangayId],
                    hasEnvData ? 0.10 : 0.34,
                    hasEnvData ? 0.08 : 0.24,
                  ]
                : 0.0,
              'fill-emissive-strength': 0.65,
            }}
          />

          <Layer
            id="bicol-barangays-risk-halo"
            type="line"
            slot="middle"
            paint={{
              'line-color': [
                'step',
                ['get', 'wvi_score'],
                '#10B981',
                35, '#F59E0B',
                65, '#EF4444',
              ],
              'line-width': [
                'case',
                ['==', ['get', 'id'], selectedBarangayId],
                8,
                showFloodLayer ? 0 : 4,
              ],
              'line-blur': 4,
              'line-opacity': [
                'case',
                ['==', ['get', 'id'], selectedBarangayId],
                0.42,
                showFloodLayer ? 0 : 0.24,
              ],
            }}
          />
          <Layer
            id="bicol-barangays-outline"
            type="line"
            slot="middle"
            paint={{
              'line-color': [
                'step',
                ['get', 'wvi_score'],
                '#059669',
                35, '#D97706',
                65, '#DC2626',
              ],
              'line-width': [
                'case',
                ['==', ['get', 'id'], selectedBarangayId],
                2.8,
                1.4,
              ],
              'line-dasharray': [3, 1.5],
              'line-opacity': showFloodLayer ? 0.88 : ['case', ['==', ['get', 'id'], selectedBarangayId], 0.55, 0.0],
            }}
          />
        </Source>

        {showBarangayBuildings && !hasEnvData && simCityLotGeoJson.features.length > 0 && (
          <Source id="bicol-simcity-lots-src" type="geojson" data={simCityLotGeoJson}>
            <Layer
              id="bicol-simcity-lots-fill"
              type="fill"
              slot="middle"
              filter={[
                'all',
                ['==', ['get', 'kind'], 'lot'],
                ['in', ['get', 'archetype'], ['literal', ['shophouse_commercial', 'midrise_building']]],
              ]}
              paint={{
                'fill-color': '#DCE3EC',
                'fill-opacity': 0.98,
                'fill-emissive-strength': 0.92,
              }}
            />
          </Source>
        )}

        {showFloodLayer && (
          <Source id="bicol-flood-hazards-src" type="geojson" data={NAGA_FLOOD_HAZARD_GEOJSON}>
            <Layer
              id="bicol-flood-hazards-fill"
              type="fill"
              slot="middle"
              paint={{
                'fill-color': [
                  'match',
                  ['get', 'tier'],
                  'high', '#EF4444',
                  'moderate', '#F59E0B',
                  'upland', '#38BDF8',
                  '#64748B',
                ],
                'fill-opacity': [
                  'match',
                  ['get', 'tier'],
                  'high', 0.12,
                  'moderate', 0.08,
                  'upland', 0.07,
                  0.07,
                ],
              }}
            />
            <Layer
              id="bicol-flood-hazards-outline"
              type="line"
              slot="middle"
              paint={{
                'line-color': [
                  'match',
                  ['get', 'tier'],
                  'high', '#DC2626',
                  'moderate', '#D97706',
                  'upland', '#0284C7',
                  '#64748B',
                ],
                'line-width': 1.5,
                'line-dasharray': [3, 2],
                'line-opacity': 0.72,
              }}
            />
          </Source>
        )}

                {/* Zoomed-Out Colored 3D Barangay Risk Columns */}
        <Source id="bicol-risk-columns-src" type="geojson" data={barangayRiskColumnsGeoJson}>
          <Layer
            id="bicol-barangay-risk-columns"
            type="fill-extrusion"
            slot="middle"
            maxzoom={15.0}
            layout={{
              visibility: showFloodLayer && !hasEnvData ? 'visible' : 'none',
            }}
            paint={{
              'fill-extrusion-color': [
                'step',
                ['get', 'wvi_score'],
                '#16A34A',
                35, '#F5B81B',
                55, '#E88B5A',
                75, '#EF4444',
              ],
              'fill-extrusion-height': ['get', 'column_height_m'],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13.8, 0.94,
                14.8, 0.0,
              ],
              'fill-extrusion-vertical-gradient': true,
              'fill-extrusion-emissive-strength': 0.25,
            }}
          />
        </Source>


        {/* Mapbox Vector Clay Buildings & Arterial Roads */}
        <Source id="naga-streets-vector" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
          
          <Layer
            id="bicol-mapbox-arterial-roads-casing"
            source-layer="road"
            type="line"
            slot="middle"
            minzoom={SHOW_3D_MODELS_MIN_ZOOM}
            filter={['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]]}
            layout={{
              visibility: show3DModels && !hasEnvData ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            }}
            paint={{
              'line-color': showBarangayBuildings ? '#E2E8F0' : '#CBD5E1',
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 5.5, 17, 13],
              'line-opacity': 0.95,
            }}
          />
          <Layer
            id="bicol-mapbox-arterial-roads-fill"
            source-layer="road"
            type="line"
            slot="middle"
            minzoom={SHOW_3D_MODELS_MIN_ZOOM}
            filter={['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]]}
            layout={{
              visibility: show3DModels && !hasEnvData ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            }}
            paint={{
              'line-color': hasEnvData ? '#94A3B8' : showBarangayBuildings ? '#334155' : '#F8FAFC',
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3.2, 17, 9],
              'line-opacity': 0.96,
            }}
          />
        </Source>

        {/* Concrete Gray Ground Inside Active Barangay Only + Clean Sidewalks & Roads */}
                {hasEnvData && (
          <Source
            key="bicol-streetscape-ground-src"
            id="bicol-streetscape-ground-src"
            type="geojson"
            data={envData.groundGeoJson}
          >
            <Layer
              id="bicol-street-turf-base"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'turf_base']}
              paint={{
                'fill-color': solarState.turfHex,
                'fill-opacity': 0.96,
                'fill-emissive-strength': solarState.groundEmissive,
              }}
            />
            <Layer
              id="bicol-street-sidewalk-shadow"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'sidewalk_shadow']}
              paint={{
                'fill-color': '#334155',
                'fill-opacity': 0.48,
                'fill-emissive-strength': solarState.groundEmissive * 0.8,
              }}
            />
            <Layer
              id="bicol-street-sidewalk"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'sidewalk']}
              paint={{
                'fill-color': solarState.sidewalkHex,
                'fill-opacity': 1.0,
                'fill-emissive-strength': Number((solarState.groundEmissive * 1.15).toFixed(2)),
              }}
            />
            <Layer
              id="bicol-street-parking-bay"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'parking_bay']}
              paint={{
                'fill-color': '#475569',
                'fill-opacity': 0.96,
                'fill-emissive-strength': solarState.groundEmissive,
              }}
            />
            <Layer
              id="bicol-street-transit-bay"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'transit_bay']}
              paint={{
                'fill-color': '#F59E0B',
                'fill-opacity': 0.92,
                'fill-emissive-strength': Number(Math.max(0.55, solarState.groundEmissive * 1.4).toFixed(2)),
              }}
            />
            <Layer
              id="bicol-street-curb"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'curb']}
              paint={{
                'fill-color': solarState.curbHex,
                'fill-opacity': 1.0,
                'fill-emissive-strength': Number((solarState.groundEmissive * 1.2).toFixed(2)),
              }}
            />
            <Layer
              id="bicol-street-asphalt"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'asphalt']}
              paint={{
                'fill-color': solarState.asphaltHex,
                'fill-opacity': 1.0,
                'fill-emissive-strength': Number((solarState.groundEmissive * 0.85).toFixed(2)),
              }}
            />
            <Layer
              id="bicol-street-markings"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'marking']}
              paint={{
                'fill-color': ['match', ['get', 'paint'], 'yellow', '#FBBF24', '#FFFFFF'],
                'fill-opacity': 0.98,
                'fill-emissive-strength': 0.95,
              }}
            />
          </Source>
        )}

        {hasEnvData && (
          <Source
            id="bicol-dynamic-building-shadows-src"
            type="geojson"
            data={dynamicBuildingShadowsGeoJson}
          >
            <Layer
              id="bicol-street-building-shadow-outer"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'building_shadow_outer']}
              paint={{
                'fill-color': '#1E293B',
                'fill-opacity': Number((solarState.shadowOpacity * 0.55).toFixed(2)),
                'fill-emissive-strength': 0.15,
              }}
            />
            <Layer
              id="bicol-street-building-shadow-core"
              type="fill"
              slot="middle"
              filter={['==', ['get', 'kind'], 'building_shadow_core']}
              paint={{
                'fill-color': '#0F172A',
                'fill-opacity': solarState.shadowOpacity,
                'fill-emissive-strength': 0.10,
              }}
            />
          </Source>
        )}


        {/* Clean NAGA_OSM Primary, Secondary & Collector Road Frame */}
        <Source
          id="bicol-major-arterial-roads"
          type="geojson"
          data={hasEnvData ? envData.outsideArterialsGeoJson : MAJOR_ARTERIAL_ROADS_GEOJSON}
        >
          <Layer
            id="bicol-osm-arterial-roads-casing"
            type="line"
            slot="middle"
            minzoom={SHOW_3D_MODELS_MIN_ZOOM}
            layout={{
              visibility: show3DModels ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            }}
            paint={{
              'line-color': showBarangayBuildings ? '#E2E8F0' : ['match', ['get', 'tier'], 'primary', '#94A3B8', '#CBD5E1'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6.5, 17, 18.0],
              'line-opacity': 0.96,
            }}
          />
          <Layer
            id="bicol-osm-arterial-roads-core"
            type="line"
            slot="middle"
            minzoom={SHOW_3D_MODELS_MIN_ZOOM}
            layout={{
              visibility: show3DModels ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            }}
            paint={{
              'line-color': hasEnvData ? '#64748B' : showBarangayBuildings ? '#334155' : '#F8FAFC',
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4.0, 17, 13.5],
              'line-opacity': 0.98,
            }}
          />
        </Source>

        {/* Top-Sorted River & Canal Water Layer (Guarantees Zero Roads Visually Cross Water) */}
        <Source id="naga-water-top-mask" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
          <Layer
            id="naga-mapbox-aqua-water"
            source-layer="water"
            type="fill"
            slot="middle"
            paint={{
              'fill-color': '#22D3EE',
              'fill-opacity': 0.98,
              'fill-emissive-strength': 0.72,
            }}
          />
          <Layer
            id="naga-mapbox-aqua-waterway"
            source-layer="waterway"
            type="line"
            slot="middle"
            paint={{
              'line-color': '#06B6D4',
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 8],
              'line-opacity': 0.96,
              'line-emissive-strength': 0.68,
            }}
          />
        </Source>

        {/* Curated Clay Infill Blocks for City-Scale Neighborhood Density */}
        <Source id="bicol-white-clay-infill-src" type="geojson" data={whiteClayBuildingsGeoJson}>
          <Layer
            id="bicol-white-clay-infill-buildings"
            type="fill-extrusion"
            slot="middle"
            minzoom={12.0}
            layout={{
              visibility: hideWhiteExtrusions ? 'none' : 'visible',
            }}
            paint={{
              'fill-extrusion-color': '#E2EDE2',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14.5, 0.90,
                14.9, 0.0,
              ],
              'fill-extrusion-vertical-gradient': true,
              'fill-extrusion-emissive-strength': 0.36,
              'fill-extrusion-ambient-occlusion-intensity': 0.45,
              'fill-extrusion-ambient-occlusion-radius': 3.5,
            }}
          />
        </Source>

        {showTankerRoutes && tankerGeoJson.features.length > 0 && (
          <Source id="bicol-tanker-routes-src" type="geojson" data={tankerGeoJson}>
            <Layer
              id="bicol-tanker-routes-casing"
              type="line"
              slot="top"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#0284C7',
                'line-width': 9,
                'line-opacity': 0.9,
                'line-emissive-strength': 0.7,
              }}
            />
            <Layer
              id="bicol-tanker-routes-core"
              type="line"
              slot="top"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#38BDF8',
                'line-width': 4.5,
                'line-opacity': 0.98,
                'line-emissive-strength': 0.95,
              }}
            />
          </Source>
        )}

        <DeckGLOverlay
          staticLayers={staticDeckLayers}
          waterPoints={waterPoints}
          activeMapNodeId={activeMapNode?.id}
          show3DModels={show3DModels}
          showTankerRoutes={showTankerRoutes}
          glbModelsReady={glbModelsReady}
          tankerRoutes={tankerRoutes}
          terrainSyncTick={terrainSyncTick}
          getGroundPosition={getGroundPosition}
          handleFacilityPick={handleFacilityPick}
          envData={envData}
          envCatalog={envCatalog}
          solarState={solarState}
        />

        {isGlobeZoom ? (
            <Marker longitude={123.185} latitude={13.621} anchor="bottom" offset={[0, -10]}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const map = mapRef.current?.getMap?.() || mapRef.current;
                  map?.flyTo?.({
                    center: [123.185, 13.621],
                    zoom: 12.6,
                    pitch: 54,
                    bearing: -18,
                    duration: prefersReducedMotion() ? 0 : 1800,
                    essential: true,
                  });
                }}
                className="flex flex-col items-center group cursor-pointer hud-press"
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-slate-900 shadow-lg border border-slate-900/[0.10] text-[11.5px] font-bold tracking-tight whitespace-nowrap group-hover:border-[#0284C7]">
                  <span className="w-2 h-2 rounded-full bg-[#0284C7] shrink-0" />
                  <span>Naga City · {waterPoints.length} Kiosks</span>
                </div>
                <div className="w-[1.5px] h-3 bg-[#0284C7]/70" />
              </button>
            </Marker>
          ) : (
            waterPoints.map((pt) => {
              const isSelected = !activeMapNode?.isBarangay && activeMapNode?.id === pt.id;
              const isCritical = pt.wvi_score >= 65;
              if (!showLabels) return null;
              const statusColor = getStatusHex(pt.wvi_score);

              return (
                <Marker
                  key={pt.id}
                  longitude={(showBarangayBuildings && envData?.facilityOverrides?.[pt.id]?.lng) || pt.lng}
                  latitude={(showBarangayBuildings && envData?.facilityOverrides?.[pt.id]?.lat) || pt.lat}
                  anchor="bottom"
                  offset={[0, -24]}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNodeSelect) {
                        const haz = getFacilityHazardCrossRef(pt.lat, pt.lng, pt.barangay);
                        onNodeSelect({ ...pt, hazardZone: haz });
                      }
                    }}
                    className="flex flex-col items-center group cursor-pointer"
                  >
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-slate-900 shadow-md border text-[11px] font-bold tracking-tight whitespace-nowrap transition-transform tabular-nums ${
                        isSelected
                          ? 'border-[#0284C7] ring-2 ring-[#0284C7]/45 scale-110 text-[#0284C7]'
                          : isCritical
                          ? 'border-red-300 ring-1 ring-red-400/40 group-hover:scale-105'
                          : 'border-slate-900/[0.10] group-hover:scale-105'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                      <span>
                        {pt.id} · WVI {pt.wvi_score}
                      </span>
                    </div>
                    <div className="w-px h-3 bg-slate-400/80" />
                  </button>
                </Marker>
              );
            })
          )}

        {showLabels &&
          showCivicHallModels &&
          viewportBuildings.evacHalls.map((camp) => (
            <Marker key={camp.id} longitude={camp.lng} latitude={camp.lat} anchor="bottom" offset={[0, -46]}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const map = mapRef.current?.getMap?.() || mapRef.current;
                  map?.flyTo?.({
                    center: [camp.lng, camp.lat],
                    zoom: 16.0,
                    pitch: 60,
                    duration: 850,
                  });
                }}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[#0F172A] text-[10.5px] font-semibold tracking-tight whitespace-nowrap transition-transform group-hover:scale-105"
                  style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(12px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 6px 18px -4px rgba(15, 23, 42, 0.14)',
                  }}
                >
                  <span className="w-4 h-4 rounded-md bg-sky-50 border border-sky-200/80 flex items-center justify-center text-[#0284C7] shrink-0">
                    <Landmark className="w-2.5 h-2.5 shrink-0" />
                  </span>
                  <span>{camp.badgeTitle}</span>
                </div>
                <div className="w-[1.5px] h-3 bg-[#0284C7]/60" />
              </button>
            </Marker>
          ))}
      </MapboxMap>
      

      {/* UNIFIED BOTTOM-CENTER OPERATIONAL DOCK (WVI Risk + Solar Cycle + CDRRMO Dispatch) */}
      {(() => {
        const hasTankerDispatch = showTankerRoutes && tankerRoutes.length > 0;
        const primaryRoute = hasTankerDispatch
          ? (selectedTankerRouteId ? tankerRoutes.find((r) => r.id === selectedTankerRouteId) : null) ||
            (activeMapNode && !activeMapNode.isBarangay
              ? tankerRoutes.find((r) => r.id === activeMapNode.id)
              : null) ||
            tankerRoutes[0]
          : null;
        const primaryPt = primaryRoute ? waterPoints.find((p) => p.id === primaryRoute.id) : null;
        const isDispatched = Boolean(primaryPt?.tanker_dispatched);
        const isVerified = Boolean(primaryPt?.verified);
        const chlorineVal = Number(primaryPt?.metrics?.residual_chlorine ?? 0);

        let currentStep = 0;
        if (isDispatched && isVerified && chlorineVal >= 0.5) currentStep = 4;
        else if (isDispatched && isVerified) currentStep = 3;
        else if (isDispatched) currentStep = 2;
        else if (isVerified) currentStep = 1;

        const steps = [
          'Alert Triggered',
          'Field-Kit Check',
          'Tanker Dispatched',
          'En Route',
          'Delivery Verified',
        ];

        const togglePanel = (panel) =>
          setActiveHudPanel((prev) => (prev === panel ? null : panel));

        return (
          <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2.5 max-w-[calc(100vw-2rem)]">
            {/* Upward Anchored Popover Surface (Strictly centered, never shifts sideways or clips) */}
            {activeHudPanel === 'LEGEND' && (
              <div
                role="region"
                aria-label="WVI Risk Symbology Legend"
                className="hud-enter hud-surface pointer-events-auto rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[#0F172A] max-w-full"
              >
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500">
                  WVI Risk Symbology
                </span>
                <span className="hidden sm:inline h-3.5 w-px bg-slate-900/[0.10]" />
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={2.25} />
                  <span className="text-[12px] font-semibold text-slate-800">Safe &lt;35 · Potable</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={2.25} />
                  <span className="text-[12px] font-semibold text-slate-800">35–64 · Boil-Water</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rotate-45 rounded-[2px] bg-red-500 shrink-0" />
                  <span className="text-[12px] font-semibold text-slate-800">65+ · Tanker Ration</span>
                </span>
              </div>
            )}

            {activeHudPanel === 'SOLAR' && (
              <div className="hud-enter hud-surface pointer-events-auto flex flex-col gap-2.5 w-[320px] max-w-full rounded-2xl p-3.5 text-[#0F172A]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-[10px] border flex items-center justify-center transition-colors duration-300 ${
                        solarState.streetLightFactor > 0.25
                          ? 'bg-indigo-50 border-indigo-200/80 text-indigo-600'
                          : 'bg-sky-50 border-sky-200/80 text-[#0284C7]'
                      }`}
                    >
                      <Clock
                        className={`w-3.5 h-3.5 ${isTimePlaying ? 'animate-spin' : ''}`}
                        style={isTimePlaying ? { animationDuration: '8s' } : undefined}
                        strokeWidth={2}
                      />
                    </div>
                    <div className="leading-tight">
                      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
                        Solar Cycle
                      </div>
                      <div className="text-[14px] font-bold text-slate-900 tabular-nums tracking-tight">
                        {formatMinutesToHHMM(timeOfDayMinutes)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                        solarState.streetLightFactor > 0.25
                          ? 'bg-amber-50 text-amber-700 border-amber-200/90'
                          : 'bg-sky-50 text-[#0284C7] border-sky-200/80'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          solarState.streetLightFactor > 0.25 ? 'bg-amber-500 animate-pulse' : 'bg-[#0284C7]'
                        }`}
                      />
                      {solarState.streetLightFactor > 0.25 ? 'Streetlights ON' : 'Daylight'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveHudPanel(null)}
                      aria-label="Collapse Solar Cycle panel"
                      className="w-7 h-7 rounded-[9px] hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer hud-press"
                    >
                      <ChevronDown className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>

                <div className="relative flex flex-col gap-1 pt-0.5">
                  <div className="relative h-5 flex items-center group">
                    <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full ${
                          solarState.streetLightFactor > 0.25 ? 'solar-track-night' : 'solar-track-day'
                        }`}
                        style={{ width: `${(timeOfDayMinutes / 1439) * 100}%` }}
                      />
                    </div>
                    <div
                      className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-[#0284C7] shadow-md transition-transform duration-150 group-hover:scale-110"
                      style={{ left: `${(timeOfDayMinutes / 1439) * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1439}
                      step={1}
                      value={Math.round(timeOfDayMinutes)}
                      onChange={(e) => setTimeOfDayMinutes(Number(e.target.value))}
                      aria-label="Simulated 24-hour time"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-[9.5px] font-semibold text-slate-500 tabular-nums px-0.5">
                    <span>00:00</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>24:00</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-[10.5px] font-semibold">
                  {[
                    { label: 'Midnight', mins: 0, Icon: Moon },
                    { label: 'Sunrise', mins: 360, Icon: Sunrise },
                    { label: 'Noon', mins: 720, Icon: Sun },
                    { label: 'Sunset', mins: 1080, Icon: Sunset },
                  ].map(({ label, mins, Icon }) => {
                    const isActive = Math.abs(timeOfDayMinutes - mins) < 20;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setTimeOfDayMinutes(mins)}
                        className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-[10px] border cursor-pointer hud-press ${
                          isActive
                            ? 'bg-[#0284C7] text-white border-[#0284C7] shadow-sm'
                            : 'bg-slate-50/90 text-slate-600 border-slate-900/[0.08] hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0" strokeWidth={2} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-900/[0.07]">
                  <button
                    type="button"
                    onClick={() => setIsTimePlaying((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-[10px] text-[11px] font-semibold border cursor-pointer hud-press ${
                      isTimePlaying
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-900 border-slate-900/[0.09] hover:bg-slate-100'
                    }`}
                  >
                    {isTimePlaying ? (
                      <Pause className="w-3 h-3 text-emerald-600" strokeWidth={2.25} />
                    ) : (
                      <Play className="w-3 h-3 text-[#0284C7]" strokeWidth={2.25} />
                    )}
                    <span>{isTimePlaying ? 'Pause' : 'Play Cycle'}</span>
                  </button>

                  <div className="flex items-center gap-1 text-[10.5px]">
                    <span className="text-slate-500 font-medium mr-0.5">Speed:</span>
                    {[2, 5, 10].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setCycleDurationMins(mins)}
                        className={`px-2 py-0.5 rounded-lg font-semibold border cursor-pointer hud-press tabular-nums ${
                          cycleDurationMins === mins
                            ? 'bg-sky-50 text-[#0284C7] border-sky-200 font-bold'
                            : 'bg-slate-50/70 text-slate-500 border-slate-900/[0.08] hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeHudPanel === 'DISPATCH' && hasTankerDispatch && (
              <div className="hud-enter hud-surface pointer-events-auto flex flex-col gap-2.5 rounded-2xl p-3.5 text-[#0F172A] w-[540px] max-w-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-7 h-7 rounded-[10px] bg-sky-50 border border-sky-600/15 flex items-center justify-center text-[#0284C7]">
                      <Truck className="w-3.5 h-3.5" strokeWidth={2} />
                    </div>
                    <div className="leading-tight">
                      <div className="text-[13px] font-bold text-slate-900">
                        CDRRMO Tanker Dispatch
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">
                        {primaryRoute ? `${primaryRoute.id} · ${primaryRoute.barangay}` : 'Active fleet corridor'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold tabular-nums">
                      {tankerRoutes.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedTankerRouteId(r.id)}
                          className={`px-2 py-1 rounded-lg cursor-pointer hud-press ${
                            r.id === primaryRoute?.id
                              ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-600/15'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          {r.id}: {r.distanceKm} km · {r.durationMin}m
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveHudPanel(null)}
                      aria-label="Collapse Tanker Dispatch timeline"
                      className="w-7 h-7 rounded-[9px] hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer hud-press shrink-0"
                    >
                      <ChevronDown className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>

                <div key={primaryRoute?.id || 'route'} className="hud-enter flex items-center gap-1 pt-0.5 overflow-x-auto">
                  {steps.map((label, idx) => {
                    const done = idx <= currentStep;
                    const active = idx === currentStep;
                    return (
                      <React.Fragment key={label}>
                        <div className="flex flex-col items-center gap-1 shrink-0 min-w-[74px]">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                              active
                                ? 'bg-[#0284C7] border-[#0284C7] text-white ring-4 ring-sky-100'
                                : done
                                ? 'bg-[#0284C7] border-[#0284C7] text-white'
                                : 'bg-slate-100 border-slate-300 text-slate-400'
                            }`}
                          >
                            {done ? (
                              <Check className="w-3 h-3 stroke-[2.75]" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            )}
                          </span>
                          <span
                            className={`text-[10.5px] tracking-tight whitespace-nowrap ${
                              active
                                ? 'text-[#0284C7] font-bold'
                                : done
                                ? 'text-slate-900 font-semibold'
                                : 'text-slate-500 font-medium'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        {idx < steps.length - 1 && (
                          <div
                            className={`h-[2px] flex-1 min-w-[10px] -mt-4 rounded-full ${
                              idx < currentStep ? 'bg-[#0284C7]' : 'bg-slate-200'
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single Unified Grounded Bottom Pill Bar */}
            <div
              role="toolbar"
              aria-label="Map Legend, Solar Cycle, and Dispatch Controls"
              className="hud-surface pointer-events-auto rounded-full p-1 flex items-center gap-0.5 text-[#0F172A] max-w-full overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => togglePanel('LEGEND')}
                aria-expanded={activeHudPanel === 'LEGEND'}
                className={`hud-press rounded-full h-8 px-3 flex items-center gap-2 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer ${
                  activeHudPanel === 'LEGEND'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100/90'
                }`}
              >
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="w-2 h-2 rotate-45 rounded-[1px] bg-red-500" />
                </span>
                <span>WVI Risk</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-60 transition-transform duration-150 ${
                    activeHudPanel === 'LEGEND' ? '' : 'rotate-180'
                  }`}
                  strokeWidth={2}
                />
              </button>

              <span className="h-4 w-px bg-slate-900/[0.10] shrink-0" />

              <button
                type="button"
                onClick={() => togglePanel('SOLAR')}
                aria-expanded={activeHudPanel === 'SOLAR'}
                className={`hud-press rounded-full h-8 px-3 flex items-center gap-1.5 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer ${
                  activeHudPanel === 'SOLAR'
                    ? 'bg-[#0284C7] text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100/90'
                }`}
              >
                <Clock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activeHudPanel === 'SOLAR'
                      ? 'text-white'
                      : solarState.streetLightFactor > 0.25
                      ? 'text-indigo-600'
                      : 'text-[#0284C7]'
                  } ${isTimePlaying ? 'animate-spin' : ''}`}
                  style={isTimePlaying ? { animationDuration: '8s' } : undefined}
                  strokeWidth={2}
                />
                <span className="font-bold tabular-nums">{formatMinutesToHHMM(timeOfDayMinutes)}</span>
                <span className="hidden sm:inline opacity-75">
                  {solarState.streetLightFactor > 0.25 ? 'Night' : 'Daylight'}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-60 transition-transform duration-150 ${
                    activeHudPanel === 'SOLAR' ? '' : 'rotate-180'
                  }`}
                  strokeWidth={2}
                />
              </button>

              {hasTankerDispatch && (
                <>
                  <span className="h-4 w-px bg-slate-900/[0.10] shrink-0" />
                  <button
                    type="button"
                    onClick={() => togglePanel('DISPATCH')}
                    aria-expanded={activeHudPanel === 'DISPATCH'}
                    className={`hud-press rounded-full h-8 px-3 flex items-center gap-2 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer ${
                      activeHudPanel === 'DISPATCH'
                        ? 'bg-[#0284C7] text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-100/90'
                    }`}
                  >
                    <Truck
                      className={`w-3.5 h-3.5 shrink-0 ${
                        activeHudPanel === 'DISPATCH' ? 'text-white' : 'text-[#0284C7]'
                      }`}
                      strokeWidth={2}
                    />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span>Dispatch · {tankerRoutes.length}</span>
                    {primaryRoute && (
                      <span
                        className={`hidden md:inline tabular-nums font-bold ${
                          activeHudPanel === 'DISPATCH' ? 'text-sky-100' : 'text-[#0284C7]'
                        }`}
                      >
                        {primaryRoute.id} ({primaryRoute.durationMin}m)
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 opacity-60 transition-transform duration-150 ${
                        activeHudPanel === 'DISPATCH' ? '' : 'rotate-180'
                      }`}
                      strokeWidth={2}
                    />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
});

export default BicolMap3D;
