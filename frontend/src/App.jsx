import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Droplets,
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
  ShieldCheck,
  Lock,
  Info,
  Globe,
  Box,
} from 'lucide-react';
import {
  getOfflineQueue,
  enqueueInspection,
  clearOfflineQueue,
  saveCachedWaterPoints,
  loadCachedWaterPoints,
} from './utils/offlineQueue';
import {
  INITIAL_NAGA_POINTS,
  INITIAL_INCIDENT_REPORTS,
  ROLE_DEFINITIONS,
} from './data/nagaGeoData';
import BicolMap3D from './components/BicolMap3D';
import BicolAquaLogo from './components/BicolAquaLogo';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

export default function App() {
  // 1. Role Selection & Credential Authentication State (General Roles Only — No Personal Names)
  const [authenticatedRole, setAuthenticatedRole] = useState('COMMUNITY');
  const [pendingRoleTarget, setPendingRoleTarget] = useState(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [authError, setAuthError] = useState('');

  // 2. Active Workspace & 3D Validation Sample Mode
  const [activeWorkspace, setActiveWorkspace] = useState('MAP');
  const [validationMode, setValidationMode] = useState(false);

  // 3. GIS & Telemetry State
  const [waterPoints, setWaterPoints] = useState(INITIAL_NAGA_POINTS);
  const [incidentReports, setIncidentReports] = useState(INITIAL_INCIDENT_REPORTS);
  const [auditLogs, setAuditLogs] = useState([
    { id: 'LOG-01', time: '08:00 AM', actor: 'System', action: 'Initialized Naga City 27-Barangay GIS Baseline' },
    { id: 'LOG-02', time: '09:15 AM', actor: 'Community User', action: 'Submitted water incident report REP-2026-01 (Brgy. Sabang)' },
  ]);
  const [activeMapNode, setActiveMapNode] = useState(null);
  const [cameraCommand, setCameraCommand] = useState(null);

  // 4. Unified Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [dockTab, setDockTab] = useState('ALL');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // 5. Offline Queue & Sync State
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState(getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ active: false, type: '', message: '' });

  // 6. Map Layer Toggles
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showTankerRoutes, setShowTankerRoutes] = useState(true);

  // 7. LGU Field Inspection Form State (General Unit Identifier)
  const [selectedPointId, setSelectedPointId] = useState('NAGA-02');
  const [inspectorUnit, setInspectorUnit] = useState('LGU Field Unit #01');
  const [pumpStatus, setPumpStatus] = useState('Functional');
  const [ph, setPh] = useState('7.0');
  const [tdsPpm, setTdsPpm] = useState('250');
  const [turbidityNtu, setTurbidityNtu] = useState('1.5');
  const [coliformPresent, setColiformPresent] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');

  // 8. Community Incident Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [residentReportBarangay, setResidentReportBarangay] = useState('Sabang');
  const [residentReportIssueType, setResidentReportIssueType] = useState('Turbid / Discolored Water');
  const [residentReportNote, setResidentReportNote] = useState('');

  const isOnline = !simulatedOffline && navigator.onLine;
  const activeRoleObj = ROLE_DEFINITIONS.find((r) => r.role === authenticatedRole) || ROLE_DEFINITIONS[0];
  const canAccessLGU = authenticatedRole === 'LGU_PERSONNEL' || authenticatedRole === 'ADMIN';
  const isAdmin = authenticatedRole === 'ADMIN';

  useEffect(() => {
    fetchPoints();
  }, []);

  useEffect(() => {
    if (activeMapNode) {
      setSelectedPointId(activeMapNode.id);
      setResidentReportBarangay(activeMapNode.barangay);
    }
  }, [activeMapNode]);

  function appendAuditLog(actor, action) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAuditLogs((prev) => [{ id: `LOG-${prev.length + 1}`, time: now, actor, action }, ...prev]);
  }

  // Role Selection -> Credential Authentication Handler
  function handleRoleClick(roleDef) {
    if (roleDef.role === authenticatedRole) return;
    if (!roleDef.requiresCredentials) {
      setAuthenticatedRole('COMMUNITY');
      setActiveWorkspace('MAP');
      appendAuditLog('Community User', 'Switched to public Community User session');
      triggerStatusMessage('info', 'Active Role: Community User (Public Access)');
      return;
    }
    setPendingRoleTarget(roleDef);
    setAccessCodeInput(roleDef.defaultCode);
    setAuthError('');
  }

  function handleAuthenticateSubmit(e) {
    e.preventDefault();
    if (!pendingRoleTarget) return;
    if (accessCodeInput.trim() !== pendingRoleTarget.defaultCode) {
      setAuthError('Invalid access credential. Use the provided role credential code below.');
      return;
    }
    setAuthenticatedRole(pendingRoleTarget.role);
    setActiveWorkspace(pendingRoleTarget.role === 'ADMIN' ? 'ADMIN' : 'LGU');
    appendAuditLog(pendingRoleTarget.label, `Authenticated session for ${pendingRoleTarget.label}`);
    triggerStatusMessage('success', `Authenticated as ${pendingRoleTarget.label}`);
    setPendingRoleTarget(null);
  }

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
    if (!canAccessLGU) {
      triggerStatusMessage('error', 'Authentication Required: Sign in as LGU Personnel or Administrator.');
      return;
    }

    const numPh = parseFloat(ph) || 7.0;
    const numTds = parseFloat(tdsPpm) || 250;
    const numTurb = parseFloat(turbidityNtu) || 1.5;

    const phPenalty = Math.abs(numPh - 7.2) * 14;
    const tdsPenalty = Math.max(0, (numTds - 300) / 12);
    const turbPenalty = numTurb * 4.5;
    const coliPenalty = coliformPresent ? 35 : 0;
    const computedWvi = Math.min(99.5, Math.max(8.0, +(phPenalty + tdsPenalty + turbPenalty + coliPenalty).toFixed(1)));
    const computedTier = computedWvi >= 65 ? 'Critical' : computedWvi >= 35 ? 'Moderate' : 'Safe / Compliant';

    const newRecord = {
      id: `INSP-${Date.now().toString().slice(-4)}`,
      recorded_at: new Date().toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      unit: inspectorUnit,
      status: pumpStatus,
      wvi: computedWvi,
      note: incidentNote || 'Routine water quality parameter log.',
    };

    setWaterPoints((prev) =>
      prev.map((pt) =>
        pt.id === selectedPointId
          ? {
              ...pt,
              status: pumpStatus,
              metrics: {
                ph: numPh,
                tds_ppm: numTds,
                turbidity_ntu: numTurb,
                coliform_present: coliformPresent,
              },
              wvi_score: computedWvi,
              risk_tier: computedTier,
              data_provenance: 'Verified Field Inspection',
              last_updated: new Date().toISOString(),
              history: [newRecord, ...(pt.history || [])],
            }
          : pt
      )
    );

    appendAuditLog(inspectorUnit, `Logged inspection for ${selectedPointId} (WVI ${computedWvi})`);

    const payload = {
      point_id: selectedPointId,
      bhw_name: inspectorUnit,
      status: pumpStatus,
      metrics: {
        ph: numPh,
        tds_ppm: numTds,
        turbidity_ntu: numTurb,
        coliform_present: coliformPresent,
      },
      incident_note: incidentNote,
      recorded_at: new Date().toISOString(),
    };

    if (!isOnline) {
      const updatedQueue = enqueueInspection(payload);
      setQueue(updatedQueue);
      setIncidentNote('');
      triggerStatusMessage('pending', `Saved to offline queue (${updatedQueue.length} pending sync).`);
      return;
    }
    await syncLogsToServer([payload]);
  }

  async function syncLogsToServer(logsToSync) {
    setIsSyncing(true);
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
      triggerStatusMessage('success', 'Field inspection synchronized and updated on 3D map.');
    } catch {
      setIncidentNote('');
      triggerStatusMessage('info', 'Field inspection applied to active session.');
    } finally {
      setIsSyncing(false);
    }
  }

  function handleUpdateReportStatus(reportId, nextStatus) {
    if (!canAccessLGU) return;
    setIncidentReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: nextStatus } : r))
    );
    appendAuditLog(activeRoleObj.label, `Updated report ${reportId} status to "${nextStatus}"`);
    triggerStatusMessage('success', `Report ${reportId} marked as ${nextStatus}.`);
  }

  const criticalPoints = waterPoints.filter((p) => p.wvi_score >= 65);
  const moderatePoints = waterPoints.filter((p) => p.wvi_score >= 35 && p.wvi_score < 65);
  const safePoints = waterPoints.filter((p) => p.wvi_score < 35);
  const totalResidents = waterPoints.reduce((acc, p) => acc + p.population_served, 0);
  const avgWvi = (
    waterPoints.reduce((acc, p) => acc + p.wvi_score, 0) / (waterPoints.length || 1)
  ).toFixed(1);

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

  const opsDockPoints = [...filteredPoints]
    .sort((a, b) => b.wvi_score - a.wvi_score)
    .filter((pt) => {
      if (dockTab === 'SAFE') return pt.wvi_score < 35;
      if (dockTab === 'MODERATE') return pt.wvi_score >= 35 && pt.wvi_score < 65;
      if (dockTab === 'CRITICAL') return pt.wvi_score >= 65;
      return true;
    });

  const renderStatusPill = (score) => {
    if (score >= 65) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          Critical ({score})
        </span>
      );
    }
    if (score >= 35) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Boil Advisory ({score})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
        Safe ({score})
      </span>
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white text-slate-900 font-sans select-none">
      {/* PREDOMINANTLY WHITE PROFESSIONAL GIS HEADER */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 md:px-5 flex items-center justify-between gap-3 shrink-0 z-30 shadow-2xs">
        {/* Left: Brand Identity + Search + 3D Model Validation Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setValidationMode(false);
              setActiveWorkspace('MAP');
              setActiveMapNode(null);
              resetAllFilters();
              setCameraCommand({ action: 'RESET', ts: Date.now() });
            }}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center group-hover:border-[#0284C7] transition-colors">
              <BicolAquaLogo className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-sm tracking-tight text-slate-900">
                  Bicol<span className="text-[#0284C7]">Aqua</span>
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  3D GIS
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5 hidden sm:block">
                Naga City Water Access & Quality Monitoring
              </div>
            </div>
          </button>

          {/* Global Search Input */}
          <div className="hidden md:flex items-center relative ml-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search barangays, wells, kiosks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 focus:border-[#0284C7] focus:bg-white rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 w-52 lg:w-60 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Step 2 Requirement: 1-Click 3D Model Validation Sample Mode */}
          <button
            type="button"
            onClick={() => setValidationMode((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
              validationMode
                ? 'bg-[#0284C7] text-white border-[#0284C7]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Inspect representative 3D Residential, Commercial, and Water Facility models"
          >
            <Box className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">
              {validationMode ? 'Exit 3D Sample' : 'Validate 3D Models'}
            </span>
          </button>
        </div>

        {/* Center: Workspace Views (Filtered by Authenticated Role) */}
        <div className="hidden lg:flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setValidationMode(false);
              setActiveWorkspace('MAP');
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
              activeWorkspace === 'MAP' && !validationMode
                ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Map Overview</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setValidationMode(false);
              setActiveWorkspace('RESIDENT');
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
              activeWorkspace === 'RESIDENT'
                ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Water Point Finder</span>
          </button>

          {canAccessLGU && (
            <>
              <button
                type="button"
                onClick={() => {
                  setValidationMode(false);
                  setActiveWorkspace('LGU');
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                  activeWorkspace === 'LGU'
                    ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>LGU Operations</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setValidationMode(false);
                  setActiveWorkspace('BHW');
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                  activeWorkspace === 'BHW'
                    ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Field Inspection</span>
              </button>
            </>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setValidationMode(false);
                setActiveWorkspace('ADMIN');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                activeWorkspace === 'ADMIN'
                  ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Administration</span>
            </button>
          )}
        </div>

        {/* Right: General Clickable Role Selection Bar (Community User | LGU Personnel | Administrator) */}
        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
          {ROLE_DEFINITIONS.map((roleDef) => {
            const isSelected = authenticatedRole === roleDef.role;
            return (
              <button
                key={roleDef.role}
                type="button"
                onClick={() => handleRoleClick(roleDef)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isSelected
                    ? 'bg-[#0284C7] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                {roleDef.requiresCredentials && !isSelected && (
                  <Lock className="w-3 h-3 text-slate-400" />
                )}
                <span>{roleDef.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* FULL-VIEWPORT 3D GEOSPATIAL CANVAS + WHITE CONTEXTUAL HUDS */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <BicolMap3D
            waterPoints={filteredPoints}
            showFloodLayer={showFloodLayer}
            showTankerRoutes={showTankerRoutes}
            activeMapNode={activeMapNode}
            onNodeSelect={setActiveMapNode}
            cameraCommand={cameraCommand}
            validationMode={validationMode}
          />
        </div>

        {/* GLOBAL FEEDBACK TOAST */}
        {syncStatus.active && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div className="px-4 py-2.5 rounded-xl shadow-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0284C7]" />
              <span>{syncStatus.message}</span>
            </div>
          </div>
        )}

        {/* PERIPHERAL HUD OVERLAY LAYER */}
        <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-5 flex flex-col justify-between">
          {/* TOP ROW */}
          <div className="flex items-start justify-between gap-4">
            {/* TOP-LEFT CONTEXTUAL PANEL */}
            <div className="pointer-events-auto flex flex-col gap-3 max-w-xl">
              {validationMode && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#0284C7]">
                      Step 2 — 3D Asset Validation Sample
                    </span>
                    <button
                      type="button"
                      onClick={() => setValidationMode(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                    >
                      Return to Full Map ✕
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    Orbit and zoom to inspect the 3D geometry, roof overhangs, recessed 3D window frames, doors, storefronts, and steel water-tower lattice before viewing the full Naga City environment.
                  </p>
                </div>
              )}

              {!validationMode && activeWorkspace === 'MAP' && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-sky-50 text-[#0284C7] border border-sky-100">
                        <Droplets className="w-4 h-4" />
                      </span>
                      <div>
                        <h1 className="text-xs font-extrabold text-slate-900">
                          Naga City Community Water Access & Quality GIS
                        </h1>
                        <p className="text-[11px] text-slate-500">
                          Active Role: <strong className="text-slate-800">{activeRoleObj.label}</strong> • {safePoints.length} Safe, {moderatePoints.length} Boil Advisory, {criticalPoints.length} Critical
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* LGU OPERATIONS KPI STRIP */}
              {!validationMode && activeWorkspace === 'LGU' && canAccessLGU && (
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">Residents Served</div>
                    <div className="text-base font-extrabold text-slate-900 mt-0.5">
                      {totalResidents.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">Mean City WVI</div>
                    <div className="text-base font-extrabold text-slate-900 mt-0.5">
                      {avgWvi} <span className="text-xs font-normal text-slate-400">/ 100</span>
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">Tanker Routes</div>
                    <div className="text-base font-extrabold text-red-600 mt-0.5">
                      {criticalPoints.length} Active
                    </div>
                  </div>
                </div>
              )}

              {/* COMMUNITY USER WATER POINT FINDER & INCIDENT TRACKER */}
              {!validationMode && activeWorkspace === 'RESIDENT' && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-md w-full sm:w-[390px] max-h-[calc(100vh-8.5rem)] flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-extrabold text-slate-900">
                          Public Water Point Finder
                        </h2>
                        <p className="text-[11px] text-slate-500">
                          {safePoints.length} of {waterPoints.length} stations safe for drinking
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="text-[11px] font-bold text-[#0284C7] hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#0284C7]"
                      >
                        <option value="ALL">All Facility Types</option>
                        <option value="Public Kiosk">Public Kiosk</option>
                        <option value="Handpump">Handpump</option>
                        <option value="Communal Spring">Communal Spring</option>
                        <option value="School Filtration">School Filtration</option>
                      </select>

                      <select
                        value={tierFilter}
                        onChange={(e) => setTierFilter(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#0284C7]"
                      >
                        <option value="ALL">All Risk Tiers</option>
                        <option value="SAFE">Safe (Under 35)</option>
                        <option value="MODERATE">Advisory (35 to 64)</option>
                        <option value="CRITICAL">Critical (65+)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {filteredPoints.map((pt) => {
                      const isSelected = activeMapNode?.id === pt.id;
                      return (
                        <div
                          key={pt.id}
                          onClick={() => setActiveMapNode(pt)}
                          className={`p-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-sky-50/70 border-l-4 border-l-[#0284C7]'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">{pt.name}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#0284C7]" />
                                Brgy. {pt.barangay} • {pt.source_type}
                              </div>
                            </div>
                            <div className="shrink-0">{renderStatusPill(pt.wvi_score)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Submitted Community Reports ({incidentReports.length})
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1.5">
                      {incidentReports.map((rep) => (
                        <div
                          key={rep.id}
                          className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                        >
                          <div className="truncate">
                            <span className="font-bold text-slate-800">Brgy. {rep.barangay}:</span>{' '}
                            <span className="text-slate-600">{rep.issue_type}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[9.5px] shrink-0">
                            {rep.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setReportModalOpen(true)}
                      className="w-full py-2 px-3 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                      Submit Community Water Issue
                    </button>
                  </div>
                </div>
              )}

              {/* LGU FIELD INSPECTION FORM */}
              {!validationMode && activeWorkspace === 'BHW' && canAccessLGU && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-md w-full sm:w-[380px] max-h-[calc(100vh-8.5rem)] overflow-y-auto p-4 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        LGU Water Quality Field Log
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Updates station WVI & marks Verified Field Inspection
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimulatedOffline(!simulatedOffline)}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        isOnline
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {isOnline ? 'Online' : `Offline (${queue.length})`}
                    </button>
                  </div>

                  <form onSubmit={handleLogSubmit} className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Water Facility
                      </label>
                      <select
                        value={selectedPointId}
                        onChange={(e) => {
                          setSelectedPointId(e.target.value);
                          const found = waterPoints.find((p) => p.id === e.target.value);
                          if (found) setActiveMapNode(found);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                      >
                        {waterPoints.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.id} — {pt.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Hardware Status
                        </label>
                        <select
                          value={pumpStatus}
                          onChange={(e) => setPumpStatus(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-semibold text-slate-800 outline-none"
                        >
                          <option value="Functional">Functional</option>
                          <option value="Under Repair">Under Repair</option>
                          <option value="Abandoned">Abandoned</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Field Unit ID</label>
                        <input
                          type="text"
                          value={inspectorUnit}
                          onChange={(e) => setInspectorUnit(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-semibold text-slate-800 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">pH</label>
                        <input
                          type="number"
                          step="0.1"
                          value={ph}
                          onChange={(e) => setPh(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">TDS (ppm)</label>
                        <input
                          type="number"
                          value={tdsPpm}
                          onChange={(e) => setTdsPpm(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Turbidity</label>
                        <input
                          type="number"
                          step="0.1"
                          value={turbidityNtu}
                          onChange={(e) => setTurbidityNtu(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Field Observation Note
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Residual chlorine verified at 0.4 mg/L"
                        value={incidentNote}
                        onChange={(e) => setIncidentNote(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800"
                      />
                    </div>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-red-50 border border-red-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={coliformPresent}
                        onChange={(e) => setColiformPresent(e.target.checked)}
                        className="w-4 h-4 accent-red-600"
                      />
                      <span className="font-bold text-red-700">
                        Positive Coliform Indicator (+35 WVI)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSyncing}
                      className="w-full py-2.5 rounded-lg font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white transition-colors"
                    >
                      {isOnline ? 'Submit Inspection & Update Map' : 'Save Inspection Offline'}
                    </button>
                  </form>
                </div>
              )}

              {/* ADMINISTRATOR GOVERNANCE CONSOLE */}
              {!validationMode && activeWorkspace === 'ADMIN' && isAdmin && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-md w-full sm:w-[440px] max-h-[calc(100vh-8.5rem)] overflow-y-auto p-4 space-y-4">
                  <div className="border-b border-slate-200 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        Administrator Governance Console
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Role access structure, report triage & system audit log
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                      ADMIN
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Role Access Policies
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden text-xs">
                      {ROLE_DEFINITIONS.map((r) => (
                        <div key={r.role} className="p-2.5 bg-white flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-800">{r.label}</div>
                            <div className="text-[10px] text-slate-500">{r.organization}</div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                            {r.permissions.length} Permissions
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Community Incident Report Moderation
                    </div>
                    <div className="space-y-2">
                      {incidentReports.map((rep) => (
                        <div key={rep.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              {rep.id} • Brgy. {rep.barangay}
                            </span>
                            <span className="text-[10px] font-bold text-[#0284C7]">{rep.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">{rep.description}</p>
                          <div className="flex gap-1.5 pt-1">
                            {['Under LGU Review', 'Tanker Dispatched', 'Resolved'].map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleUpdateReportStatus(rep.id, st)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  rep.status === st
                                    ? 'bg-[#0284C7] text-white border-[#0284C7]'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      System Activity Log
                    </div>
                    <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50 text-[11px]">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="px-2.5 py-1.5">
                          <span className="font-bold text-slate-700">[{log.time}] {log.actor}:</span>{' '}
                          <span className="text-slate-600">{log.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* TOP-RIGHT HUD: Camera/Layer Controls + Selected Facility Inspector */}
            <div className="pointer-events-auto flex items-start gap-2.5">
              <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1.5 shadow-sm flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setCameraCommand({ action: 'ZOOM_IN', ts: Date.now() })}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Zoom In"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCameraCommand({ action: 'ZOOM_OUT', ts: Date.now() })}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Zoom Out"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValidationMode(false);
                    setActiveMapNode(null);
                    setCameraCommand({ action: 'RESET', ts: Date.now() });
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Reset Urban Core Camera"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValidationMode(false);
                    setActiveMapNode(null);
                    setCameraCommand({ action: 'OVERVIEW', ts: Date.now() });
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Full 27-Barangay Overview"
                >
                  <Globe className="w-4 h-4" />
                </button>
                <div className="h-px bg-slate-200 my-0.5" />
                <button
                  type="button"
                  onClick={() => setShowFloodLayer(!showFloodLayer)}
                  className={`p-2 rounded-lg transition-colors ${
                    showFloodLayer ? 'bg-[#0284C7] text-white' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                  title="Toggle Flood Susceptibility Layer"
                >
                  <Layers className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTankerRoutes(!showTankerRoutes)}
                  className={`p-2 rounded-lg transition-colors ${
                    showTankerRoutes ? 'bg-[#0284C7] text-white' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                  title="Toggle Tanker Dispatch Corridors"
                >
                  <Truck className="w-4 h-4" />
                </button>
              </div>

              {activeMapNode && !validationMode && (
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-lg w-76 sm:w-80 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0284C7]">
                          {activeMapNode.id} • {activeMapNode.source_type}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-semibold">
                          {activeMapNode.data_provenance}
                        </span>
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 leading-snug mt-0.5">
                        {activeMapNode.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Brgy. {activeMapNode.barangay} • {activeMapNode.population_served} residents
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMapNode(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      {renderStatusPill(activeMapNode.wvi_score)}
                      <span className="text-xs font-bold text-slate-700">
                        WVI {activeMapNode.wvi_score} / 100
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, activeMapNode.wvi_score)}%`,
                          backgroundColor:
                            activeMapNode.wvi_score >= 65
                              ? '#DC2626'
                              : activeMapNode.wvi_score >= 35
                              ? '#D97706'
                              : '#059669',
                        }}
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs border-t border-slate-100 pt-1">
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Hardware Status</span>
                      <span className="font-semibold text-slate-800">{activeMapNode.status}</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Coliform Bacteria</span>
                      <span
                        className={`font-semibold ${
                          activeMapNode.metrics.coliform_present ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {activeMapNode.metrics.coliform_present ? 'Positive (Hazard)' : 'Negative'}
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">pH / TDS / Turbidity</span>
                      <span className="font-semibold text-slate-800">
                        {activeMapNode.metrics.ph} / {activeMapNode.metrics.tds_ppm}ppm /{' '}
                        {activeMapNode.metrics.turbidity_ntu}NTU
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResidentReportBarangay(activeMapNode.barangay);
                        setReportModalOpen(true);
                      }}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <Megaphone className="w-3.5 h-3.5 text-[#0284C7]" />
                      Report Issue
                    </button>

                    {canAccessLGU && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPointId(activeMapNode.id);
                          setActiveWorkspace('BHW');
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold"
                      >
                        Log Inspection
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM ROW */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4">
            <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg px-3.5 py-2 shadow-2xs flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-700 self-start">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                WVI Symbology:
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Safe (Under 35)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Advisory (35–64)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Critical (65+)
              </span>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500">
                <Info className="w-3 h-3 text-[#0284C7]" />
                OSM Landmarks + Representative Urban Blocks • Baseline telemetry simulated unless marked Verified
              </span>
            </div>

            {!validationMode && activeWorkspace === 'LGU' && canAccessLGU && (
              <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-md w-full lg:w-[400px] overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'ALL', label: `All (${filteredPoints.length})` },
                      { id: 'SAFE', label: `Safe (${safePoints.length})` },
                      { id: 'MODERATE', label: `Advisory (${moderatePoints.length})` },
                      { id: 'CRITICAL', label: `Critical (${criticalPoints.length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setDockTab(tab.id);
                          setDockCollapsed(false);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          dockTab === tab.id
                            ? 'bg-[#0284C7] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDockCollapsed(!dockCollapsed)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-1.5"
                  >
                    {dockCollapsed ? 'Expand ▲' : 'Minimize ▼'}
                  </button>
                </div>

                {!dockCollapsed && (
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {opsDockPoints.map((pt) => (
                      <div
                        key={pt.id}
                        onClick={() => setActiveMapNode(pt)}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">
                            <span className="text-[#0284C7] mr-1.5">{pt.id}</span>
                            {pt.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Brgy. {pt.barangay} • {pt.source_type}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {renderStatusPill(pt.wvi_score)}
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ROLE AUTHENTICATION MODAL (Enforces Credential Check on Role Selection) */}
        {pendingRoleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <form
              onSubmit={handleAuthenticateSubmit}
              className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-sky-50 text-[#0284C7]">
                    <Lock className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Authenticate as {pendingRoleTarget.label}
                    </h3>
                    <p className="text-[11px] text-slate-500">{pendingRoleTarget.organization}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRoleTarget(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600">{pendingRoleTarget.description}</p>

              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-700">
                  Role Access Credential Code
                </label>
                <input
                  type="text"
                  value={accessCodeInput}
                  onChange={(e) => setAccessCodeInput(e.target.value)}
                  placeholder="Enter access credential..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-slate-900 outline-none focus:border-[#0284C7]"
                />
                <div className="text-[11px] text-slate-500">
                  Demo evaluation credential: <strong className="font-mono text-slate-800">{pendingRoleTarget.defaultCode}</strong>
                </div>
                {authError && <p className="text-xs font-semibold text-red-600">{authError}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingRoleTarget(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold"
                >
                  Verify & Sign In
                </button>
              </div>
            </form>
          </div>
        )}

        {/* COMMUNITY INCIDENT REPORT MODAL */}
        {reportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Submit Community Water Issue
                </h3>
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Barangay</label>
                  <select
                    value={residentReportBarangay}
                    onChange={(e) => setResidentReportBarangay(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800"
                  >
                    {[...new Set(waterPoints.map((p) => p.barangay))].map((brgy) => (
                      <option key={brgy} value={brgy}>
                        Brgy. {brgy}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Issue Category</label>
                  <select
                    value={residentReportIssueType}
                    onChange={(e) => setResidentReportIssueType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800"
                  >
                    <option value="Turbid / Discolored Water">Turbid / Discolored Water</option>
                    <option value="Broken Handpump Lever / Valve">Broken Handpump Lever / Valve</option>
                    <option value="Foul Odor or Taste">Foul Odor or Taste</option>
                    <option value="Floodwater Submersion">Floodwater Submersion</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Observation Details
                  </label>
                  <input
                    type="text"
                    placeholder="Describe water condition or pump issue..."
                    value={residentReportNote}
                    onChange={(e) => setResidentReportNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newRep = {
                      id: `REP-2026-0${incidentReports.length + 1}`,
                      point_id: activeMapNode?.id || 'NAGA-02',
                      barangay: residentReportBarangay,
                      reporter_role: activeRoleObj.label,
                      issue_type: residentReportIssueType,
                      description: residentReportNote || residentReportIssueType,
                      status: 'Pending LGU Review',
                      submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    };
                    setIncidentReports((prev) => [newRep, ...prev]);
                    appendAuditLog(activeRoleObj.label, `Submitted community report ${newRep.id} in Brgy. ${residentReportBarangay}`);
                    setResidentReportNote('');
                    setReportModalOpen(false);
                    triggerStatusMessage('success', `Report ${newRep.id} submitted for Brgy. ${residentReportBarangay}.`);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold"
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