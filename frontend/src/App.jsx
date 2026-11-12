import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Layers,
  Truck,
  LayoutDashboard,
  ClipboardCheck,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RotateCcw,
  X,
  Compass,
  Megaphone,
  Navigation,
} from 'lucide-react';
import {
  getOfflineQueue,
  enqueueInspection,
  clearOfflineQueue,
  saveCachedWaterPoints,
  loadCachedWaterPoints,
} from './utils/offlineQueue';
import { INITIAL_NAGA_POINTS } from './data/nagaGeoData';
import BicolMap3D from './components/BicolMap3D';
import BicolAquaLogo from './components/BicolAquaLogo';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

const ROLES = [
  { id: 'LGU', label: 'LGU WASH', icon: LayoutDashboard },
  { id: 'CDRRMO', label: 'CDRRMO', icon: Truck },
  { id: 'BHW', label: 'BHW Field', icon: ClipboardCheck },
  { id: 'RESIDENT', label: 'Resident', icon: Users },
];

export default function App() {
  // Map-First Default: null = unobstructed 3D map exploration
  const [activeRole, setActiveRole] = useState(null);
  const [waterPoints, setWaterPoints] = useState(INITIAL_NAGA_POINTS);
  const [activeMapNode, setActiveMapNode] = useState(null);
  const [cameraCommand, setCameraCommand] = useState(null);

  // Unified Search & Filter State (drives both 3D map markers and lists)
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [dockTab, setDockTab] = useState('ALL');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // Offline Queue & Sync State
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState(getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ active: false, type: '', message: '' });

  // Interactive 3D Map Layer Toggles
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showTankerRoutes, setShowTankerRoutes] = useState(true);

  // BHW Field Form State
  const [selectedPointId, setSelectedPointId] = useState('NAGA-02');
  const [bhwName, setBhwName] = useState('BHW M. Santos');
  const [pumpStatus, setPumpStatus] = useState('Functional');
  const [ph, setPh] = useState('7.0');
  const [tdsPpm, setTdsPpm] = useState('250');
  const [turbidityNtu, setTurbidityNtu] = useState('1.5');
  const [coliformPresent, setColiformPresent] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');

  // Resident Crowdsourced Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [residentReportBarangay, setResidentReportBarangay] = useState('Sabang');
  const [residentReportNote, setResidentReportNote] = useState('');

  const isOnline = !simulatedOffline && navigator.onLine;

  useEffect(() => {
    fetchPoints();
  }, []);

  useEffect(() => {
    if (activeMapNode) {
      setSelectedPointId(activeMapNode.id);
      setResidentReportBarangay(activeMapNode.barangay);
    }
  }, [activeMapNode]);

  async function fetchPoints() {
    if (!isOnline) {
      const cached = loadCachedWaterPoints();
      setWaterPoints(cached.length ? cached : INITIAL_NAGA_POINTS);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/water-points`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setWaterPoints(data);
        saveCachedWaterPoints(data);
        setActiveMapNode((prev) => (prev ? data.find((p) => p.id === prev.id) || null : null));
      }
    } catch {
      const cached = loadCachedWaterPoints();
      setWaterPoints(cached.length ? cached : INITIAL_NAGA_POINTS);
    }
  }

  function triggerStatusMessage(type, message) {
    setSyncStatus({ active: true, type, message });
    setTimeout(() => setSyncStatus({ active: false, type: '', message: '' }), 5000);
  }

  async function handleLogSubmit(e) {
    e.preventDefault();
    const payload = {
      point_id: selectedPointId,
      bhw_name: bhwName,
      status: pumpStatus,
      metrics: {
        ph: parseFloat(ph),
        tds_ppm: parseFloat(tdsPpm),
        turbidity_ntu: parseFloat(turbidityNtu),
        coliform_present: coliformPresent,
      },
      incident_note: incidentNote,
      recorded_at: new Date().toISOString(),
    };

    if (!isOnline) {
      const updatedQueue = enqueueInspection(payload);
      setQueue(updatedQueue);
      setIncidentNote('');
      triggerStatusMessage(
        'pending',
        `Saved offline (${updatedQueue.length} inspection(s) queued locally).`
      );
      return;
    }
    await syncLogsToServer([payload]);
  }

  async function syncLogsToServer(logsToSync) {
    setIsSyncing(true);
    triggerStatusMessage('info', 'Synchronizing with FastAPI...');
    try {
      const res = await fetch(`${API_BASE}/inspections/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logsToSync),
      });
      if (!res.ok) throw new Error('Sync failed');
      clearOfflineQueue();
      setQueue([]);
      setIncidentNote('');
      await fetchPoints();
      triggerStatusMessage('success', 'Synchronization complete. WVI updated on 3D map.');
    } catch {
      triggerStatusMessage('error', 'Server unreachable. Records safely retained in local queue.');
    } finally {
      setIsSyncing(false);
    }
  }

  const criticalPoints = waterPoints.filter((p) => p.wvi_score >= 65);
  const moderatePoints = waterPoints.filter((p) => p.wvi_score >= 35 && p.wvi_score < 65);
  const safePoints = waterPoints.filter((p) => p.wvi_score < 35);
  const totalResidents = waterPoints.reduce((acc, p) => acc + p.population_served, 0);
  const avgWvi = (
    waterPoints.reduce((acc, p) => acc + p.wvi_score, 0) / (waterPoints.length || 1)
  ).toFixed(1);

  // Unified filter applied to 3D map nodes and active lists
  const filteredPoints = waterPoints.filter((pt) => {
    const matchesSearch =
      pt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pt.barangay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pt.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = sourceFilter === 'ALL' || pt.source_type === sourceFilter;
    const matchesTier =
      tierFilter === 'ALL' ||
      (tierFilter === 'SAFE' && pt.wvi_score < 35) ||
      (tierFilter === 'MODERATE' && pt.wvi_score >= 35 && pt.wvi_score < 65) ||
      (tierFilter === 'CRITICAL' && pt.wvi_score >= 65);
    return matchesSearch && matchesSource && matchesTier;
  });

  const hasActiveFilters = searchQuery !== '' || sourceFilter !== 'ALL' || tierFilter !== 'ALL';

  function resetAllFilters() {
    setSearchQuery('');
    setSourceFilter('ALL');
    setTierFilter('ALL');
  }

  // Operations dock points (for LGU and CDRRMO)
  const opsDockPoints = [...filteredPoints]
    .sort((a, b) => (activeRole === 'CDRRMO' ? b.wvi_score - a.wvi_score : a.id.localeCompare(b.id)))
    .filter((pt) => {
      if (dockTab === 'SAFE') return pt.wvi_score < 35;
      if (dockTab === 'MODERATE') return pt.wvi_score >= 35 && pt.wvi_score < 65;
      if (dockTab === 'CRITICAL') return pt.wvi_score >= 65;
      return true;
    });

  const renderStatusPill = (score) => {
    if (score >= 65) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#FD7132]/15 text-[#FD7132]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FD7132]" />
          Critical ({score})
        </span>
      );
    }
    if (score >= 35) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#FE9659]/30 text-[#033F56]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FE9659]" />
          Boil Advisory ({score})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
        Safe ({score})
      </span>
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#DCE6EE] font-sans select-none">
      {/* CONSOLIDATED TOP NAVIGATION BAR */}
      <header className="h-14 bg-[#FDFDFD] border-b border-[#91EFF7] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveRole(null);
              setActiveMapNode(null);
              resetAllFilters();
              setCameraCommand({ action: 'RESET', ts: Date.now() });
            }}
            className="flex items-center gap-2.5 text-left group"
            title="Reset to Map-First Overview"
          >
            <div className="w-8 h-8 rounded-lg bg-[#FDFDFD] border border-[#91EFF7] flex items-center justify-center shadow-xs group-hover:border-[#00B3CD] transition-colors">
              <BicolAquaLogo className="w-7 h-7" />
            </div>
            <div className="font-extrabold text-base tracking-tight leading-none text-[#033F56]">
              Bicol<span className="text-[#00B3CD]">Aqua</span>
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#91EFF7]/35 text-[#01658E]">
                3D GIS
              </span>
            </div>
          </button>

          {/* Global Spatial Search Bar (Filters 3D Map & Active Lists across all roles) */}
          <div className="hidden sm:flex items-center relative ml-3">
            <Search className="w-3.5 h-3.5 text-[#01658E] absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search barangays, kiosks, wells..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-[#F3FBFD] border border-[#91EFF7] focus:border-[#01658E] focus:bg-[#FDFDFD] rounded-lg text-xs font-semibold text-[#033F56] w-60 lg:w-72 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-[#01658E] hover:text-[#033F56]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Sector Badge, Live Network Pill & Actor Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F3FBFD] border border-[#91EFF7] text-xs">
            <span className="px-1.5 py-0.5 rounded bg-[#033F56] text-[#FE9659] font-extrabold text-[10px]">
              NAGA CITY
            </span>
            <span className="font-bold text-[#033F56]">{safePoints.length} Safe</span>
            <span className="text-[#01658E]">• {criticalPoints.length} Critical</span>
          </div>

          <button
            type="button"
            onClick={() => setSimulatedOffline(!simulatedOffline)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
              isOnline
                ? 'bg-[#91EFF7]/25 text-[#01658E] border-[#2ED5E5]'
                : 'bg-[#FE9659]/30 text-[#033F56] border-[#FD7132]'
            }`}
            title="Toggle Online / Simulated Rural Offline mode"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-[#00B3CD] animate-pulse' : 'bg-[#FD7132]'
              }`}
            />
            <span className="hidden md:inline">{isOnline ? 'Live PostGIS' : 'Offline Mode'}</span>
            {queue.length > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-[#033F56] text-[#FDFDFD] text-[10px]">
                {queue.length}
              </span>
            )}
          </button>

          <div className="flex items-center bg-[#F3FBFD] p-1 rounded-lg border border-[#91EFF7]">
            <button
              type="button"
              onClick={() => setActiveRole(null)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
                activeRole === null
                  ? 'bg-[#033F56] text-[#FDFDFD] shadow-xs'
                  : 'text-[#01658E] hover:text-[#033F56]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Map View</span>
            </button>

            {ROLES.map((role) => {
              const isActive = activeRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setActiveRole(isActive ? null : role.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-[#033F56] text-[#FDFDFD] shadow-xs'
                      : 'text-[#01658E] hover:text-[#033F56]'
                  }`}
                >
                  <role.icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{role.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* FULL-VIEWPORT 3D GEOSPATIAL CANVAS + CONTEXTUAL ACTOR HUDS */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <BicolMap3D
            waterPoints={filteredPoints}
            showFloodLayer={showFloodLayer}
            showTankerRoutes={showTankerRoutes}
            activeMapNode={activeMapNode}
            onNodeSelect={setActiveMapNode}
            cameraCommand={cameraCommand}
          />
        </div>

        {/* GLOBAL FEEDBACK TOAST (Visible across any role after submitting a report or sync) */}
        {syncStatus.active && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div
              className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 ${
                syncStatus.type === 'error'
                  ? 'bg-[#FD7132] text-[#FDFDFD] border-[#FD7132]'
                  : syncStatus.type === 'pending'
                  ? 'bg-[#FE9659] text-[#033F56] border-[#FE9659]'
                  : 'bg-[#033F56] text-[#FDFDFD] border-[#01658E]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncStatus.message}</span>
            </div>
          </div>
        )}

        {/* PERIPHERAL HUD OVERLAY LAYER */}
        <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-5 flex flex-col justify-between">
          {/* TOP ROW */}
          <div className="flex items-start justify-between gap-4">
            {/* TOP-LEFT CONTEXTUAL PANEL */}
            <div className="pointer-events-auto flex flex-col gap-3 max-w-2xl">
              {/* 1. DEFAULT MAP-FIRST MODE: Unobstructed map with minimal discovery hint */}
              {activeRole === null && (
                <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00B3CD] shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-[#033F56]">Naga City 3D Water Atlas:</span>{' '}
                    <span className="text-[#01658E]">
                      Click any 3D facility to inspect water safety, or choose an actor workspace above.
                    </span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-bold text-[#01658E] hover:underline shrink-0"
                    >
                      Clear filter ({filteredPoints.length}/{waterPoints.length})
                    </button>
                  )}
                </div>
              )}

              {/* 2. LGU / CDRRMO TOP-LEFT KPI STRIP */}
              {(activeRole === 'LGU' || activeRole === 'CDRRMO') && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#91EFF7]/35 text-[#033F56] flex items-center justify-center shrink-0">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-[#01658E]">
                        {activeRole === 'CDRRMO' ? 'Residents at Risk' : 'Population Served'}
                      </div>
                      <div className="text-lg font-extrabold text-[#033F56] leading-tight">
                        {totalResidents.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#FE9659]/25 text-[#033F56] flex items-center justify-center shrink-0">
                      <LayoutDashboard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-[#01658E]">Mean City WVI</div>
                      <div className="text-lg font-extrabold text-[#033F56] leading-tight">
                        {avgWvi}
                        <span className="text-xs font-semibold text-[#01658E] ml-1">/ 100</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#FD7132]/15 text-[#FD7132] flex items-center justify-center shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-[#01658E]">
                        Tanker Dispatches
                      </div>
                      <div className="text-lg font-extrabold text-[#FD7132] leading-tight">
                        {criticalPoints.length} Active
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. UNIFIED RESIDENT DISCOVERY & REPORTING DRAWER */}
              {activeRole === 'RESIDENT' && (
                <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl shadow-lg w-full sm:w-[390px] max-h-[calc(100vh-8.5rem)] flex flex-col overflow-hidden">
                  {/* Drawer Header */}
                  <div className="px-4 py-3.5 border-b border-[#91EFF7] bg-[#F3FBFD]/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-extrabold text-[#033F56]">
                          Safe Water Point Finder
                        </h2>
                        <p className="text-[11px] text-[#01658E]">
                          {safePoints.length} of {waterPoints.length} stations certified safe today
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="text-[11px] font-bold text-[#01658E] hover:underline"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>

                    {/* Integrated Search + Source + Safety Filters */}
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#01658E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Filter by barangay or station name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 bg-[#FDFDFD] border border-[#91EFF7] focus:border-[#01658E] rounded-lg text-xs font-semibold text-[#033F56] outline-none"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#01658E]"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            className="w-full appearance-none bg-[#FDFDFD] border border-[#91EFF7] rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-bold text-[#033F56] outline-none focus:border-[#01658E]"
                          >
                            <option value="ALL">All Source Types</option>
                            <option value="Public Kiosk">Public Kiosk</option>
                            <option value="Handpump">Handpump</option>
                            <option value="Communal Spring">Communal Spring</option>
                            <option value="School Filtration">School Filtration</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-[#01658E] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        <div className="relative">
                          <select
                            value={tierFilter}
                            onChange={(e) => setTierFilter(e.target.value)}
                            className="w-full appearance-none bg-[#FDFDFD] border border-[#91EFF7] rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-bold text-[#033F56] outline-none focus:border-[#01658E]"
                          >
                            <option value="ALL">All Safety Tiers</option>
                            <option value="SAFE">Safe Only (&lt; 35)</option>
                            <option value="MODERATE">Boil Advisory (35–64)</option>
                            <option value="CRITICAL">Critical (&ge; 65)</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-[#01658E] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Synchronized Filtered Facility List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-[#91EFF7]">
                    {filteredPoints.length === 0 ? (
                      <div className="p-6 text-center space-y-2">
                        <p className="text-xs font-bold text-[#033F56]">
                          No water facilities match your current filters.
                        </p>
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="px-3 py-1.5 rounded-lg bg-[#91EFF7]/35 text-[#033F56] text-xs font-bold"
                        >
                          Show All {waterPoints.length} Stations
                        </button>
                      </div>
                    ) : (
                      filteredPoints.map((pt) => {
                        const isSelected = activeMapNode?.id === pt.id;
                        return (
                          <div
                            key={pt.id}
                            onClick={() => setActiveMapNode(pt)}
                            className={`p-3.5 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#91EFF7]/30 border-l-4 border-l-[#033F56]'
                                : 'hover:bg-[#F3FBFD]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-extrabold text-[#033F56]">
                                  {pt.name}
                                </div>
                                <div className="text-[11px] text-[#01658E] mt-0.5 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-[#00B3CD]" />
                                  Brgy. {pt.barangay} • {pt.source_type}
                                </div>
                              </div>
                              <div className="shrink-0">{renderStatusPill(pt.wvi_score)}</div>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px]">
                              <span className="text-[#01658E]">
                                Status: <strong className="text-[#033F56]">{pt.status}</strong>
                              </span>
                              <span className="font-bold text-[#01658E] flex items-center gap-1">
                                <Navigation className="w-3 h-3 text-[#00B3CD]" /> Focus on 3D Map
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Integrated Community Incident Report Footer */}
                  <div className="p-3 border-t border-[#91EFF7] bg-[#F3FBFD]">
                    <button
                      type="button"
                      onClick={() => setReportModalOpen(true)}
                      className="w-full py-2 px-3 rounded-lg bg-[#033F56] hover:bg-[#01658E] text-[#FDFDFD] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Megaphone className="w-3.5 h-3.5 text-[#FE9659]" />
                      Report Broken Pump or Muddy Water
                    </button>
                  </div>
                </div>
              )}

              {/* 4. BHW FIELD INSPECTOR FLOATING FORM DRAWER */}
              {activeRole === 'BHW' && (
                <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl shadow-lg w-full sm:w-[375px] max-h-[calc(100vh-8.5rem)] overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#91EFF7] pb-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-[#033F56]">
                        BHW Field Inspection Kit
                      </h2>
                      <p className="text-[11px] text-[#01658E]">
                        Tap any 3D facility on the map or select below
                      </p>
                    </div>
                    {queue.length > 0 && (
                      <button
                        type="button"
                        disabled={!isOnline || isSyncing}
                        onClick={() => syncLogsToServer(queue)}
                        className="px-2.5 py-1 rounded-md bg-[#FD7132] text-[#FDFDFD] text-xs font-extrabold disabled:opacity-40 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        Sync ({queue.length})
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleLogSubmit} className="space-y-3 text-xs">
                    <div className="relative">
                      <label className="block font-bold text-[#01658E] mb-1">
                        Water Facility
                      </label>
                      <select
                        value={selectedPointId}
                        onChange={(e) => {
                          setSelectedPointId(e.target.value);
                          const found = waterPoints.find((p) => p.id === e.target.value);
                          if (found) setActiveMapNode(found);
                        }}
                        className="w-full appearance-none bg-[#F3FBFD] border border-[#91EFF7] rounded-lg pl-3 pr-8 py-2 font-bold text-[#033F56] outline-none focus:border-[#01658E]"
                      >
                        {waterPoints.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.id} — {pt.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#01658E] absolute right-2.5 top-[30px] pointer-events-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="relative">
                        <label className="block font-bold text-[#01658E] mb-1">
                          Hardware Status
                        </label>
                        <select
                          value={pumpStatus}
                          onChange={(e) => setPumpStatus(e.target.value)}
                          className="w-full appearance-none bg-[#F3FBFD] border border-[#91EFF7] rounded-lg pl-2.5 pr-7 py-2 font-bold text-[#033F56] outline-none"
                        >
                          <option value="Functional">Functional</option>
                          <option value="Under Repair">Under Repair</option>
                          <option value="Abandoned">Abandoned</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#01658E] absolute right-2 top-[30px] pointer-events-none" />
                      </div>
                      <div>
                        <label className="block font-bold text-[#01658E] mb-1">Inspector</label>
                        <input
                          type="text"
                          value={bhwName}
                          onChange={(e) => setBhwName(e.target.value)}
                          className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-2.5 py-2 font-bold text-[#033F56] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block font-bold text-[#01658E] mb-1">pH</label>
                        <input
                          type="number"
                          step="0.1"
                          value={ph}
                          onChange={(e) => setPh(e.target.value)}
                          className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-2.5 py-1.5 font-bold text-[#033F56]"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[#01658E] mb-1">TDS (ppm)</label>
                        <input
                          type="number"
                          value={tdsPpm}
                          onChange={(e) => setTdsPpm(e.target.value)}
                          className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-2.5 py-1.5 font-bold text-[#033F56]"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[#01658E] mb-1">Turbidity</label>
                        <input
                          type="number"
                          step="0.1"
                          value={turbidityNtu}
                          onChange={(e) => setTurbidityNtu(e.target.value)}
                          className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-2.5 py-1.5 font-bold text-[#033F56]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-[#01658E] mb-1">
                        Field Observation Note
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Floodwater near apron"
                        value={incidentNote}
                        onChange={(e) => setIncidentNote(e.target.value)}
                        className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-2.5 py-1.5 text-[#033F56]"
                      />
                    </div>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#FD7132]/10 border border-[#FD7132]/35 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={coliformPresent}
                        onChange={(e) => setColiformPresent(e.target.checked)}
                        className="w-4 h-4 accent-[#FD7132]"
                      />
                      <span className="font-bold text-[#FD7132]">
                        Positive Coliform Strip (+25 WVI)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSyncing}
                      className="w-full py-2.5 rounded-lg font-bold bg-[#033F56] hover:bg-[#01658E] text-[#FDFDFD] transition-colors"
                    >
                      {isOnline ? 'Submit & Update 3D Map' : 'Queue Inspection Offline'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* TOP-RIGHT HUD: Vertical Camera/Layer Pill Toolbar + Contextual Object Inspector */}
            <div className="pointer-events-auto flex items-start gap-2.5">
              <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl p-1.5 shadow-sm flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setCameraCommand({ action: 'ZOOM_IN', ts: Date.now() })}
                  className="p-2 rounded-lg hover:bg-[#F3FBFD] text-[#033F56]"
                  title="Zoom In"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCameraCommand({ action: 'ZOOM_OUT', ts: Date.now() })}
                  className="p-2 rounded-lg hover:bg-[#F3FBFD] text-[#033F56]"
                  title="Zoom Out"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMapNode(null);
                    setCameraCommand({ action: 'RESET', ts: Date.now() });
                  }}
                  className="p-2 rounded-lg hover:bg-[#F3FBFD] text-[#033F56]"
                  title="Reset 3D Camera"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <div className="h-px bg-[#91EFF7] my-0.5" />
                <button
                  type="button"
                  onClick={() => setShowFloodLayer(!showFloodLayer)}
                  className={`p-2 rounded-lg transition-colors ${
                    showFloodLayer ? 'bg-[#033F56] text-[#2ED5E5]' : 'hover:bg-[#F3FBFD] text-[#01658E]'
                  }`}
                  title="Toggle Flood Susceptibility Layer"
                >
                  <Layers className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTankerRoutes(!showTankerRoutes)}
                  className={`p-2 rounded-lg transition-colors ${
                    showTankerRoutes ? 'bg-[#01658E] text-[#FDFDFD]' : 'hover:bg-[#F3FBFD] text-[#01658E]'
                  }`}
                  title="Toggle CDRRMO Tanker Corridors"
                >
                  <Truck className="w-4 h-4" />
                </button>
              </div>

              {/* Contextual Selected Facility Inspector Card */}
              {activeMapNode && (
                <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl p-4 shadow-lg w-72 sm:w-80 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#01658E]">
                        {activeMapNode.id} • {activeMapNode.source_type}
                      </div>
                      <h3 className="text-sm font-extrabold text-[#033F56] leading-snug mt-0.5">
                        {activeMapNode.name}
                      </h3>
                      <p className="text-xs text-[#01658E]">
                        Brgy. {activeMapNode.barangay} ({activeMapNode.elevation_m}m ASL)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMapNode(null)}
                      className="p-1 rounded-lg hover:bg-[#F3FBFD] text-[#01658E]"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      {renderStatusPill(activeMapNode.wvi_score)}
                      <span className="text-xs font-bold text-[#033F56]">
                        WVI {activeMapNode.wvi_score} / 100
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#91EFF7]/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, activeMapNode.wvi_score)}%`,
                          backgroundColor:
                            activeMapNode.wvi_score >= 65
                              ? '#EF4444'
                              : activeMapNode.wvi_score >= 35
                              ? '#F59E0B'
                              : '#10B981',
                        }}
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-[#91EFF7] text-xs border-t border-[#91EFF7] pt-1">
                    <div className="py-1.5 flex justify-between">
                      <span className="text-[#01658E]">Hardware Condition</span>
                      <span className="font-bold text-[#033F56]">{activeMapNode.status}</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-[#01658E]">Coliform Bacteria</span>
                      <span
                        className={`font-bold ${
                          activeMapNode.metrics.coliform_present
                            ? 'text-[#FD7132]'
                            : 'text-emerald-700'
                        }`}
                      >
                        {activeMapNode.metrics.coliform_present ? 'Positive (Hazard)' : 'Negative'}
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-[#01658E]">pH / TDS / Turbidity</span>
                      <span className="font-bold text-[#033F56]">
                        {activeMapNode.metrics.ph} / {activeMapNode.metrics.tds_ppm}ppm /{' '}
                        {activeMapNode.metrics.turbidity_ntu}NTU
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-[#01658E]">Flood Exposure / Pop.</span>
                      <span className="font-bold text-[#033F56]">
                        Tier {activeMapNode.flood_risk_level}/5 • {activeMapNode.population_served}{' '}
                        res.
                      </span>
                    </div>
                  </div>

                  {/* Role-aware Contextual Footer Action inside Inspector */}
                  <div className="pt-1 flex gap-2">
                    {activeRole === 'RESIDENT' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setResidentReportBarangay(activeMapNode.barangay);
                          setReportModalOpen(true);
                        }}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-[#033F56] text-[#FDFDFD] text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Megaphone className="w-3.5 h-3.5 text-[#FE9659]" />
                        Report Issue at This Station
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPointId(activeMapNode.id);
                            setActiveRole('BHW');
                          }}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-[#F3FBFD] hover:bg-[#91EFF7]/35 border border-[#91EFF7] text-xs font-bold text-[#033F56]"
                        >
                          Log Field Test
                        </button>
                        {activeMapNode.wvi_score >= 65 && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowTankerRoutes(true);
                              setActiveRole('CDRRMO');
                            }}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-[#FD7132] text-[#FDFDFD] text-xs font-bold"
                          >
                            Track Tanker
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM ROW */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4">
            {/* BOTTOM-LEFT HUD: CDRRMO Tanker Stepper + Compact GIS Symbology Pill */}
            <div className="pointer-events-auto flex flex-col gap-2.5">
              {activeRole === 'CDRRMO' && criticalPoints.length > 0 && (
                <div className="bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl p-4 shadow-md max-w-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-[#033F56]">
                      <Truck className="w-4 h-4 text-[#FD7132]" />
                      <span>
                        Emergency Water Tanker Dispatch •{' '}
                        {(activeMapNode?.wvi_score >= 65 ? activeMapNode : criticalPoints[0]).name}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-[#FD7132]/15 text-[#FD7132] text-[10px] font-extrabold">
                      EN ROUTE
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1 text-[10px]">
                    {[
                      { step: 'Coliform Flag', time: '14:30', done: true },
                      { step: 'WVI >= 65', time: '14:32', done: true },
                      { step: 'Tanker Loaded', time: '14:45', done: true },
                      { step: 'In Transit', time: 'Active', done: true },
                      { step: 'Rationing', time: 'ETA 12m', done: false },
                    ].map((item, idx) => (
                      <div key={item.step} className="flex flex-col items-center text-center">
                        <div className="flex items-center w-full">
                          <div
                            className={`h-0.5 flex-1 ${
                              idx === 0 ? 'bg-transparent' : item.done ? 'bg-[#033F56]' : 'bg-[#91EFF7]'
                            }`}
                          />
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                              item.done
                                ? 'bg-[#033F56] text-[#FE9659]'
                                : 'bg-[#91EFF7]/40 text-[#01658E]'
                            }`}
                          >
                            {item.done ? '✓' : idx + 1}
                          </div>
                          <div
                            className={`h-0.5 flex-1 ${
                              idx === 4 ? 'bg-transparent' : item.done ? 'bg-[#033F56]' : 'bg-[#91EFF7]'
                            }`}
                          />
                        </div>
                        <span className="font-bold text-[#033F56] mt-1">{item.step}</span>
                        <span className="text-[#01658E]">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Always-Visible Compact GIS Symbology Pill */}
              <div className="bg-[#FDFDFD]/90 backdrop-blur-md border border-[#91EFF7] rounded-lg px-3 py-1.5 shadow-xs inline-flex items-center gap-4 text-[11px] font-bold text-[#033F56] self-start">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Safe (&lt;35)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" /> Moderate (35–64)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Critical (&ge;65)
                </span>
              </div>
            </div>

            {/* BOTTOM-RIGHT HUD: Contextual Operations & Triage Dock (Only for LGU & CDRRMO) */}
            {(activeRole === 'LGU' || activeRole === 'CDRRMO') && (
              <div className="pointer-events-auto bg-[#FDFDFD]/95 backdrop-blur-md border border-[#91EFF7] rounded-xl shadow-lg w-full lg:w-[400px] overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-[#91EFF7] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'ALL', label: `All (${filteredPoints.length})` },
                      { id: 'SAFE', label: `Safe (${safePoints.length})` },
                      { id: 'MODERATE', label: `Mod (${moderatePoints.length})` },
                      { id: 'CRITICAL', label: `Crit (${criticalPoints.length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setDockTab(tab.id);
                          setDockCollapsed(false);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                          dockTab === tab.id
                            ? 'bg-[#033F56] text-[#FDFDFD]'
                            : 'text-[#01658E] hover:bg-[#F3FBFD]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDockCollapsed(!dockCollapsed)}
                    className="text-xs font-bold text-[#01658E] hover:text-[#033F56] px-1.5"
                  >
                    {dockCollapsed ? 'Expand ▲' : 'Minimize ▼'}
                  </button>
                </div>

                {!dockCollapsed && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-[#91EFF7]">
                    {opsDockPoints.map((pt) => {
                      const isSelected = activeMapNode?.id === pt.id;
                      return (
                        <div
                          key={pt.id}
                          onClick={() => setActiveMapNode(pt)}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs ${
                            isSelected ? 'bg-[#91EFF7]/30' : 'hover:bg-[#F3FBFD]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-[#033F56] truncate">
                              <span className="text-[#01658E] mr-1.5">{pt.id}</span>
                              {pt.name}
                            </div>
                            <div className="text-[11px] text-[#01658E]">
                              Brgy. {pt.barangay} • {pt.source_type} • Flood {pt.flood_risk_level}/5
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {renderStatusPill(pt.wvi_score)}
                            <ChevronRight className="w-3.5 h-3.5 text-[#01658E]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COMPACT RESIDENT INCIDENT REPORT MODAL */}
        {reportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#033F56]/40 backdrop-blur-xs p-4">
            <div className="bg-[#FDFDFD] border border-[#91EFF7] rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#033F56]">
                  Report Community Water Issue
                </h3>
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="text-[#01658E] hover:text-[#033F56]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-[#01658E] mb-1">Barangay</label>
                  <select
                    value={residentReportBarangay}
                    onChange={(e) => setResidentReportBarangay(e.target.value)}
                    className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-3 py-2 font-bold text-[#033F56]"
                  >
                    {[...new Set(waterPoints.map((p) => p.barangay))].map((brgy) => (
                      <option key={brgy} value={brgy}>
                        Brgy. {brgy}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#01658E] mb-1">
                    Issue Description (Broken pump, muddy runoff, odor)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Handpump lever broken near zone chapel"
                    value={residentReportNote}
                    onChange={(e) => setResidentReportNote(e.target.value)}
                    className="w-full bg-[#F3FBFD] border border-[#91EFF7] rounded-lg px-3 py-2 font-semibold text-[#033F56]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#01658E] hover:bg-[#F3FBFD]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetBrgy = residentReportBarangay;
                    setResidentReportNote('');
                    setReportModalOpen(false);
                    triggerStatusMessage(
                      'success',
                      `Community report in Brgy. ${targetBrgy} logged for BHW verification.`
                    );
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#033F56] text-[#FDFDFD] text-xs font-bold"
                >
                  Submit Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}