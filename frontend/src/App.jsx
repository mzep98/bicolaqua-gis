import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Droplets,
  CheckCircle2,
  MapPin,
  Layers,
  Truck,
  LayoutDashboard,
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
  Globe,
  Sun,
  CloudRain,
  Waves,
  Radio,
  Stethoscope,
  PlusCircle,
  Wifi,
  WifiOff,
  BarChart3,
  Bell,
  AlertTriangle,
  Camera,
  Download,
  Wallet,
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
  INITIAL_ADVISORIES_FALLBACK,
  INITIAL_EVACUATION_CAMPS_FALLBACK,
  HYGIENE_AND_CONSERVATION_TIPS,
  NAGA_BARANGAY_METADATA,
  ROLE_DEFINITIONS,
  calculateWaterPointWvi,
  buildBarangayChoroplethGeoJson,
  getFacilityHazardCrossRef,
} from './data/nagaGeoData';
import BicolMap3D from './components/BicolMap3D';
import BicolAquaLogo from './components/BicolAquaLogo';
import TelemetryInspectorDrawer from './components/TelemetryInspectorDrawer';

const API_ROOT = 'http://127.0.0.1:8000/api';
const API_BASE = 'http://127.0.0.1:8000/api/v1';

const DRAWER_ID_BY_ROLE = {
  RESIDENT: 'RESIDENT',
  BHW: 'BHW',
  CDRRMO: 'CDRRMO',
  LGU_COORDINATOR: 'WASH',
};

const HeaderSearchBox = React.memo(function HeaderSearchBox({
  locations,
  externalValue,
  onDebouncedQueryChange,
  onSelectLocation,
  inputClassName,
  containerClassName = '',
}) {
  const [inputValue, setInputValue] = useState(externalValue || '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (externalValue === '') setInputValue('');
  }, [externalValue]);

  useEffect(() => {
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      clearTimeout(debounceRef.current);
    };
  }, []);

  const matches = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const loc of locations) {
      const idx = loc.searchText.indexOf(q);
      if (idx === -1) continue;
      const prefixBoost = loc.title.toLowerCase().startsWith(q) || loc.primaryName.startsWith(q) ? 0 : 10;
      const brgyBoost = loc.kind === 'BARANGAY' ? 0 : 2;
      scored.push({ loc, rank: prefixBoost + brgyBoost + idx });
    }
    scored.sort((a, b) => a.rank - b.rank || a.loc.title.localeCompare(b.loc.title));
    return scored.slice(0, 8).map((s) => s.loc);
  }, [inputValue, locations]);

  const handleChange = (e) => {
    const next = e.target.value;
    setInputValue(next);
    setIsOpen(true);
    setActiveIndex(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onDebouncedQueryChange(next);
    }, 180);
  };

  const commitSelection = (item) => {
    if (!item) return;
    clearTimeout(debounceRef.current);
    setInputValue(item.title);
    setIsOpen(false);
    onDebouncedQueryChange('');
    onSelectLocation(item);
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    setInputValue('');
    setIsOpen(false);
    onDebouncedQueryChange('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitSelection(matches[activeIndex] || matches[0]);
    }
  };

  const showDropdown = isOpen && inputValue.trim().length > 0;

  return (
    <div ref={wrapRef} className={`relative ${containerClassName}`}>
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
      <input
        type="text"
        placeholder="Search barangays, kiosks..."
        value={inputValue}
        onChange={handleChange}
        onFocus={() => {
          if (inputValue.trim()) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search barangays and water kiosks"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        className={inputClassName}
      />
      {inputValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {showDropdown && (
        <div
          role="listbox"
          aria-label="Matching locations"
          className="hud-enter absolute left-0 top-full mt-2 w-[310px] max-w-[calc(100vw-24px)] rounded-2xl p-1.5 bg-white/95 backdrop-blur-md border border-slate-900/[0.10] shadow-xl z-50 max-h-72 overflow-y-auto"
        >
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-[12px] text-slate-500">
              No barangays or kiosks match &ldquo;{inputValue.trim()}&rdquo;
            </div>
          ) : (
            matches.map((item, idx) => {
              const isHighlighted = idx === activeIndex;
              const badgeCls =
                item.wvi >= 65
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : item.wvi >= 35
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200';
              return (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitSelection(item);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-[10px] flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-sky-50 text-[#0369A1]' : 'hover:bg-slate-100/80 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold truncate flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-[#0284C7] shrink-0" strokeWidth={2.2} />
                      <span className="truncate">{item.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate pl-4.5">
                      {item.subtitle}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border tabular-nums shrink-0 ${badgeCls}`}>
                    WVI {Number.isFinite(item.wvi) ? item.wvi : '—'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

function RoleDrawerShell({
  kicker,
  title,
  subtitle = null,
  headerRight = null,
  headerExtra = null,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  children,
}) {
  const [railExpanded, setRailExpanded] = useState(false);

  return (
    <div
      className={`hud-enter hud-surface pointer-events-auto absolute left-3 sm:left-4 top-[68px] z-30 rounded-2xl w-[calc(100%-1.5rem)] ${
        railExpanded ? 'sm:w-[508px]' : 'sm:w-[432px]'
      } max-h-[calc(100dvh-116px)] flex flex-col sm:flex-row overflow-hidden transition-[width] duration-200`}
    >
      {/* Combined Option A1 (Compact Icon + Micro-Label) & Option A2 (Expandable Full Title) Left Tab Rail */}
      <nav
        aria-label={`${title} sections`}
        className={`bg-slate-50/95 border-b sm:border-b-0 sm:border-r border-slate-900/[0.08] shrink-0 flex sm:flex-col justify-between p-1.5 gap-1 overflow-x-auto sm:overflow-x-visible transition-[width] duration-200 ${
          railExpanded ? 'sm:w-[148px]' : 'sm:w-[74px]'
        }`}
      >
        <div role="tablist" className="flex sm:flex-col gap-1 min-w-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={tab.fullTitle}
                onClick={() => onTabChange(tab.id)}
                className={`hud-press rounded-xl cursor-pointer transition-colors shrink-0 ${
                  railExpanded
                    ? 'flex items-center justify-start gap-2 px-2.5 py-2 text-left'
                    : 'flex flex-col items-center justify-center gap-1 px-2 py-2 text-center'
                } ${
                  isActive
                    ? 'bg-[#0284C7] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2.1} />
                <span
                  className={`leading-tight ${
                    railExpanded
                      ? 'text-[11.5px] font-semibold truncate'
                      : 'text-[10px] font-bold tracking-tight whitespace-nowrap'
                  }`}
                >
                  {railExpanded ? tab.fullTitle : tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setRailExpanded((v) => !v)}
          aria-label={railExpanded ? 'Collapse navigation labels' : 'Expand navigation labels'}
          className="hidden sm:flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              railExpanded ? 'rotate-90' : '-rotate-90'
            }`}
            strokeWidth={2.2}
          />
          <span>{railExpanded ? 'Collapse' : 'Labels'}</span>
        </button>
      </nav>

      {/* Right Content Pane (100% Open Sections, Scoped Actions, Zero Accordions) */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-900/[0.08] bg-white/95 shrink-0 space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 leading-tight">
                {kicker}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {headerRight}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={`Close ${title}`}
                  className="w-7 h-7 rounded-[10px] hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer hud-press"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h2 className="text-[16px] font-bold tracking-[-0.02em] text-slate-900 leading-snug">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11.5px] font-medium text-slate-500 leading-snug tabular-nums">
                {subtitle}
              </p>
            )}
          </div>
          {headerExtra}
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {children}
        </div>
      </div>
    </div>
  );
}

const RoleDrawerBodyContext = React.createContext(null);
function RoleDrawerBody() {
  return React.useContext(RoleDrawerBodyContext);
}

export default function App() {
  // 1. 4 Xylem System Actors & Credential Authentication State
  const [authenticatedRole, setAuthenticatedRole] = useState('RESIDENT');
  const [pendingRoleTarget, setPendingRoleTarget] = useState(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [authError, setAuthError] = useState('');

  // 2. Active Left Drawer (Mutually Exclusive: null | 'RESIDENT' | 'BHW' | 'CDRRMO' | 'WASH')
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedTab, setFeedTab] = useState('ALL');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // 3. GIS, Xylem Actors & Telemetry State
  const [waterPoints, setWaterPoints] = useState(INITIAL_NAGA_POINTS);
  const [barangaysData, setBarangaysData] = useState([]);
  const [advisories, setAdvisories] = useState(INITIAL_ADVISORIES_FALLBACK);
  const [evacuationCamps, setEvacuationCamps] = useState(INITIAL_EVACUATION_CAMPS_FALLBACK);
  const [scenarioMode, setScenarioMode] = useState('baseline');
  const typhoonActive = scenarioMode === 'typhoon';
  const [backendConnected, setBackendConnected] = useState(false);
  const [criticalThreshold, setCriticalThreshold] = useState(65);
  const [advisoryThreshold, setAdvisoryThreshold] = useState(35);
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
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [authShakeTick, setAuthShakeTick] = useState(0);
  const [railTooltip, setRailTooltip] = useState(null);
  const roleMenuRef = useRef(null);
  const railWarmRef = useRef(false);
  const railTimerRef = useRef(null);
  const railCooldownRef = useRef(null);

  useEffect(() => {
    if (activeDrawer !== null) setAnalyticsOpen(false);
  }, [activeDrawer]);

  useEffect(() => {
    const handleDocClick = (e) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target)) {
        setRoleMenuOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setRoleMenuOpen(false);
        setRailTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleEsc);
      clearTimeout(railTimerRef.current);
      clearTimeout(railCooldownRef.current);
    };
  }, []);

  const showRailTip = useCallback((label, immediate = false) => {
    clearTimeout(railTimerRef.current);
    clearTimeout(railCooldownRef.current);
    if (immediate || railWarmRef.current) {
      railWarmRef.current = true;
      setRailTooltip(label);
    } else {
      railTimerRef.current = setTimeout(() => {
        railWarmRef.current = true;
        setRailTooltip(label);
      }, 320);
    }
  }, []);

  const hideRailTip = useCallback(() => {
    clearTimeout(railTimerRef.current);
    setRailTooltip(null);
    railCooldownRef.current = setTimeout(() => {
      railWarmRef.current = false;
    }, 350);
  }, []);

  // 5. Offline Queue & Sync State
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState(getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ active: false, type: '', message: '' });

  // 6. Map Layer Toggles
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showTankerRoutes, setShowTankerRoutes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // 7. LGU Field Inspection Form State (General Unit Identifier)
  const [selectedPointId, setSelectedPointId] = useState('NAGA-02');
  const [inspectorUnit, setInspectorUnit] = useState('LGU Field Unit #01');
  const [pumpStatus, setPumpStatus] = useState('Functional');
  const [ph, setPh] = useState('7.0');
  const [tdsPpm, setTdsPpm] = useState('250');
  const [turbidityNtu, setTurbidityNtu] = useState('1.5');
  const [coliformPresent, setColiformPresent] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');

  // 8. Community Incident Report Modal State + Actor Form States
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [residentReportBarangay, setResidentReportBarangay] = useState('Sabang');
  const [residentReportIssueType, setResidentReportIssueType] = useState('Muddy Runoff');
  const [residentReportNote, setResidentReportNote] = useState('');
  const [bhwSanitationHazard, setBhwSanitationHazard] = useState(false);

  const [advBarangay, setAdvBarangay] = useState('Sabang');
  const [advLevel, setAdvLevel] = useState('Boil-Water Advisory');
  const [advMessage, setAdvMessage] = useState('');

  const [newFacName, setNewFacName] = useState('');
  const [newFacBarangay, setNewFacBarangay] = useState('San Felipe');
  const [newFacSourceType, setNewFacSourceType] = useState('Solar Pump');
  const [newFacLat, setNewFacLat] = useState('13.6380');
  const [newFacLng, setNewFacLng] = useState('123.2040');
  const [newFacPop, setNewFacPop] = useState('750');
  const [coordPolicyMsg, setCoordPolicyMsg] = useState('');

  // Complete Xylem Spec States (BHW Photo & Survey, CDRRMO Triage, WASH Resource Allocation)
  const [bhwPhotoName, setBhwPhotoName] = useState('');
  const [bhwPipedAccessPct, setBhwPipedAccessPct] = useState('74');
  const [bhwFetchingDistM, setBhwFetchingDistM] = useState('120');
  const [triageFilter, setTriageFilter] = useState('ALL');
  const [allocBarangay, setAllocBarangay] = useState('Mabolo');
  const [allocKits, setAllocKits] = useState('15');
  const [allocBudgetPhp, setAllocBudgetPhp] = useState('85000');
  const [washAllocations, setWashAllocations] = useState([
    { id: 'ALLOC-01', barangay: 'Mabolo', kits: 18, budgetPhp: 95000, status: 'Approved' },
    { id: 'ALLOC-02', barangay: 'Sabang', kits: 24, budgetPhp: 120000, status: 'Deployed' },
  ]);

  const isOnline = !simulatedOffline && navigator.onLine;
  const activeRoleObj = ROLE_DEFINITIONS.find((r) => r.role === authenticatedRole) || ROLE_DEFINITIONS[0];
  const isResident = authenticatedRole === 'RESIDENT';
  const [residentTab, setResidentTab] = useState('kiosks');
  const [bhwTab, setBhwTab] = useState('fieldkit');
  const [cdrrmoTab, setCdrrmoTab] = useState('dispatch');
  const [washTab, setWashTab] = useState('equity');

  const isBHW = authenticatedRole === 'BHW';
  const isCDRRMO = authenticatedRole === 'CDRRMO';
  const isCoordinator = authenticatedRole === 'LGU_COORDINATOR';
  const canAccessLGU = authenticatedRole !== 'RESIDENT';
  const isAdmin = authenticatedRole === 'LGU_COORDINATOR';
  const isLeftDrawerOpen =
    activeDrawer === 'RESIDENT' ||
    (activeDrawer === 'BHW' && isBHW) ||
    (activeDrawer === 'CDRRMO' && (isCDRRMO || isCoordinator)) ||
    (activeDrawer === 'WASH' && isCoordinator);
  const isRightDockOpen =
    isDesktop &&
    (activeDrawer === 'CDRRMO' || activeDrawer === 'WASH') &&
    (isCDRRMO || isCoordinator);

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

  // Role Selection -> Credential Authentication & Mutually Exclusive Drawer Toggle
  function handleRoleClick(roleDef) {
    const targetDrawer = DRAWER_ID_BY_ROLE[roleDef.role] || null;
    if (roleDef.role === 'RESIDENT') {
      if (authenticatedRole === 'RESIDENT') {
        setActiveDrawer((prev) => (prev === 'RESIDENT' ? null : 'RESIDENT'));
      } else {
        setAuthenticatedRole('RESIDENT');
        setActiveDrawer('RESIDENT');
        appendAuditLog('Community Resident', 'Switched to public Community Resident portal');
        triggerStatusMessage('info', 'Active Actor: Community Resident (Public Access)');
      }
      return;
    }
    if (roleDef.role === authenticatedRole) {
      if (targetDrawer) {
        setActiveDrawer((prev) => (prev === targetDrawer ? null : targetDrawer));
      }
      return;
    }
    if (!roleDef.requiresCredentials) {
      setAuthenticatedRole(roleDef.role);
      setActiveDrawer(targetDrawer);
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
      setAuthShakeTick((n) => n + 1);
      return;
    }
    setAuthenticatedRole(pendingRoleTarget.role);
    setActiveDrawer(DRAWER_ID_BY_ROLE[pendingRoleTarget.role] || null);
    appendAuditLog(pendingRoleTarget.label, `Authenticated actor session for ${pendingRoleTarget.label}`);
    triggerStatusMessage('success', `Authenticated as ${pendingRoleTarget.label}`);
    setPendingRoleTarget(null);
  }

  function applyLiveSnapshot(facilities, barangays, reports = null) {
    if (Array.isArray(facilities) && facilities.length > 0) {
      const seedCoordsById = new Map(INITIAL_NAGA_POINTS.map((p) => [p.id, p]));
      const alignedFacilities = facilities.map((fac) => {
        const seed = seedCoordsById.get(fac.id);
        return seed ? { ...fac, lat: seed.lat, lng: seed.lng } : fac;
      });
      setWaterPoints(alignedFacilities);
      saveCachedWaterPoints(alignedFacilities);
      setActiveMapNode((prev) => {
        if (!prev) return null;
        if (prev.isBarangay) {
          const b = (barangays || []).find((x) => x.name.toLowerCase() === prev.barangay.toLowerCase());
          return b ? { ...prev, wvi_score: b.wvi_score, facility_count: b.active_facility_count } : prev;
        }
        const updated = alignedFacilities.find((p) => p.id === prev.id);
        return updated ? { ...updated, hazardZone: prev.hazardZone } : prev;
      });
    }
    if (Array.isArray(barangays)) {
      setBarangaysData(barangays);
    }
    if (Array.isArray(reports)) {
      setIncidentReports(reports);
    }
  }

  async function fetchPoints() {
    if (!isOnline) {
      const cached = loadCachedWaterPoints();
      setWaterPoints(cached.length ? cached : INITIAL_NAGA_POINTS);
      setBackendConnected(false);
      return;
    }
    try {
      const [facRes, brgyRes, incRes, advRes, campRes] = await Promise.all([
        fetch(`${API_ROOT}/facilities`),
        fetch(`${API_ROOT}/barangays`),
        fetch(`${API_ROOT}/incidents`),
        fetch(`${API_ROOT}/advisories`),
        fetch(`${API_ROOT}/evacuation-camps`),
      ]);
      const facilities = await facRes.json();
      const brgyPayload = await brgyRes.json();
      const incidents = await incRes.json();
      if (advRes.ok) setAdvisories(await advRes.json());
      if (campRes.ok) setEvacuationCamps(await campRes.json());
      setBackendConnected(true);
      setScenarioMode(
        brgyPayload?.scenario || (brgyPayload?.typhoon_active ? 'typhoon' : 'baseline')
      );
      if (brgyPayload?.thresholds) {
        setCriticalThreshold(brgyPayload.thresholds.critical_wvi ?? 65);
        setAdvisoryThreshold(brgyPayload.thresholds.advisory_wvi ?? 35);
      }
      applyLiveSnapshot(facilities, brgyPayload?.barangays || [], incidents);
    } catch {
      setBackendConnected(false);
      const cached = loadCachedWaterPoints();
      setWaterPoints(cached.length ? cached : INITIAL_NAGA_POINTS);
    }
  }

  async function submitCommunityIssue({ barangay, pointId = null, category, issueType, description }) {
    const resolvedCategory = category || issueType || 'Muddy Runoff';
    const matchingFac =
      pointId != null
        ? waterPoints.find((p) => p.id === pointId)
        : activeMapNode && !activeMapNode.isBarangay && activeMapNode.barangay === barangay
        ? activeMapNode
        : waterPoints.find((p) => p.barangay.toLowerCase() === barangay.toLowerCase());

    const payload = {
      facility_id: matchingFac?.id || null,
      barangay_name: barangay,
      category: resolvedCategory,
      description: description || resolvedCategory,
      reporter_role: activeRoleObj.label,
    };

    try {
      if (!isOnline) throw new Error('Offline mode');
      const res = await fetch(`${API_ROOT}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Incident request failed');
      const data = await res.json();
      setBackendConnected(true);
      if (Array.isArray(data.incidents)) {
        setIncidentReports(data.incidents);
      } else if (data.incident) {
        setIncidentReports((prev) => [data.incident, ...prev]);
      }
      applyLiveSnapshot(data.facilities, data.barangays);
      appendAuditLog(activeRoleObj.label, `Reported ${resolvedCategory} (${data.incident?.id || ''}) in Brgy. ${barangay}`);
      triggerStatusMessage('success', `Incident reported — WVI & dispatch updated for Brgy. ${barangay}.`);
    } catch {
      const newRep = {
        id: `REP-2026-0${incidentReports.length + 1}`,
        point_id: matchingFac?.id || 'BARANGAY-ZONE',
        facility_id: matchingFac?.id || 'BARANGAY-ZONE',
        barangay,
        barangay_name: barangay,
        reporter_role: activeRoleObj.label,
        issue_type: resolvedCategory,
        category: resolvedCategory,
        description: description || resolvedCategory,
        status: 'Pending LGU Review',
        submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setIncidentReports((prev) => [newRep, ...prev]);
      appendAuditLog(activeRoleObj.label, `Submitted local incident ${newRep.id} in Brgy. ${barangay}`);
      triggerStatusMessage('success', `Incident ${newRep.id} saved locally (offline fallback).`);
    }
  }

  async function handleCommunityReportSubmit() {
    await submitCommunityIssue({
      barangay: residentReportBarangay,
      category: residentReportIssueType,
      description: residentReportNote || residentReportIssueType,
    });
    setResidentReportNote('');
    setReportModalOpen(false);
  }

  async function handleSubmitFieldKit(facilityId, kitData) {
    const targetPt = waterPoints.find((pt) => pt.id === facilityId) || INITIAL_NAGA_POINTS[0];
    const numPh = Number(kitData.ph) || 7.0;
    const numTds = Number(kitData.tds_ppm) || 240;
    const numTurb = Number(kitData.turbidity_ntu) || 1.5;
    const coliformPos = Boolean(kitData.coliform_positive);
    const hwStatus = kitData.hardware_status || 'Functional';
    const note =
      kitData.note ||
      (kitData.sanitation_hazard
        ? 'Sanitation / runoff hazard flagged near intake.'
        : 'Routine BHW field-kit test verified.');

    try {
      if (!isOnline) throw new Error('Offline mode');
      const res = await fetch(`${API_ROOT}/facilities/${facilityId}/field-kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ph: numPh,
          tds_ppm: numTds,
          turbidity_ntu: numTurb,
          coliform_positive: coliformPos,
          hardware_status: hwStatus,
          bhw_name: inspectorUnit || 'BHW Field Unit',
          note,
        }),
      });
      if (!res.ok) throw new Error('Field-kit patch failed');
      const data = await res.json();
      setBackendConnected(true);
      applyLiveSnapshot(data.facilities, data.barangays);
      appendAuditLog(inspectorUnit, `Logged BHW field-kit for ${facilityId} (WVI ${data.facility?.wvi_score})`);
      triggerStatusMessage('success', `Field-kit saved for ${facilityId} (WVI ${data.facility?.wvi_score}, Verified).`);
    } catch {
      const { wvi_score: computedWvi, risk_tier: computedTier } = calculateWaterPointWvi({
        ...targetPt,
        status: hwStatus,
        metrics: {
          ...targetPt.metrics,
          ph: numPh,
          tds_ppm: numTds,
          turbidity_ntu: numTurb,
          coliform_present: coliformPos,
        },
      });
      const updated = waterPoints.map((pt) =>
        pt.id === facilityId
          ? {
              ...pt,
              status: hwStatus,
              verified: true,
              wvi_score: computedWvi,
              risk_tier: computedTier,
              data_provenance: 'BHW Field-Kit (Local Offline Queue)',
              metrics: {
                ...pt.metrics,
                ph: numPh,
                tds_ppm: numTds,
                turbidity_ntu: numTurb,
                coliform_present: coliformPos,
              },
              last_updated: new Date().toISOString(),
            }
          : pt
      );
      applyLiveSnapshot(updated, barangaysData);
      const updatedQueue = enqueueInspection({
        point_id: facilityId,
        bhw_name: inspectorUnit || 'BHW Field Unit',
        status: hwStatus,
        metrics: {
          ph: numPh,
          tds_ppm: numTds,
          turbidity_ntu: numTurb,
          coliform_present: coliformPos,
        },
        incident_note: note,
        recorded_at: new Date().toISOString(),
      });
      setQueue(updatedQueue);
      appendAuditLog(inspectorUnit, `Queued offline field-kit test for ${facilityId} (WVI ${computedWvi})`);
      triggerStatusMessage('pending', `Saved offline (${updatedQueue.length} pending PWA sync) — map WVI updated.`);
    }
  }

  async function handleBroadcastAdvisory({ barangay_name, level, message }) {
    const cleanMsg =
      (message || '').trim() ||
      `${level} issued for Brgy. ${barangay_name}. Boil drinking water 3+ min or draw from CDRRMO tanker.`;
    try {
      if (!isOnline) throw new Error('Offline mode');
      const res = await fetch(`${API_ROOT}/advisories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barangay_name,
          level,
          message: cleanMsg,
          issued_by: activeRoleObj.label,
        }),
      });
      if (!res.ok) throw new Error('Advisory broadcast failed');
      const data = await res.json();
      setBackendConnected(true);
      if (Array.isArray(data.advisories)) setAdvisories(data.advisories);
      appendAuditLog(activeRoleObj.label, `Broadcasted ${level} for Brgy. ${barangay_name}`);
      triggerStatusMessage('success', `${level} broadcasted for Brgy. ${barangay_name}.`);
    } catch {
      const localItem = {
        id: `ADV-2026-0${advisories.length + 1}`,
        barangay_name,
        level,
        message: cleanMsg,
        issued_by: `${activeRoleObj.label} (Local)`,
        timestamp: new Date().toISOString(),
      };
      setAdvisories((prev) => [localItem, ...prev]);
      appendAuditLog(activeRoleObj.label, `Broadcasted local ${level} for Brgy. ${barangay_name}`);
      triggerStatusMessage('success', `${level} published locally for Brgy. ${barangay_name}.`);
    }
  }

  async function handleUpdateCampSupply(campId, addSupplyLiters) {
    try {
      if (!isOnline) throw new Error('Offline mode');
      const res = await fetch(`${API_ROOT}/evacuation-camps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camp_id: campId, add_supply_liters: addSupplyLiters }),
      });
      if (!res.ok) throw new Error('Camp update failed');
      const data = await res.json();
      setBackendConnected(true);
      if (Array.isArray(data.camps)) setEvacuationCamps(data.camps);
      appendAuditLog(activeRoleObj.label, `Delivered +${addSupplyLiters.toLocaleString()} L tanker refill to ${data.camp?.name || campId}`);
      triggerStatusMessage('success', `Updated camp water supply for ${data.camp?.name || campId}.`);
    } catch {
      setEvacuationCamps((prev) =>
        prev.map((c) => {
          if (c.id !== campId) return c;
          const nextSupply = Math.max(0, c.supply_liters + addSupplyLiters);
          const ratio = nextSupply / Math.max(1, c.daily_demand_liters);
          return {
            ...c,
            supply_liters: nextSupply,
            status: ratio >= 1 ? 'Adequate' : ratio >= 0.5 ? 'Dispatch Needed' : 'Critical Deficit',
          };
        })
      );
      triggerStatusMessage('success', `Delivered +${addSupplyLiters.toLocaleString()} L locally to ${campId}.`);
    }
  }

  async function handleRegisterFacility(e) {
    e.preventDefault();
    const cleanName = newFacName.trim() || `${newFacBarangay} ${newFacSourceType}`;
    const payload = {
      name: cleanName,
      barangay_name: newFacBarangay,
      source_type: newFacSourceType,
      lat: parseFloat(newFacLat) || 13.638,
      lng: parseFloat(newFacLng) || 123.204,
      population_served: parseInt(newFacPop, 10) || 650,
    };

    try {
      if (!isOnline) throw new Error('Offline mode');
      const res = await fetch(`${API_ROOT}/facilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Facility creation failed');
      const data = await res.json();
      setBackendConnected(true);
      applyLiveSnapshot(data.facilities, data.barangays);
      if (data.facility) setActiveMapNode(data.facility);
      setNewFacName('');
      appendAuditLog(activeRoleObj.label, `Registered new facility ${data.facility?.id} (${cleanName})`);
      triggerStatusMessage('success', `Commissioned ${data.facility?.id}: ${cleanName} in Brgy. ${newFacBarangay}.`);
    } catch {
      const nextId = `NAGA-${String(waterPoints.length + 1).padStart(2, '0')}`;
      const basePt = {
        id: nextId,
        name: cleanName,
        barangay: newFacBarangay,
        barangay_name: newFacBarangay,
        lat: payload.lat,
        lng: payload.lng,
        elevation_m: 6,
        source_type: newFacSourceType,
        status: 'Functional',
        flood_risk_level: 2,
        population_served: payload.population_served,
        verified: true,
        tanker_dispatched: false,
        data_provenance: 'LGU WASH Registry (Local Offline)',
        metrics: { ph: 7.1, tds_ppm: 210, turbidity_ntu: 1.2, coliform_present: false, residual_chlorine: 0.4 },
        history: [],
      };
      const wvi = calculateWaterPointWvi(basePt);
      const created = { ...basePt, ...wvi };
      applyLiveSnapshot([...waterPoints, created], barangaysData);
      setActiveMapNode(created);
      setNewFacName('');
      triggerStatusMessage('success', `Registered ${nextId} locally (${cleanName}).`);
    }
  }

  async function handleVerifyOrTanker(facilityId, action = 'verify') {
    try {
      const res = await fetch(`${API_ROOT}/facilities/${facilityId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actor: activeRoleObj.label }),
      });
      if (!res.ok) throw new Error('Verify failed');
      const data = await res.json();
      setBackendConnected(true);
      applyLiveSnapshot(data.facilities, data.barangays);
      const label =
        action === 'dispatch_tanker'
          ? `Tanker dispatched to ${facilityId}`
          : action === 'resolve_tanker'
          ? `Tanker ration resolved for ${facilityId}`
          : `Verified live telemetry for ${facilityId}`;
      appendAuditLog(activeRoleObj.label, label);
      triggerStatusMessage('success', label);
    } catch {
      triggerStatusMessage('info', 'Backend offline — start FastAPI server to persist verification.');
    }
  }

  async function handleScenarioChange(targetScenario) {
    try {
      const res = await fetch(`${API_ROOT}/simulate/typhoon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: targetScenario,
          active: targetScenario === 'typhoon',
        }),
      });
      if (!res.ok) throw new Error('Scenario simulation failed');
      const data = await res.json();
      const resolvedScenario = data.scenario || (data.typhoon_active ? 'typhoon' : 'baseline');
      setBackendConnected(true);
      setScenarioMode(resolvedScenario);
      applyLiveSnapshot(data.facilities, data.barangays);
      const msg =
        resolvedScenario === 'typhoon'
          ? 'Typhoon Flood Surge ACTIVE — Floodplain WVI & tanker routes elevated.'
          : resolvedScenario === 'monsoon'
          ? 'Monsoon Heavy Rain ACTIVE — Lowland runoff & turbidity elevated.'
          : 'Baseline Dry/Normal restored — all flood scenarios cleared.';
      appendAuditLog(activeRoleObj.label, msg);
      triggerStatusMessage('success', msg);
    } catch {
      triggerStatusMessage('info', 'Backend offline — start FastAPI server to run flood scenarios.');
    }
  }

  function handleToggleTyphoon() {
    handleScenarioChange(scenarioMode === 'typhoon' ? 'baseline' : 'typhoon');
  }

  async function handleUpdateThresholds(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_ROOT}/admin/thresholds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          critical_wvi: Number(criticalThreshold),
          advisory_wvi: Number(advisoryThreshold),
        }),
      });
      if (!res.ok) throw new Error('Threshold update failed');
      const data = await res.json();
      applyLiveSnapshot(data.facilities, data.barangays);
      appendAuditLog(activeRoleObj.label, `Updated WVI thresholds (Advisory >= ${advisoryThreshold}, Critical >= ${criticalThreshold})`);
      triggerStatusMessage('success', 'WVI thresholds updated & recalculated across Naga City.');
    } catch {
      triggerStatusMessage('info', 'Backend offline — unable to update thresholds.');
    }
  }

  async function handleAdminReset() {
    try {
      const res = await fetch(`${API_ROOT}/admin/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      const data = await res.json();
      setScenarioMode('baseline');
      setCriticalThreshold(65);
      setAdvisoryThreshold(35);
      applyLiveSnapshot(data.facilities, data.barangays, data.reports);
      setAdvisories(data.advisories || INITIAL_ADVISORIES_FALLBACK);
      setEvacuationCamps(data.camps || INITIAL_EVACUATION_CAMPS_FALLBACK);
      appendAuditLog(activeRoleObj.label, 'Reset all telemetry, advisories, camps, and flood scenarios to baseline');
      triggerStatusMessage('success', 'System telemetry reset to clean baseline.');
    } catch {
      triggerStatusMessage('info', 'Backend offline — unable to reset telemetry.');
    }
  }

  function handleFindNearestSafe() {
    const safeList = waterPoints.filter(
      (p) => p.status === 'Functional' && p.wvi_score < advisoryThreshold
    );
    if (safeList.length === 0) {
      triggerStatusMessage('info', 'No functional safe potable stations currently below advisory threshold.');
      return;
    }
    const refLat = activeMapNode?.lat ?? 13.6238;
    const refLng = activeMapNode?.lng ?? 123.1935;
    const nearest = [...safeList].sort((a, b) => {
      const da = Math.hypot(a.lat - refLat, a.lng - refLng);
      const db = Math.hypot(b.lat - refLat, b.lng - refLng);
      return da - db;
    })[0];
    setActiveMapNode(nearest);
    triggerStatusMessage('success', `Nearest Safe Kiosk: ${nearest.name} (WVI ${nearest.wvi_score})`);
  }

  function triggerStatusMessage(type, message) {
    setSyncStatus({ active: true, type, message });
    setTimeout(() => setSyncStatus({ active: false, type: '', message: '' }), 5000);
  }

  async function handleLogSubmit(e) {
    e.preventDefault();
    if (!isBHW && !isCoordinator) {
      triggerStatusMessage('error', 'Authentication Required: Sign in as BHW or LGU / WASH Coordinator.');
      return;
    }

    const extraParts = [];
    if (bhwPhotoName) extraParts.push(`Photo: ${bhwPhotoName}`);
    if (bhwPipedAccessPct !== '' || bhwFetchingDistM !== '') {
      extraParts.push(`HH Access: ${bhwPipedAccessPct || 0}% (${bhwFetchingDistM || 0}m avg fetch)`);
    }
    const baseNote =
      incidentNote.trim() ||
      (bhwSanitationHazard
        ? 'Sanitation / flood runoff hazard flagged during BHW inspection.'
        : 'Routine BHW field-kit test verified.');
    const combinedNote = extraParts.length ? `${baseNote} [${extraParts.join(' · ')}]` : baseNote;

    await handleSubmitFieldKit(selectedPointId, {
      ph,
      tds_ppm: tdsPpm,
      turbidity_ntu: turbidityNtu,
      coliform_positive: coliformPresent,
      hardware_status: pumpStatus,
      sanitation_hazard: bhwSanitationHazard,
      note: combinedNote,
    });
    setIncidentNote('');
    setBhwPhotoName('');
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

  function handleAssignWashAllocation(e) {
    e.preventDefault();
    const kitsNum = Math.max(1, parseInt(allocKits, 10) || 10);
    const budgetNum = Math.max(5000, parseInt(allocBudgetPhp, 10) || 50000);
    const nextEntry = {
      id: `ALLOC-0${washAllocations.length + 1}`,
      barangay: allocBarangay,
      kits: kitsNum,
      budgetPhp: budgetNum,
      status: 'Allocated',
    };
    setWashAllocations((prev) => [nextEntry, ...prev]);
    appendAuditLog(
      activeRoleObj.label,
      `Assigned ${kitsNum} filtration kits & PHP ${budgetNum.toLocaleString()} to Brgy. ${allocBarangay}`
    );
    triggerStatusMessage(
      'success',
      `Allocated ${kitsNum} filtration kits (PHP ${budgetNum.toLocaleString()}) to Brgy. ${allocBarangay}.`
    );
  }

  function exportAuditCsv() {
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Facility ID',
      'Facility Name',
      'Barangay',
      'Source Type',
      'Hardware Status',
      'Verified',
      'WVI Score',
      'Risk Tier',
      'Turbidity (NTU)',
      'pH',
      'Residual Chlorine (mg/L)',
      'TDS (ppm)',
      'Coliform Present',
      'Population Served',
      'Last Updated',
    ];
    const rows = waterPoints.map((pt) => {
      const m = pt.metrics || {};
      const tier =
        pt.wvi_score >= criticalThreshold
          ? 'Critical'
          : pt.wvi_score >= advisoryThreshold
          ? 'Advisory'
          : 'Safe';
      return [
        pt.id,
        pt.name,
        pt.barangay,
        pt.source_type,
        pt.status,
        pt.verified ? 'Yes' : 'Simulated',
        pt.wvi_score,
        tier,
        m.turbidity_ntu ?? '',
        m.ph ?? '',
        m.residual_chlorine ?? '',
        m.tds_ppm ?? '',
        m.coliform_present ? 'Positive' : 'Negative',
        pt.population_served ?? 0,
        pt.last_updated ?? '',
      ]
        .map(escapeCsv)
        .join(',');
    });
    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bicolaqua_naga_wash_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    appendAuditLog(activeRoleObj.label, `Exported Multi-Year Audit CSV (${waterPoints.length} facilities)`);
    triggerStatusMessage('success', `Downloaded audit CSV for ${waterPoints.length} Naga City water points.`);
  }

  const criticalPoints = waterPoints.filter((p) => p.wvi_score >= criticalThreshold);
  const moderatePoints = waterPoints.filter((p) => p.wvi_score >= advisoryThreshold && p.wvi_score < criticalThreshold);
  const safePoints = waterPoints.filter((p) => p.wvi_score < advisoryThreshold);
  const operationalCount = waterPoints.filter((p) => p.status === 'Functional').length;
  const activeTankersCount = waterPoints.filter((p) => p.wvi_score >= criticalThreshold || p.tanker_dispatched).length;
  const coliformAlertCount = waterPoints.filter((p) => p.metrics?.coliform_present || p.wvi_score >= advisoryThreshold).length;
  const pnsdwCompliantCount = waterPoints.filter((pt) => {
    const m = pt.metrics || {};
    const turb = Number(m.turbidity_ntu ?? 0);
    const phV = Number(m.ph ?? 7.0);
    const cl2 = Number(m.residual_chlorine ?? 0.4);
    return turb < 5.0 && phV >= 6.5 && phV <= 8.5 && cl2 >= 0.3 && !m.coliform_present;
  }).length;
  const pnsdwCompliantPct = Math.round((pnsdwCompliantCount / (waterPoints.length || 1)) * 100);
  const totalResidents = waterPoints.reduce((acc, p) => acc + p.population_served, 0);
  const avgWvi = (
    waterPoints.reduce((acc, p) => acc + p.wvi_score, 0) / (waterPoints.length || 1)
  ).toFixed(1);

  const filteredPoints = useMemo(
    () =>
      waterPoints.filter((pt) => {
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
      }),
    [waterPoints, searchQuery, sourceFilter, tierFilter]
  );

  const mapWaterPoints = useMemo(
    () =>
      waterPoints.filter((pt) => {
        const matchesSource = sourceFilter === 'ALL' || pt.source_type === sourceFilter;
        const matchesTier =
          tierFilter === 'ALL' ||
          (tierFilter === 'SAFE' && pt.wvi_score < 35) ||
          (tierFilter === 'MODERATE' && pt.wvi_score >= 35 && pt.wvi_score < 65) ||
          (tierFilter === 'CRITICAL' && pt.wvi_score >= 65);
        return matchesSource && matchesTier;
      }),
    [waterPoints, sourceFilter, tierFilter]
  );

  const searchLocations = useMemo(() => {
    const fc = buildBarangayChoroplethGeoJson(waterPoints, barangaysData);
    const barangayItems = (fc?.features || []).map((f) => {
      const p = f.properties || {};
      const displayName = p.displayName || p.name || '';
      return {
        key: `brgy-${p.id || p.name}`,
        kind: 'BARANGAY',
        primaryName: String(p.name || displayName).toLowerCase(),
        title: `Brgy. ${displayName}`,
        subtitle: `Barangay Zone · ${p.facility_count || 0} monitored sites`,
        searchText: `${p.name || ''} ${displayName} brgy barangay`.toLowerCase(),
        wvi: Number(p.wvi_score),
        node: {
          isBarangay: true,
          id: p.id,
          name: `Brgy. ${displayName}`,
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
        },
      };
    });

    const kioskItems = waterPoints.map((pt) => ({
      key: `pt-${pt.id}`,
      kind: 'KIOSK',
      primaryName: String(pt.name || pt.id).toLowerCase(),
      title: `${pt.id} · ${pt.name}`,
      subtitle: `Brgy. ${pt.barangay} · ${pt.source_type}`,
      searchText: `${pt.id} ${pt.name} ${pt.barangay} ${pt.source_type}`.toLowerCase(),
      wvi: Number(pt.wvi_score),
      node: {
        ...pt,
        hazardZone: getFacilityHazardCrossRef(pt.lat, pt.lng, pt.barangay),
      },
    }));

    return [...barangayItems, ...kioskItems];
  }, [waterPoints, barangaysData]);

  const handleMapNodeSelect = useCallback((node) => {
    setActiveMapNode(node);
    setDrawerCollapsed(false);
  }, []);

  const handleSearchSelect = useCallback(
    (item) => {
      if (!item?.node) return;
      handleMapNodeSelect({ ...item.node, _navTs: Date.now() });
    },
    [handleMapNodeSelect]
  );

  const hasActiveFilters = searchQuery !== '' || sourceFilter !== 'ALL' || tierFilter !== 'ALL';

  function resetAllFilters() {
    setSearchQuery('');
    setSourceFilter('ALL');
    setTierFilter('ALL');
  }

  const opsDockPoints = useMemo(
    () =>
      [...filteredPoints]
        .sort((a, b) => b.wvi_score - a.wvi_score)
        .filter((pt) => {
          if (dockTab === 'SAFE') return pt.wvi_score < 35;
          if (dockTab === 'MODERATE') return pt.wvi_score >= 35 && pt.wvi_score < 65;
          if (dockTab === 'CRITICAL') return pt.wvi_score >= 65;
          return true;
        }),
    [filteredPoints, dockTab]
  );

  const renderStatusPill = (score) => {
    if (score >= 65) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#991B1B] bg-[#FEE2E2] border border-red-200/60 tabular-nums whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.7)] shrink-0" />
          Critical · {score}
        </span>
      );
    }
    if (score >= 35) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#92400E] bg-[#FEF3C7] border border-amber-200/60 tabular-nums whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B] shadow-[0_0_6px_rgba(245,158,11,0.7)] shrink-0" />
          Advisory · {score}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#065F46] bg-[#D1FAE5] border border-emerald-200/60 tabular-nums whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.7)] shrink-0" />
        Safe · {score}
      </span>
    );
  };

  return (
    <div className="h-[100vh] h-[100dvh] w-screen overflow-hidden relative bg-slate-100 text-slate-900 font-sans select-none">
      {/* CONTINUOUS FULL-BLEED TOP APPLICATION BAR */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none">
        <header className="pointer-events-auto w-full h-14 bg-white/95 backdrop-blur-md border-b border-slate-900/[0.08] shadow-[0_1px_12px_-2px_rgba(15,23,42,0.07)] px-3 sm:px-4 flex items-center justify-between gap-2.5">
          {/* Left Cluster: Brand + Global Search + Primary Workspace & Analytics Tabs */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveDrawer(null);
                setAnalyticsOpen(false);
                setActiveMapNode(null);
                resetAllFilters();
                setCameraCommand({ action: 'RESET', ts: Date.now() });
              }}
              className="flex items-center gap-2 text-left group cursor-pointer shrink-0 hud-press"
            >
              <div className="w-8 h-8 rounded-[10px] bg-sky-50 border border-sky-600/15 flex items-center justify-center group-hover:border-[#0284C7] transition-colors shrink-0">
                <BicolAquaLogo className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-[15px] tracking-[-0.02em] text-slate-900">
                  Bicol<span className="text-[#0284C7]">Aqua</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-900/[0.08]">
                  3D GIS
                </span>
              </div>
            </button>

            <div className="hidden md:block h-6 w-px bg-slate-900/[0.08] shrink-0" />

            {/* Global Search Bar (Zero-Lag Local State + Direct Map Navigation) */}
            <HeaderSearchBox
              locations={searchLocations}
              externalValue={searchQuery}
              onDebouncedQueryChange={setSearchQuery}
              onSelectLocation={handleSearchSelect}
              containerClassName="hidden md:flex items-center"
              inputClassName="pl-8 pr-7 py-1.5 bg-slate-50/90 border border-slate-900/[0.09] focus:border-[#0284C7] focus:bg-white rounded-[10px] text-[12.5px] font-medium text-slate-800 placeholder-slate-400 w-44 lg:w-56 xl:w-64 outline-none transition-colors"
            />

            <div className="hidden lg:block h-6 w-px bg-slate-900/[0.08] shrink-0" />

            {/* Primary Workspace Segmented Control (Concentric Radii: outer 12px, p-0.5 -> inner 9px) */}
            <div className="hidden lg:flex items-center bg-slate-100/90 border border-slate-900/[0.07] p-0.5 rounded-[12px] gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer(null);
                  setAnalyticsOpen(false);
                  setActiveMapNode(null);
                  setCameraCommand({ action: 'RESET', ts: Date.now() });
                }}
                aria-pressed={activeDrawer === null && !analyticsOpen}
                className={`px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hud-press ${
                  activeDrawer === null && !analyticsOpen
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#0284C7]" strokeWidth={2} />
                <span>Map Overview</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalyticsOpen(false);
                  const targetDrawer = DRAWER_ID_BY_ROLE[authenticatedRole] || 'RESIDENT';
                  setActiveDrawer((prev) => (prev === targetDrawer ? null : targetDrawer));
                }}
                aria-pressed={activeDrawer !== null}
                className={`px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hud-press ${
                  activeDrawer !== null
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" strokeWidth={2} />
                <span>
                  {isCoordinator
                    ? 'WASH Registry'
                    : isCDRRMO
                    ? 'CDRRMO Ops'
                    : isBHW
                    ? 'BHW Field Kit'
                    : 'Safe Kiosks'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer(null);
                  setAnalyticsOpen((v) => !v);
                }}
                aria-expanded={analyticsOpen}
                aria-pressed={analyticsOpen}
                className={`px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hud-press ${
                  analyticsOpen
                    ? 'bg-[#0284C7] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Analytics</span>
              </button>
            </div>
          </div>

          {/* Right Cluster: Advisories Bell + Streamlined Role Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveDrawer(null);
                setAnalyticsOpen((v) => !v);
              }}
              aria-expanded={analyticsOpen}
              className={`lg:hidden px-2.5 py-1.5 rounded-[10px] text-[11.5px] font-semibold flex items-center gap-1.5 border cursor-pointer hud-press ${
                analyticsOpen
                  ? 'bg-[#0284C7] text-white border-[#0284C7]'
                  : 'bg-slate-50 text-slate-700 border-slate-900/[0.09] hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => setFeedOpen((v) => !v)}
              aria-expanded={feedOpen}
              className={`px-2.5 py-1.5 rounded-[10px] text-[11.5px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 border cursor-pointer hud-press ${
                feedOpen
                  ? 'bg-[#0284C7] text-white border-[#0284C7]'
                  : 'bg-slate-50 text-slate-700 border-slate-900/[0.09] hover:bg-slate-100'
              }`}
            >
              <Bell className={`w-3.5 h-3.5 shrink-0 ${feedOpen ? 'text-white' : 'text-[#0284C7]'}`} strokeWidth={2} />
              <span className="hidden xl:inline">Advisories &amp; Incidents</span>
              <span className="xl:hidden">Alerts</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums ${
                  feedOpen ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {incidentReports.length + advisories.length}
              </span>
            </button>

            <div className="h-6 w-px bg-slate-900/[0.08] hidden sm:block shrink-0" />

            {/* Streamlined Role Switcher Dropdown (Hick's Law) */}
            <div ref={roleMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setRoleMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={roleMenuOpen}
                className="px-3 py-1.5 rounded-[10px] text-[11.5px] font-semibold bg-sky-50/90 hover:bg-sky-100/80 text-[#0369A1] border border-sky-600/15 flex items-center gap-1.5 whitespace-nowrap cursor-pointer hud-press"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7] shrink-0" strokeWidth={2} />
                <span className="hidden sm:inline">
                  {authenticatedRole === 'LGU_COORDINATOR'
                    ? 'LGU / WASH'
                    : ROLE_DEFINITIONS.find((r) => r.role === authenticatedRole)?.label || 'Community Resident'}
                </span>
                <span className="sm:hidden">
                  {ROLE_DEFINITIONS.find((r) => r.role === authenticatedRole)?.shortLabel || 'Resident'}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-sky-700/70 transition-transform duration-150 ${
                    roleMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {roleMenuOpen && (
                <div
                  role="menu"
                  aria-label="Switch Operational Role"
                  className="hud-enter absolute right-0 mt-2 w-64 rounded-2xl p-1.5 bg-white/95 backdrop-blur-md border border-slate-900/[0.10] shadow-xl z-50 space-y-0.5"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
                    Active Portal Role
                  </div>
                  {ROLE_DEFINITIONS.map((roleDef) => {
                    const roleDrawerId = DRAWER_ID_BY_ROLE[roleDef.role];
                    const isAuthenticated = authenticatedRole === roleDef.role;
                    const isDrawerActive = activeDrawer === roleDrawerId;
                    const desktopLabel =
                      roleDef.role === 'LGU_COORDINATOR' ? 'LGU / WASH' : roleDef.label;
                    return (
                      <button
                        key={roleDef.role}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setRoleMenuOpen(false);
                          handleRoleClick(roleDef);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-[10px] flex items-center justify-between gap-2 cursor-pointer hud-press ${
                          isAuthenticated
                            ? 'bg-sky-50 text-[#0369A1]'
                            : 'text-slate-700 hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold flex items-center gap-1.5">
                            <span>{desktopLabel}</span>
                            {isAuthenticated && (
                              <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-[#0284C7]">
                                {isDrawerActive ? 'Open' : 'Active'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate">
                            {roleDef.organization}
                          </div>
                        </div>
                        {roleDef.requiresCredentials && !isAuthenticated ? (
                          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                        ) : (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isAuthenticated ? 'text-[#0284C7]' : 'text-transparent'
                            }`}
                            strokeWidth={2}
                          />
                        )}
                      </button>
                    );
                  })}
                    {authenticatedRole !== 'RESIDENT' && (
                      <div className="pt-1 mt-1 border-t border-slate-900/[0.08]">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRoleMenuOpen(false);
                            setAuthenticatedRole('RESIDENT');
                            setActiveDrawer('RESIDENT');
                            setSyncStatus({ active: true, message: 'Signed out — returned to Public Resident view.' });
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-[10px] flex items-center justify-between gap-2 text-red-700 hover:bg-red-50/80 cursor-pointer hud-press"
                        >
                          <div>
                            <div className="text-[12px] font-bold">Lock &amp; Sign Out</div>
                            <div className="text-[10.5px] text-red-600/80">Return to Public Resident role</div>
                          </div>
                          <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Mobile Compact Sub-Row: Search + Drawer Toggle (< lg only) */}
        <div className="pointer-events-auto lg:hidden mt-2 px-3 flex items-center gap-2">
          <HeaderSearchBox
            locations={searchLocations}
            externalValue={searchQuery}
            onDebouncedQueryChange={setSearchQuery}
            onSelectLocation={handleSearchSelect}
            containerClassName="flex md:hidden items-center flex-1 min-w-[155px]"
            inputClassName="w-full pl-8 pr-7 py-1.5 bg-white/95 backdrop-blur-md border border-slate-900/[0.10] focus:border-[#0284C7] rounded-xl text-[12px] font-medium text-slate-800 placeholder-slate-400 shadow-sm outline-none"
          />

          <button
            type="button"
            onClick={() => {
              const targetDrawer = DRAWER_ID_BY_ROLE[authenticatedRole] || 'RESIDENT';
              setActiveDrawer((prev) => (prev === targetDrawer ? null : targetDrawer));
            }}
            className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-[11.5px] font-bold text-slate-800 flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>
              {activeDrawer === null
                ? `${activeRoleObj.shortLabel} Panel`
                : 'Map Overview'}
            </span>
          </button>
        </div>

        {/* Toggleable Incident Stream & Advisories Popover (Right-Anchored below Bell Pill) */}
        {feedOpen && (
          <div
            role="dialog"
            aria-label="Incident Stream and Boil-Water Advisories"
            className="hud-enter pointer-events-auto ml-auto mr-3 sm:mr-4 mt-2 w-[calc(100%-1.5rem)] max-w-[420px] max-h-[calc(100dvh-116px)] flex flex-col bg-white/95 backdrop-blur-xl border border-slate-900/[0.10] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Top Fixed Header (flex-shrink-0) */}
            <div className="flex-shrink-0 bg-white/95 border-b border-[#E2E8F0]">
              <div className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B] whitespace-nowrap">
                      LIVE SPATIAL FEED
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                      API SYNCED
                    </span>
                  </div>
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] text-[#0F172A] mt-0.5 truncate">
                    Incident Stream &amp; Boil-Water Advisories
                  </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={fetchPoints}
                    className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-600 transition-colors cursor-pointer"
                    title="Refresh live incidents & advisories"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-600 transition-colors cursor-pointer"
                    title="Close Feed"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Filter Pill Row */}
              <div className="px-4 pb-[12px] flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'ALL', label: `All (${incidentReports.length + advisories.length})` },
                  { id: 'ADVISORIES', label: `Advisories (${advisories.length})` },
                  { id: 'INCIDENTS', label: `Incidents (${incidentReports.length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFeedTab(t.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      feedTab === t.id
                        ? 'bg-[#0284C7] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scroll Body (flex-1 overflow-y-auto pt-3 px-4 pb-4) */}
            <div className="flex-1 overflow-y-auto pt-3 px-4 pb-4 space-y-[10px]">
              {(feedTab === 'ALL' || feedTab === 'ADVISORIES') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                    Active Boil-Water &amp; WASH Advisories ({advisories.length})
                  </div>
                  {advisories.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[12.5px] text-[#475569]">
                      No active boil-water advisories in Naga City.
                    </div>
                  ) : (
                    advisories.map((adv) => (
                      <div
                        key={adv.id}
                        className="p-[12px_14px] rounded-xl bg-[#FEF3C7]/90 border border-amber-200/90 text-[12.5px] space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-semibold text-[#0F172A]">
                            {adv.level} <span className="font-medium text-[#64748B]">· Brgy. {adv.barangay_name}</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#92400E] tabular-nums shrink-0">
                            {adv.id}
                          </span>
                        </div>
                        <p className="text-[12.5px] font-normal leading-[1.45] text-[#475569]">{adv.message}</p>
                        <div className="text-[11px] font-medium text-[#64748B] pt-0.5">
                          Issued by {adv.issued_by}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {(feedTab === 'ALL' || feedTab === 'INCIDENTS') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                    Live Incident Stream ({incidentReports.length})
                  </div>
                  {incidentReports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-[12px_14px] rounded-xl bg-slate-50/90 border border-slate-200/80 text-[12.5px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-semibold text-[#0F172A] truncate">
                          {rep.category || rep.issue_type} <span className="font-medium text-[#64748B]">· Brgy. {rep.barangay}</span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#075985] bg-[#E0F2FE] border border-sky-200/60 shrink-0 whitespace-nowrap">
                          {rep.status}
                        </span>
                      </div>
                      <p className="text-[12.5px] font-normal leading-[1.45] text-[#475569]">{rep.description}</p>
                      <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B] pt-0.5">
                        <span>{rep.reporter_role || 'Community Resident'}</span>
                        {rep.facility_id && (
                          <button
                            type="button"
                            onClick={() => {
                              const found = waterPoints.find((p) => p.id === rep.facility_id);
                              if (found) {
                                setActiveMapNode(found);
                                setFeedOpen(false);
                              }
                            }}
                            className="font-semibold text-[#0284C7] hover:underline cursor-pointer"
                          >
                            Inspect {rep.facility_id} →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FULL-VIEWPORT 3D GEOSPATIAL CANVAS + WHITE CONTEXTUAL HUDS */}
      <div
        className="w-full h-full relative overflow-clip"
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
          if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
        }}
      >
        <div className="absolute inset-0 z-0">
          <BicolMap3D
            waterPoints={mapWaterPoints}
            barangaysData={barangaysData}
            evacuationCamps={evacuationCamps}
            showFloodLayer={showFloodLayer}
            showTankerRoutes={showTankerRoutes}
            showLabels={showLabels}
            activeMapNode={activeMapNode}
            onNodeSelect={handleMapNodeSelect}
            cameraCommand={cameraCommand}
            isLeftDrawerOpen={isLeftDrawerOpen || analyticsOpen}
            isRightDockOpen={isRightDockOpen}
          />
        </div>

        {/* GLOBAL FEEDBACK TOAST */}
        {syncStatus.active && (
          <div className="absolute top-[68px] left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[92vw]">
            <div className="px-4 py-2 rounded-2xl shadow-lg bg-slate-950/95 backdrop-blur-md border border-sky-400/30 text-xs font-semibold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-400" />
              <span className="truncate">{syncStatus.message}</span>
            </div>
          </div>
        )}

        {/* PERIPHERAL HUD OVERLAY LAYER */}
        <div className="absolute inset-0 z-10 pointer-events-none px-3 sm:px-4 pt-[68px] pb-16 flex flex-col justify-between gap-3">
          {/* TOP ROW: Left (Collapsible Analytics Sidebar / Actor Workspace) & Right (Inspector + Vertical Tool Bar) */}
          <div className="flex-1 min-h-0 flex items-start justify-between gap-4">
            {/* TOP-LEFT PERIMETER COLUMN */}
            <div className="pointer-events-auto flex flex-col gap-3 items-start max-w-full lg:max-w-[380px] max-h-full min-h-0">
              {/* COLLAPSIBLE CITYWIDE ANALYTICS & STUDY SIDEBAR (Closed by default; houses full KPIs & telemetry) */}
              {analyticsOpen && (
                <aside
                  aria-label="Citywide Water Security Analytics & Telemetry"
                  className="hud-enter hud-surface pointer-events-auto absolute left-3 sm:left-4 top-[68px] z-30 rounded-2xl w-[calc(100%-1.5rem)] sm:w-[var(--left-drawer-width,360px)] max-h-[calc(100dvh-116px)] flex flex-col overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-900/[0.08] bg-white/95 flex items-center justify-between gap-2 shrink-0">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500">
                        STUDY &amp; TELEMETRY SIDEBAR
                      </div>
                      <h2 className="text-[15.5px] font-bold tracking-[-0.02em] text-slate-900 leading-tight mt-0.5">
                        Naga City WASH Analytics
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAnalyticsOpen(false)}
                      aria-label="Close analytics sidebar"
                      className="w-8 h-8 rounded-[10px] hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer hud-press"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                    {/* Headline Citywide KPI Grid (Moved off live map into study sidebar) */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-white border border-slate-900/[0.08] p-3 flex flex-col justify-between gap-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Operational
                          </span>
                          <Droplets className="w-3.5 h-3.5 text-[#0284C7]" strokeWidth={2} />
                        </div>
                        <div className="text-[18px] font-bold text-slate-900 tabular-nums leading-none">
                          {operationalCount}{' '}
                          <span className="text-[12px] font-medium text-slate-500">/ {waterPoints.length}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-700">Functional kiosks</div>
                      </div>

                      <div className="rounded-xl bg-white border border-slate-900/[0.08] p-3 flex flex-col justify-between gap-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Served
                          </span>
                          <Users className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
                        </div>
                        <div className="text-[18px] font-bold text-slate-900 tabular-nums leading-none">
                          {totalResidents.toLocaleString()}
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">Naga City coverage</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowTankerRoutes((v) => !v)}
                        className="text-left rounded-xl bg-white hover:bg-sky-50/50 border border-slate-900/[0.08] p-3 flex flex-col justify-between gap-1.5 cursor-pointer hud-press"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Active Tankers
                          </span>
                          <Truck className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
                        </div>
                        <div className="text-[18px] font-bold text-slate-900 tabular-nums leading-none flex items-center gap-1.5">
                          <span>{activeTankersCount}</span>
                          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-sky-100 text-[#075985]">
                            En Route
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">
                          {showTankerRoutes ? 'Routes visible' : 'Click to show routes'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFeedOpen(true)}
                        className="text-left rounded-xl bg-white hover:bg-red-50/40 border border-slate-900/[0.08] p-3 flex flex-col justify-between gap-1.5 cursor-pointer hud-press"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Alerts
                          </span>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" strokeWidth={2} />
                        </div>
                        <div className="text-[18px] font-bold text-red-800 tabular-nums leading-none">
                          {coliformAlertCount}{' '}
                          <span className="text-[11px] font-semibold text-amber-800">
                            · {advisories.length} Notices
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">
                          {scenarioMode !== 'baseline'
                            ? `Scenario: ${scenarioMode === 'typhoon' ? 'Typhoon' : 'Monsoon'}`
                            : 'Baseline dry watch'}
                        </div>
                      </button>
                    </div>

                    {/* Risk Tier Distribution Bar */}
                    <div className="rounded-xl bg-slate-50/90 border border-slate-900/[0.07] p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                        <span>WVI Risk Distribution</span>
                        <span className="tabular-nums text-slate-700">{waterPoints.length} sites</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(safePoints.length / Math.max(1, waterPoints.length)) * 100}%` }}
                        />
                        <div
                          className="h-full bg-amber-400"
                          style={{ width: `${(moderatePoints.length / Math.max(1, waterPoints.length)) * 100}%` }}
                        />
                        <div
                          className="h-full bg-red-500"
                          style={{ width: `${(criticalPoints.length / Math.max(1, waterPoints.length)) * 100}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
                        <div className="text-emerald-700 font-semibold">Safe: {safePoints.length}</div>
                        <div className="text-amber-700 font-semibold text-center">Boil: {moderatePoints.length}</div>
                        <div className="text-red-700 font-semibold text-right">Ration: {criticalPoints.length}</div>
                      </div>
                    </div>

                    {/* Highest-Risk Monitored Sites (Click to inspect on 3D map) */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                        Monitored Water Points (By Risk)
                      </div>
                      <div className="space-y-1.5">
                        {[...waterPoints]
                          .sort((a, b) => b.wvi_score - a.wvi_score)
                          .map((pt) => (
                            <button
                              key={pt.id}
                              type="button"
                              onClick={() => setActiveMapNode(pt)}
                              className="w-full text-left px-3 py-2 rounded-xl bg-white hover:bg-sky-50/70 border border-slate-900/[0.07] flex items-center justify-between gap-2 cursor-pointer hud-press"
                            >
                              <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                                  <span className="text-[#0284C7] mr-1.5 tabular-nums">{pt.id}</span>
                                  {pt.name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  Brgy. {pt.barangay} · {pt.source_type}
                                </div>
                              </div>
                              {renderStatusPill(pt.wvi_score)}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Evacuation Camp Supply Overview */}
                    {evacuationCamps.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-slate-900/[0.07]">
                        <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                          Evacuation Camp Water Supply
                        </div>
                        <div className="space-y-2">
                          {evacuationCamps.map((camp) => {
                            const pct = Math.min(
                              100,
                              Math.round((camp.supply_liters / (camp.daily_demand_liters || 1)) * 100)
                            );
                            return (
                              <div
                                key={camp.id}
                                className="p-2.5 rounded-xl bg-white border border-slate-900/[0.07] space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 text-[12px]">
                                  <span className="font-semibold text-slate-800 truncate">{camp.name}</span>
                                  <span className="font-bold tabular-nums text-slate-700">{pct}%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              )}

              {/* COMMUNITY RESIDENT: TABBED PORTAL (Combined A1+A2 Rail · 100% Data Preserved) */}
              {activeDrawer === 'RESIDENT' && (
                <RoleDrawerShell
                  kicker="COMMUNITY RESIDENT PORTAL"
                  title="Safe Water Kiosk Locator"
                  subtitle={`${waterPoints.filter((p) => p.status === 'Functional' && p.wvi_score < advisoryThreshold).length} of ${waterPoints.length} functional safe sources`}
                  headerRight={
                    hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-[11.5px] font-semibold text-[#0284C7] hover:underline cursor-pointer px-1.5"
                      >
                        Reset
                      </button>
                    ) : null
                  }
                  headerExtra={
                    residentTab === 'kiosks' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          aria-label="Filter by facility type"
                          value={sourceFilter}
                          onChange={(e) => setSourceFilter(e.target.value)}
                          className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3 py-1.5 text-[12px] font-medium text-slate-700 outline-none focus:border-[#0284C7] focus:bg-white transition-colors"
                        >
                          <option value="ALL">All Facility Types</option>
                          <option value="Public Kiosk">Public Kiosk</option>
                          <option value="Handpump">Handpump</option>
                          <option value="Solar Pump">Solar Pump</option>
                          <option value="Shallow Well">Shallow Well</option>
                          <option value="Communal Spring">Communal Spring</option>
                          <option value="School Filtration">School Filtration</option>
                        </select>

                        <select
                          aria-label="Filter by safety rating"
                          value={tierFilter}
                          onChange={(e) => setTierFilter(e.target.value)}
                          className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3 py-1.5 text-[12px] font-medium text-slate-700 outline-none focus:border-[#0284C7] focus:bg-white transition-colors"
                        >
                          <option value="ALL">All Safety Ratings</option>
                          <option value="SAFE">Safe (&lt;{advisoryThreshold})</option>
                          <option value="MODERATE">Boil ({advisoryThreshold}–{criticalThreshold - 1})</option>
                          <option value="CRITICAL">Unsafe ({criticalThreshold}+)</option>
                        </select>
                      </div>
                    ) : null
                  }
                  tabs={[
                    { id: 'kiosks', shortLabel: 'Kiosks', fullTitle: 'Safe Kiosks', icon: Droplets },
                    { id: 'report', shortLabel: 'Report', fullTitle: 'Report Issue', icon: Megaphone },
                    { id: 'incidents', shortLabel: 'Incidents', fullTitle: 'Incidents & Tips', icon: AlertTriangle },
                  ]}
                  activeTab={residentTab}
                  onTabChange={setResidentTab}
                  onClose={() => setActiveDrawer(null)}
                >
                  {residentTab === 'kiosks' && (
                    <>
                      {/* Active Barangay Boil-Water Notices Banner */}
                      <div className="rounded-xl bg-[#FEF3C7] border border-[#FCD34D] p-3 text-[12.5px] space-y-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5 font-bold text-[#92400E]">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-[#92400E]" />
                          <span>Active Barangay Boil-Water Notices</span>
                        </div>
                        <p className="text-[12px] text-[#92400E] leading-snug">
                          <span className="font-semibold">Affected Zones:</span> Brgy. Sabang, Brgy. Tabuco, Brgy. Mabolo
                        </p>
                        <div className="pt-1.5 border-t border-[#FCD34D]/70 text-[11.5px] text-[#92400E]">
                          <span className="font-semibold">Emergency Ration Pickup:</span> Jesse M. Robredo Coliseum &amp; Naga City People's Hall
                        </div>
                        {advisories.length > 0 && advisories[0] && (
                          <div className="pt-1 text-[11px] text-[#92400E]/90 italic">
                            Latest: {advisories[0].level} · {advisories[0].message}
                          </div>
                        )}
                      </div>

                      {/* Nearest Safe Potable Kiosks (WVI < 35) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                            NEAREST SAFE POTABLE KIOSKS (WVI &lt; 35)
                          </span>
                          <button
                            type="button"
                            onClick={handleFindNearestSafe}
                            className="text-[11px] font-semibold text-[#0284C7] hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Compass className="w-3 h-3" />
                            Highlight Nearest
                          </button>
                        </div>

                        {(() => {
                          const priorityKioskIds = ['NAGA-08', 'NAGA-01', 'NAGA-03', 'NAGA-05'];
                          const safeKiosks = [...filteredPoints]
                            .filter((p) => p.status === 'Functional' && p.wvi_score < advisoryThreshold)
                            .sort((a, b) => {
                              const aIdx = priorityKioskIds.indexOf(a.id);
                              const bIdx = priorityKioskIds.indexOf(b.id);
                              if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                              if (aIdx !== -1) return -1;
                              if (bIdx !== -1) return 1;
                              return a.wvi_score - b.wvi_score;
                            });

                          if (safeKiosks.length === 0) {
                            return (
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[12px] text-slate-600">
                                No safe functional kiosks found matching filters.
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              {safeKiosks.map((pt) => {
                                const isSelected = activeMapNode?.id === pt.id;
                                return (
                                  <div
                                    key={pt.id}
                                    className={`p-[12px_14px] rounded-xl border transition-all ${
                                      isSelected
                                        ? 'bg-sky-50/80 border-[#0284C7] shadow-sm'
                                        : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-[13.5px] font-semibold text-[#0F172A] leading-snug truncate">
                                          <span className="text-[#0284C7] mr-1.5 tabular-nums">{pt.id}</span>
                                          {pt.name}
                                        </div>
                                        <div className="text-[12px] font-medium text-[#64748B] mt-0.5 flex items-center gap-1">
                                          <MapPin className="w-3 h-3 text-[#64748B] shrink-0" />
                                          <span>Brgy. {pt.barangay}</span>
                                        </div>
                                      </div>
                                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#065F46] bg-[#D1FAE5] border border-emerald-200/60 shrink-0 whitespace-nowrap">
                                        SAFE · POTABLE
                                      </span>
                                    </div>
                                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100 text-[12px]">
                                      <span className="text-[11px] font-medium text-[#64748B] tabular-nums">
                                        WVI {pt.wvi_score} · Residual Cl {pt.metrics?.residual_chlorine ?? '0.8'} ppm
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMapNode(pt);
                                          setCameraCommand({
                                            center: [pt.lng, pt.lat],
                                            zoom: 17.5,
                                            pitch: 55,
                                            bearing: -20,
                                          });
                                        }}
                                        className="font-semibold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        Locate on Map →
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}

                  {residentTab === 'report' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                          REPORT WATER ISSUE
                        </span>
                        <span className="text-[11px] font-medium text-[#64748B]">
                          Direct Citizen Dispatch
                        </span>
                      </div>
                      <form
                        id="resident-inline-report-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await submitCommunityIssue({
                            barangay: residentReportBarangay,
                            category: residentReportIssueType,
                            description: residentReportNote || residentReportIssueType,
                            facility_id: activeMapNode?.id || selectedPointId || 'NAGA-02',
                          });
                          setResidentReportNote('');
                        }}
                        className="space-y-2.5 text-[12.5px] p-3 rounded-xl bg-slate-50 border border-slate-200/80"
                      >
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                            Issue Category
                          </label>
                          <select
                            value={residentReportIssueType}
                            onChange={(e) => setResidentReportIssueType(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl pl-3 py-2 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#0284C7]"
                          >
                            <option value="Cloudy/Muddy Runoff">Cloudy/Muddy Runoff</option>
                            <option value="Low Pressure">Low Pressure</option>
                            <option value="Leaking Pipe">Leaking Pipe</option>
                            <option value="Broken Handpump">Broken Handpump</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                              Barangay
                            </label>
                            <select
                              value={residentReportBarangay}
                              onChange={(e) => setResidentReportBarangay(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl pl-3 py-2 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#0284C7]"
                            >
                              {Object.keys(NAGA_BARANGAY_METADATA).map((b) => (
                                <option key={b} value={b}>
                                  Brgy. {b}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                              Nearby Kiosk
                            </label>
                            <select
                              value={selectedPointId}
                              onChange={(e) => {
                                setSelectedPointId(e.target.value);
                                const found = waterPoints.find((p) => p.id === e.target.value);
                                if (found) setActiveMapNode(found);
                              }}
                              className="w-full bg-white border border-slate-200 rounded-xl pl-3 py-2 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#0284C7]"
                            >
                              {waterPoints.map((pt) => (
                                <option key={pt.id} value={pt.id}>
                                  {pt.id} · {pt.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                            Incident Details
                          </label>
                          <input
                            type="text"
                            placeholder="Cloudy color, foul odor, low flow..."
                            value={residentReportNote}
                            onChange={(e) => setResidentReportNote(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-[#0F172A] placeholder:text-slate-400 outline-none focus:border-[#0284C7]"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-[12.5px] font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer hud-press"
                        >
                          <Megaphone className="w-4 h-4" />
                          Report Water Issue
                        </button>
                      </form>
                    </div>
                  )}

                  {residentTab === 'incidents' && (
                    <>
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B] tabular-nums">
                          RECENT RESIDENT INCIDENTS ({incidentReports.length})
                        </div>
                        <div className="space-y-1.5">
                          {incidentReports.map((rep) => (
                            <div
                              key={rep.id}
                              className="p-[12px_14px] rounded-xl bg-white border border-slate-200/80 text-[12px] flex items-center justify-between gap-2"
                            >
                              <div className="truncate min-w-0">
                                <span className="font-semibold text-[#0F172A]">Brgy. {rep.barangay}:</span>{' '}
                                <span className="text-[#475569]">{rep.category || rep.issue_type}</span>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full bg-[#E0F2FE] text-[#075985] font-semibold text-[11px] shrink-0">
                                {rep.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {HYGIENE_AND_CONSERVATION_TIPS?.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                            WATER HYGIENE &amp; CONSERVATION TIPS
                          </div>
                          <div className="space-y-1.5">
                            {HYGIENE_AND_CONSERVATION_TIPS.map((tip, idx) => (
                              <div
                                key={tip.id || idx}
                                className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200/70 text-[12px] space-y-0.5"
                              >
                                <div className="font-bold text-slate-900">{tip.title || tip.heading}</div>
                                <p className="text-[11.5px] text-slate-600 leading-snug">
                                  {tip.body || tip.description || tip.tip}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </RoleDrawerShell>
              )}

              {/* BHW (BARANGAY HEALTH WORKER): TABBED FIELD-KIT WORKSPACE (Combined A1+A2 Rail · 100% Data Preserved) */}
              {activeDrawer === 'BHW' && isBHW && (
                <RoleDrawerShell
                  kicker="BARANGAY HEALTH WORKER"
                  title="BHW Mobile Field-Kit Log"
                  subtitle="Updates station WVI & marks Verified telemetry"
                  headerRight={
                    <button
                      type="button"
                      onClick={() => setSimulatedOffline(!simulatedOffline)}
                      className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold uppercase tracking-[0.04em] border shrink-0 flex items-center gap-1 tabular-nums cursor-pointer ${
                        isOnline
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {isOnline ? `Online (${queue.length})` : `Offline (${queue.length})`}
                    </button>
                  }
                  headerExtra={
                    queue.length > 0 && isOnline ? (
                      <button
                        type="button"
                        onClick={() => syncLogsToServer(queue)}
                        className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11.5px] font-bold cursor-pointer"
                      >
                        Sync {queue.length} Queued Inspection(s) Now
                      </button>
                    ) : null
                  }
                  tabs={[
                    { id: 'fieldkit', shortLabel: 'Field Kit', fullTitle: 'Water Quality', icon: Wifi },
                    { id: 'survey', shortLabel: 'Survey', fullTitle: 'Survey & Queue', icon: Users },
                  ]}
                  activeTab={bhwTab}
                  onTabChange={setBhwTab}
                  onClose={() => setActiveDrawer(null)}
                >
                  <form id="bhw-field-kit-form" onSubmit={handleLogSubmit} className="space-y-3.5 text-[12.5px]">
                    {bhwTab === 'fieldkit' && (
                      <>
                        <div>
                          <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                            Water Facility
                          </label>
                          <select
                            value={selectedPointId}
                            onChange={(e) => {
                              setSelectedPointId(e.target.value);
                              const found = waterPoints.find((p) => p.id === e.target.value);
                              if (found) setActiveMapNode(found);
                            }}
                            className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7] focus:bg-white"
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
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              Hardware Status
                            </label>
                            <select
                              value={pumpStatus}
                              onChange={(e) => setPumpStatus(e.target.value)}
                              className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                            >
                              <option value="Functional">Functional</option>
                              <option value="Under Repair">Under Repair</option>
                              <option value="Abandoned">Abandoned</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              BHW Unit ID
                            </label>
                            <input
                              type="text"
                              value={inspectorUnit}
                              onChange={(e) => setInspectorUnit(e.target.value)}
                              className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              pH
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              value={ph}
                              onChange={(e) => setPh(e.target.value)}
                              className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-2.5 py-2 font-semibold text-slate-800 tabular-nums outline-none focus:border-[#0284C7]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              TDS (ppm)
                            </label>
                            <input
                              type="number"
                              value={tdsPpm}
                              onChange={(e) => setTdsPpm(e.target.value)}
                              className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-2.5 py-2 font-semibold text-slate-800 tabular-nums outline-none focus:border-[#0284C7]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              Turbidity
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              value={turbidityNtu}
                              onChange={(e) => setTurbidityNtu(e.target.value)}
                              className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-2.5 py-2 font-semibold text-slate-800 tabular-nums outline-none focus:border-[#0284C7]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              Coliform Indicator
                            </label>
                            <select
                              aria-label="Coliform Indicator"
                              value={coliformPresent ? 'Positive' : 'Negative'}
                              onChange={(e) => setColiformPresent(e.target.value === 'Positive')}
                              className={`w-full border rounded-xl pl-3 py-2 font-semibold outline-none ${
                                coliformPresent
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              }`}
                            >
                              <option value="Negative">Negative (-)</option>
                              <option value="Positive">Positive (+35 WVI)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                              Geotagged Photo
                            </label>
                            <label className="w-full flex items-center gap-1.5 bg-slate-50/90 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-2.5 py-2 cursor-pointer text-[11.5px] font-semibold text-slate-700 truncate">
                              <Camera className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                              <span className="truncate">
                                {bhwPhotoName || 'Attach GPS Photo'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  setBhwPhotoName(file ? file.name : '');
                                }}
                                className="sr-only"
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1">
                            Field Observation Note
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., Muddy runoff observed near well apron after rain"
                            value={incidentNote}
                            onChange={(e) => setIncidentNote(e.target.value)}
                            className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0284C7] focus:bg-white"
                          />
                        </div>

                        <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bhwSanitationHazard}
                            onChange={(e) => setBhwSanitationHazard(e.target.checked)}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <span className="font-semibold text-amber-900 text-[12px]">
                            Flag Sanitation Hazard (Flood / Septic Runoff)
                          </span>
                        </label>

                        <button
                          type="submit"
                          disabled={isSyncing}
                          className="w-full py-2.5 px-4 rounded-xl font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white text-[12.5px] shadow-sm transition-colors cursor-pointer disabled:opacity-60 hud-press"
                        >
                          {isOnline ? 'Submit Field-Kit Log' : 'Save Field-Kit Offline'}
                        </button>
                      </>
                    )}

                    {bhwTab === 'survey' && (
                      <>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                            HOUSEHOLD WATER ACCESS SURVEY
                          </div>
                          <div className="grid grid-cols-2 gap-2 tabular-nums">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Piped / Kiosk Access (%)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={bhwPipedAccessPct}
                                onChange={(e) => setBhwPipedAccessPct(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Avg Fetch Distance (m)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="5000"
                                value={bhwFetchingDistM}
                                onChange={(e) => setBhwFetchingDistM(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                              />
                            </div>
                          </div>
                          <button
                            type="submit"
                            disabled={isSyncing}
                            className="w-full py-2 px-3 rounded-xl font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white text-[12px] shadow-sm transition-colors cursor-pointer disabled:opacity-60 hud-press"
                          >
                            {isOnline ? 'Submit Field-Kit & Survey' : 'Save Survey Offline'}
                          </button>
                        </div>

                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                              OFFLINE STORE-AND-FORWARD QUEUE
                            </span>
                            <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                              {queue.length} pending
                            </span>
                          </div>
                          {queue.length === 0 ? (
                            <p className="text-[12px] text-slate-500">
                              All field-kit inspections are synced with the central server.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {queue.map((item, i) => (
                                <div
                                  key={item.id || i}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[11.5px] flex items-center justify-between gap-2"
                                >
                                  <span className="font-semibold text-amber-900 truncate">
                                    {item.point_id || selectedPointId} · pH {item.ph ?? ph}
                                  </span>
                                  <span className="text-[10px] font-bold uppercase text-amber-700 shrink-0">
                                    Queued
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </form>
                </RoleDrawerShell>
              )}

              {/* CDRRMO OPERATOR: TABBED WORKSPACE (Combined A1+A2 Rail · 100% Data Preserved) */}
              {activeDrawer === 'CDRRMO' && (isCDRRMO || isCoordinator) && (
                <RoleDrawerShell
                  kicker="CDRRMO EMERGENCY OPS"
                  title="Flood Response & Tanker Dispatch"
                  headerRight={
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold uppercase tracking-[0.05em] border shrink-0 ${
                        backendConnected
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {backendConnected ? 'Live API' : 'Offline Fallback'}
                    </span>
                  }
                  tabs={[
                    { id: 'dispatch', shortLabel: 'Dispatch', fullTitle: 'Tanker Dispatch', icon: Truck },
                    { id: 'camps', shortLabel: 'Camps', fullTitle: 'Evac Camps', icon: Users },
                    { id: 'broadcast', shortLabel: 'Broadcast', fullTitle: 'Advisory Alert', icon: Megaphone },
                  ]}
                  activeTab={cdrrmoTab}
                  onTabChange={setCdrrmoTab}
                  onClose={() => setActiveDrawer(null)}
                >
                  {cdrrmoTab === 'dispatch' && (
                    <>
                      {/* Hydrologic Scenario Simulator */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                            HYDROLOGIC SCENARIO SIMULATOR
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowFloodLayer((v) => !v)}
                            className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer ${
                              showFloodLayer
                                ? 'bg-[#0284C7] border-[#0284C7] text-white'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            Flood Layer: {showFloodLayer ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        <div role="group" aria-label="Flood Scenario Control" className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: 'baseline', label: 'Baseline', icon: Sun, activeCls: 'bg-emerald-600 text-white border-emerald-600' },
                            { id: 'monsoon', label: 'Monsoon', icon: CloudRain, activeCls: 'bg-amber-500 text-white border-amber-500' },
                            { id: 'typhoon', label: 'Typhoon Surge', icon: Waves, activeCls: 'bg-red-600 text-white border-red-600' },
                          ].map((sc) => {
                            const Icon = sc.icon;
                            const isActive = scenarioMode === sc.id;
                            return (
                              <button
                                key={sc.id}
                                type="button"
                                onClick={() => handleScenarioChange(sc.id)}
                                className={`px-2 py-1.5 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                                  isActive
                                    ? sc.activeCls
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <Icon className="w-3 h-3 shrink-0" />
                                <span className="truncate">{sc.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-slate-50/90 border border-slate-200/70 rounded-xl p-2.5">
                          <div className="text-[16px] font-bold text-slate-900 tabular-nums">
                            {totalResidents.toLocaleString()}
                          </div>
                          <div className="text-[11px] font-medium text-[#64748B]">Residents Served</div>
                        </div>
                        <div className="bg-slate-50/90 border border-slate-200/70 rounded-xl p-2.5">
                          <div className="text-[16px] font-bold text-red-600 tabular-nums">
                            {criticalPoints.length} Critical
                          </div>
                          <div className="text-[11px] font-medium text-[#64748B]">
                            Mean WVI {avgWvi} / 100
                          </div>
                        </div>
                      </div>

                      {/* Disaster Infrastructure Triage Tag & Filter */}
                      {(() => {
                        const damagedBase = waterPoints.filter(
                          (p) =>
                            p.status !== 'Functional' ||
                            p.wvi_score >= advisoryThreshold ||
                            p.metrics?.coliform_present
                        );
                        const triagedPoints = damagedBase.filter((p) => {
                          if (triageFilter === 'REPAIR') {
                            return p.status === 'Under Repair' || p.status === 'Abandoned';
                          }
                          if (triageFilter === 'DISINFECTION') {
                            return (
                              Boolean(p.metrics?.coliform_present) ||
                              Number(p.metrics?.turbidity_ntu ?? 0) >= 5.0 ||
                              p.wvi_score >= advisoryThreshold
                            );
                          }
                          return true;
                        });

                        return (
                          <div className="space-y-2 pt-1 border-t border-slate-200/80">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                                DISASTER INFRASTRUCTURE TRIAGE
                              </span>
                              <span className="text-[11px] font-semibold text-[#64748B] tabular-nums">
                                {triagedPoints.length} flagged
                              </span>
                            </div>
                            <select
                              aria-label="Disaster Infrastructure Triage Filter"
                              value={triageFilter}
                              onChange={(e) => setTriageFilter(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 py-1.5 text-[12px] font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                            >
                              <option value="ALL">All Flagged Infrastructure ({damagedBase.length})</option>
                              <option value="REPAIR">Needs Emergency Repair</option>
                              <option value="DISINFECTION">Needs Disinfection Kit</option>
                            </select>

                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {triagedPoints.length === 0 ? (
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[12px] text-slate-500">
                                  No infrastructure items match this triage tag.
                                </div>
                              ) : (
                                triagedPoints.map((pt) => {
                                  const needsRepair =
                                    pt.status === 'Under Repair' || pt.status === 'Abandoned';
                                  return (
                                    <button
                                      key={pt.id}
                                      type="button"
                                      onClick={() => {
                                        setActiveMapNode(pt);
                                        setCameraCommand({
                                          center: [pt.lng, pt.lat],
                                          zoom: 17,
                                          pitch: 55,
                                          bearing: -15,
                                        });
                                      }}
                                      className="w-full text-left p-[10px_12px] rounded-xl bg-white hover:bg-sky-50/70 border border-slate-200/80 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-[12.5px] font-semibold text-[#0F172A] truncate">
                                          <span className="text-[#0284C7] mr-1 tabular-nums">{pt.id}</span>
                                          {pt.name}
                                        </div>
                                        <div className="text-[11px] font-medium text-[#64748B]">
                                          Brgy. {pt.barangay} · {pt.status}
                                        </div>
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border shrink-0 whitespace-nowrap ${
                                          needsRepair
                                            ? 'bg-[#FEE2E2] text-[#991B1B] border-red-200/60'
                                            : 'bg-[#FEF3C7] text-[#92400E] border-amber-200/60'
                                        }`}
                                      >
                                        {needsRepair ? 'Emergency Repair' : 'Disinfection Kit'}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Critical Tanker Dispatch Queue */}
                      <div className="space-y-2 pt-1 border-t border-slate-200/80">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                          CRITICAL (65+) TANKER DISPATCH QUEUE ({criticalPoints.length})
                        </div>
                        {criticalPoints.length === 0 ? (
                          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[12px]">
                            No facilities currently at or above Critical WVI threshold.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {criticalPoints.map((pt) => (
                              <div
                                key={pt.id}
                                className="p-[12px_14px] rounded-xl bg-red-50/70 border border-red-200/80 flex items-center justify-between gap-2 text-[12px]"
                              >
                                <div className="min-w-0">
                                  <div className="text-[13.5px] font-semibold text-[#0F172A] truncate">
                                    <span className="text-red-700 mr-1.5 tabular-nums">{pt.id}</span>
                                    {pt.name}
                                  </div>
                                  <div className="text-[11px] font-medium text-[#64748B] tabular-nums">
                                    Brgy. {pt.barangay} · WVI {pt.wvi_score}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleVerifyOrTanker(
                                      pt.id,
                                      pt.tanker_dispatched ? 'resolve_tanker' : 'dispatch_tanker'
                                    )
                                  }
                                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors cursor-pointer ${
                                    pt.tanker_dispatched
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-red-600 text-white hover:bg-red-700'
                                  }`}
                                >
                                  {pt.tanker_dispatched ? 'Resolve' : 'Dispatch Tanker'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {cdrrmoTab === 'camps' && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                        EVACUATION CAMPS &amp; WATER DEMAND ({evacuationCamps.length})
                      </div>
                      <div className="space-y-2">
                        {evacuationCamps.map((camp) => {
                          const pct = Math.min(
                            100,
                            Math.round((camp.supply_liters / (camp.daily_demand_liters || 1)) * 100)
                          );
                          return (
                            <div
                              key={camp.id}
                              className="p-[12px_14px] rounded-xl bg-slate-50/90 border border-slate-200/80 text-[12.5px] space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[13.5px] font-semibold text-[#0F172A] truncate">{camp.name}</div>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                                    pct >= 100
                                      ? 'bg-[#D1FAE5] text-[#065F46] border border-emerald-200/60'
                                      : pct >= 60
                                      ? 'bg-[#FEF3C7] text-[#92400E] border border-amber-200/60'
                                      : 'bg-[#FEE2E2] text-[#991B1B] border border-red-200/60'
                                  }`}
                                >
                                  {camp.status}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#475569] tabular-nums">
                                <span>
                                  Brgy. {camp.barangay_name} · {camp.evacuees} evacuees
                                </span>
                                <span>
                                  {camp.supply_liters.toLocaleString()} / {camp.daily_demand_liters.toLocaleString()} L
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUpdateCampSupply(camp.id, 1000)}
                                className="w-full py-1.5 rounded-xl bg-white hover:bg-sky-50 border border-slate-200 text-[#0284C7] text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                +1,000 L Tanker Refill to Camp
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {cdrrmoTab === 'broadcast' && (
                    <form
                      id="cdrrmo-advisory-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleBroadcastAdvisory({
                          barangay_name: advBarangay,
                          level: advLevel,
                          message: advMessage,
                        });
                        setAdvMessage('');
                      }}
                      className="space-y-2.5 text-[12px]"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                        BOIL-WATER ADVISORY BROADCASTER
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={advBarangay}
                          onChange={(e) => setAdvBarangay(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl pl-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                        >
                          {Object.keys(NAGA_BARANGAY_METADATA).map((b) => (
                            <option key={b} value={b}>
                              Brgy. {b}
                            </option>
                          ))}
                        </select>
                        <select
                          value={advLevel}
                          onChange={(e) => setAdvLevel(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl pl-3 py-2 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                        >
                          <option value="Boil-Water Advisory">Boil-Water Advisory</option>
                          <option value="Emergency Tanker Order">Emergency Tanker Order</option>
                          <option value="All-Clear Notice">All-Clear Notice</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Advisory instructions for residents..."
                        value={advMessage}
                        onChange={(e) => setAdvMessage(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0284C7]"
                      />
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[12.5px] font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer hud-press"
                      >
                        <Megaphone className="w-4 h-4" />
                        Broadcast Advisory
                      </button>
                    </form>
                  )}
                </RoleDrawerShell>
              )}

              {/* LGU / WASH COORDINATOR: TABBED REGISTRY & GOVERNANCE CONSOLE (Combined A1+A2 Rail · 100% Data Preserved) */}
              {activeDrawer === 'WASH' && isCoordinator && (
                <RoleDrawerShell
                  kicker="LGU / WASH COORDINATOR"
                  title="WASH Registry & Equity Analytics"
                  subtitle={`${pnsdwCompliantCount} of ${waterPoints.length} sites meet DOH drinking-water standards`}
                  headerRight={
                    <span
                      title="PNSDW (DOH Philippine National Standards for Drinking Water): percentage of monitored water points passing drinking-water safety thresholds."
                      className={`px-2 py-1 rounded-xl border text-[10.5px] font-bold tabular-nums shrink-0 cursor-help ${
                        pnsdwCompliantPct >= 75
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {pnsdwCompliantPct}% Safe
                    </span>
                  }
                  tabs={[
                    { id: 'equity', shortLabel: 'Equity', fullTitle: 'Barangay Equity', icon: BarChart3 },
                    { id: 'budget', shortLabel: 'Budget', fullTitle: 'Budget & Alloc', icon: Wallet },
                    { id: 'registry', shortLabel: 'Registry', fullTitle: 'Register Point', icon: PlusCircle },
                    { id: 'governance', shortLabel: 'Admin', fullTitle: 'Governance', icon: Lock },
                  ]}
                  activeTab={washTab}
                  onTabChange={setWashTab}
                  onClose={() => setActiveDrawer(null)}
                >
                  {washTab === 'equity' &&
                    (() => {
                      const functionalPts = waterPoints.filter((p) => p.status === 'Functional');
                      const totalPop = Object.values(NAGA_BARANGAY_METADATA).reduce(
                        (s, m) => s + (m.population || 0),
                        0
                      );
                      const cityRatio = Math.round(totalPop / Math.max(functionalPts.length, 1));
                      const barangayEquityRows = Object.entries(NAGA_BARANGAY_METADATA)
                        .map(([name, meta]) => {
                          const fnCount = functionalPts.filter(
                            (p) => (p.barangay || p.barangay_name || '').toLowerCase() === name.toLowerCase()
                          ).length;
                          return {
                            name,
                            pop: meta.population || 0,
                            fnCount,
                            ratio: fnCount > 0 ? Math.round((meta.population || 0) / fnCount) : null,
                          };
                        })
                        .filter((r) => r.fnCount > 0 || ['Sabang', 'Tabuco', 'Mabolo'].includes(r.name))
                        .slice(0, 6);

                      const sortedRows = [...barangayEquityRows].sort((a, b) => {
                        if (!a.ratio && b.ratio) return -1;
                        if (a.ratio && !b.ratio) return 1;
                        return (b.ratio || 0) - (a.ratio || 0);
                      });

                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                              BARANGAY ACCESS EQUITY
                            </span>
                            <span className="text-[11.5px] font-bold text-slate-900 tabular-nums">
                              {cityRatio.toLocaleString()} res / kiosk
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            Residents served per functional water kiosk (lower is better; red indicates no active kiosk).
                          </p>
                          <div className="space-y-1.5 text-[11.5px]">
                            {sortedRows.map((row) => (
                              <div
                                key={row.name}
                                className="px-2.5 py-2 rounded-xl bg-slate-50/90 border border-slate-900/[0.06] flex items-center justify-between gap-2 tabular-nums"
                              >
                                <span className="font-semibold text-slate-800">Brgy. {row.name}</span>
                                {row.ratio ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/70 text-[11px] font-semibold text-emerald-800 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span>{row.ratio.toLocaleString()} res/kiosk</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-200/80 text-[11px] font-semibold text-red-700 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                    <span>No active kiosk</span>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={exportAuditCsv}
                            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-900/[0.09] text-[#0284C7] text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer hud-press"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export Multi-Year Audit CSV
                          </button>
                        </div>
                      );
                    })()}

                  {washTab === 'budget' && (
                    <form onSubmit={handleAssignWashAllocation} className="space-y-2.5 text-[12px]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                        WASH RESOURCE &amp; BUDGET ALLOCATION
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 tabular-nums">
                        <select
                          value={allocBarangay}
                          onChange={(e) => setAllocBarangay(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl pl-2.5 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                        >
                          {Object.keys(NAGA_BARANGAY_METADATA).map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={allocKits}
                          onChange={(e) => setAllocKits(e.target.value)}
                          placeholder="Kits"
                          className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                        />
                        <input
                          type="number"
                          min="5000"
                          step="1000"
                          value={allocBudgetPhp}
                          onChange={(e) => setAllocBudgetPhp(e.target.value)}
                          placeholder="PHP"
                          className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-semibold transition-colors cursor-pointer hud-press"
                      >
                        Assign Filtration Kits &amp; Budget
                      </button>
                      <div className="space-y-1.5 tabular-nums pt-1">
                        {washAllocations.map((al) => (
                          <div
                            key={al.id}
                            className="px-2.5 py-2 rounded-xl bg-slate-50/90 border border-slate-200/80 flex items-center justify-between gap-2 text-[11.5px]"
                          >
                            <span className="font-semibold text-slate-800 truncate">
                              Brgy. {al.barangay}: {al.kits} kits · PHP {Number(al.budgetPhp).toLocaleString()}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] shrink-0">
                              {al.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </form>
                  )}

                  {washTab === 'registry' && (
                    <>
                      <form
                        id="register-water-point-form"
                        onSubmit={handleRegisterFacility}
                        className="space-y-2.5 text-[12.5px]"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                          REGISTER NEW WATER POINT
                        </div>
                        <input
                          type="text"
                          placeholder="Facility Name (e.g., San Felipe Solar Pump)"
                          value={newFacName}
                          onChange={(e) => setNewFacName(e.target.value)}
                          className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 font-medium text-[#0F172A] outline-none focus:border-[#0284C7]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={newFacBarangay}
                            onChange={(e) => setNewFacBarangay(e.target.value)}
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl pl-3 py-2 font-semibold text-[#0F172A] outline-none"
                          >
                            {Object.keys(NAGA_BARANGAY_METADATA).map((b) => (
                              <option key={b} value={b}>
                                Brgy. {b}
                              </option>
                            ))}
                          </select>
                          <select
                            value={newFacSourceType}
                            onChange={(e) => setNewFacSourceType(e.target.value)}
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl pl-3 py-2 font-semibold text-[#0F172A] outline-none"
                          >
                            <option value="Solar Pump">Solar Pump</option>
                            <option value="Shallow Well">Shallow Well</option>
                            <option value="Public Kiosk">Public Kiosk</option>
                            <option value="Handpump">Handpump</option>
                            <option value="Communal Spring">Communal Spring</option>
                            <option value="School Filtration">School Filtration</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2 tabular-nums">
                          <input
                            type="number"
                            step="0.0001"
                            value={newFacLat}
                            onChange={(e) => setNewFacLat(e.target.value)}
                            placeholder="Lat"
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 py-1.5 font-semibold text-[#0F172A]"
                          />
                          <input
                            type="number"
                            step="0.0001"
                            value={newFacLng}
                            onChange={(e) => setNewFacLng(e.target.value)}
                            placeholder="Lng"
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 py-1.5 font-semibold text-[#0F172A]"
                          />
                          <input
                            type="number"
                            value={newFacPop}
                            onChange={(e) => setNewFacPop(e.target.value)}
                            placeholder="Pop"
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 py-1.5 font-semibold text-[#0F172A]"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-[12.5px] font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer hud-press"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Register Water Point
                        </button>
                      </form>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!coordPolicyMsg.trim()) return;
                          handleBroadcastAdvisory({
                            barangay_name: 'Citywide (All 27 Barangays)',
                            level: 'WASH Policy Directive',
                            message: coordPolicyMsg,
                          });
                          setCoordPolicyMsg('');
                        }}
                        className="space-y-2 pt-3 border-t border-[rgba(15,23,42,0.08)] text-[12.5px]"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                          POLICY / WASH GUIDELINE BROADCAST
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g., Mandatory weekly chlorine dosing audit..."
                            value={coordPolicyMsg}
                            onChange={(e) => setCoordPolicyMsg(e.target.value)}
                            className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-[#0F172A] outline-none focus:border-[#0284C7]"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold shrink-0 cursor-pointer text-[12px]"
                          >
                            Publish
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {washTab === 'governance' && (
                    <>
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-[0.05em]">
                          INCIDENT REPORT MODERATION ({incidentReports.length})
                        </div>
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {incidentReports.map((rep) => (
                            <div
                              key={rep.id}
                              className="p-[12px_14px] rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[12.5px] space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[13px] font-semibold text-[#0F172A]">
                                  {rep.id} <span className="font-medium text-[#64748B]">· Brgy. {rep.barangay}</span>
                                </span>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0284C7]">
                                  {rep.status}
                                </span>
                              </div>
                              <p className="text-[12px] text-[#475569] leading-[1.45]">{rep.description}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {['Under LGU Review', 'Tanker Dispatched', 'Resolved'].map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleUpdateReportStatus(rep.id, st)}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
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

                      <div className="space-y-2 pt-2 border-t border-[rgba(15,23,42,0.08)]">
                        <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-[0.05em]">
                          SYSTEM ACTIVITY LOG
                        </div>
                        <div className="max-h-28 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl bg-[#F8FAFC] text-[11.5px]">
                          {auditLogs.map((log) => (
                            <div key={log.id} className="px-3 py-1.5 leading-relaxed">
                              <span className="font-semibold text-[#0F172A] tabular-nums">
                                [{log.time}] {log.actor}:
                              </span>{' '}
                              <span className="text-[#475569]">{log.action}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <form
                        onSubmit={handleUpdateThresholds}
                        className="space-y-2 pt-2 border-t border-[rgba(15,23,42,0.08)]"
                      >
                        <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-[0.05em]">
                          WVI THRESHOLD CONFIGURATION
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[12px] tabular-nums">
                          <div>
                            <label className="block text-[#64748B] font-medium mb-1">Advisory (&gt;=)</label>
                            <input
                              type="number"
                              value={advisoryThreshold}
                              onChange={(e) => setAdvisoryThreshold(e.target.value)}
                              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 py-1.5 font-semibold text-[#0F172A]"
                            />
                          </div>
                          <div>
                            <label className="block text-[#64748B] font-medium mb-1">Critical (&gt;=)</label>
                            <input
                              type="number"
                              value={criticalThreshold}
                              onChange={(e) => setCriticalThreshold(e.target.value)}
                              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 py-1.5 font-semibold text-[#0F172A]"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 py-1.5 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-[12px] font-semibold transition-colors cursor-pointer"
                          >
                            Apply Thresholds
                          </button>
                          <button
                            type="button"
                            onClick={handleAdminReset}
                            className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold transition-colors cursor-pointer"
                          >
                            Reset Telemetry
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </RoleDrawerShell>
              )}
            </div>

            {/* TOP-RIGHT HUD: Frosted-White Telemetry Inspector Drawer + Vertical Floating Map Toolbar */}
            <div className="pointer-events-auto flex items-start gap-3 shrink-0">
              <TelemetryInspectorDrawer
                node={activeMapNode}
                collapsed={drawerCollapsed}
                onToggleCollapse={() => setDrawerCollapsed((prev) => !prev)}
                onClose={() => setActiveMapNode(null)}
                authenticatedRole={authenticatedRole}
                isOnline={isOnline}
                pendingSyncCount={queue.length}
                onSyncPendingQueue={() => syncLogsToServer(queue)}
                showFloodLayer={showFloodLayer}
                onToggleFloodLayer={() => setShowFloodLayer((v) => !v)}
                advisoryThreshold={advisoryThreshold}
                criticalThreshold={criticalThreshold}
                onAdvisoryThresholdChange={setAdvisoryThreshold}
                onCriticalThresholdChange={setCriticalThreshold}
                onApplyThresholds={handleUpdateThresholds}
                onAdminReset={handleAdminReset}
                onSubmitIssue={submitCommunityIssue}
                onSubmitFieldKit={handleSubmitFieldKit}
                onVerifyOrTanker={handleVerifyOrTanker}
                onBroadcastAdvisory={handleBroadcastAdvisory}
                onFindNearestSafe={handleFindNearestSafe}
              />

              <div
                role="toolbar"
                aria-label="Map navigation and operational overlays"
                onMouseLeave={hideRailTip}
                className="relative hud-surface rounded-2xl p-1.5 flex flex-col gap-1"
              >
                {[
                  {
                    id: 'zoom-in',
                    label: 'Zoom In',
                    onClick: () => setCameraCommand({ action: 'ZOOM_IN', ts: Date.now() }),
                    icon: Plus,
                  },
                  {
                    id: 'zoom-out',
                    label: 'Zoom Out',
                    onClick: () => setCameraCommand({ action: 'ZOOM_OUT', ts: Date.now() }),
                    icon: Minus,
                  },
                  {
                    id: 'city-closeup',
                    label: 'Naga City Close-Up',
                    onClick: () => {
                      setActiveMapNode(null);
                      setCameraCommand({ action: 'OVERVIEW', ts: Date.now() });
                    },
                    icon: Compass,
                  },
                  {
                    id: 'whole-globe',
                    label: 'Whole Globe',
                    onClick: () => {
                      setActiveMapNode(null);
                      setCameraCommand({ action: 'RESET', ts: Date.now() });
                    },
                    icon: Globe,
                  },
                ].map(({ id, label, onClick, icon: Icon }) => (
                  <div key={id} className="relative flex items-center">
                    {railTooltip === label && (
                      <div
                        role="tooltip"
                        className="hud-enter pointer-events-none absolute right-full mr-2.5 px-2.5 py-1 rounded-lg bg-slate-900/95 text-white text-[11px] font-semibold whitespace-nowrap shadow-md"
                      >
                        {label}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onClick}
                      onMouseEnter={() => showRailTip(label, false)}
                      onFocus={() => showRailTip(label, true)}
                      onBlur={hideRailTip}
                      aria-label={label}
                      className="w-10 h-10 rounded-[10px] bg-white/80 hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer hud-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
                    >
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}

                <div className="h-px bg-slate-900/[0.09] mx-1.5 my-0.5" />

                {[
                  {
                    id: 'risk-layer',
                    label: showFloodLayer ? 'Hide WVI Risk Zones' : 'Show WVI Risk Zones',
                    active: showFloodLayer,
                    onClick: () => setShowFloodLayer(!showFloodLayer),
                    icon: Layers,
                  },
                  {
                    id: 'tanker-routes',
                    label: showTankerRoutes ? 'Hide Tanker Dispatch Routes' : 'Show Tanker Dispatch Routes',
                    active: showTankerRoutes,
                    onClick: () => setShowTankerRoutes(!showTankerRoutes),
                    icon: Truck,
                  },
                  {
                    id: 'map-labels',
                    label: showLabels ? 'Hide Facility Labels' : 'Show Facility Labels',
                    active: showLabels,
                    onClick: () => setShowLabels(!showLabels),
                    icon: MapPin,
                  },
                ].map(({ id, label, active, onClick, icon: Icon }) => (
                  <div key={id} className="relative flex items-center">
                    {railTooltip === label && (
                      <div
                        role="tooltip"
                        className="hud-enter pointer-events-none absolute right-full mr-2.5 px-2.5 py-1 rounded-lg bg-slate-900/95 text-white text-[11px] font-semibold whitespace-nowrap shadow-md"
                      >
                        {label}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onClick}
                      onMouseEnter={() => showRailTip(label, false)}
                      onFocus={() => showRailTip(label, true)}
                      onBlur={hideRailTip}
                      aria-label={label}
                      aria-pressed={active}
                      className={`w-10 h-10 rounded-[10px] flex items-center justify-center cursor-pointer hud-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] ${
                        active
                          ? 'bg-[#0284C7] text-white shadow-sm'
                          : 'bg-white/80 hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: Bottom-Right Operations Dock (WVI Legend moved to Top-Center) */}
          {(activeDrawer === 'CDRRMO' || activeDrawer === 'WASH') && (isCDRRMO || isCoordinator) && !feedOpen && !activeMapNode && (
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-end gap-4 shrink-0 pointer-events-none lg:absolute lg:bottom-9 lg:right-4 lg:z-20">
              <div
                className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-lg w-full lg:w-[344px] xl:w-[364px] 2xl:w-[384px] overflow-hidden ml-auto"
                style={{
                  background: 'rgba(255, 255, 255, 0.90)',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  borderRadius: '14px',
                  boxShadow: '0 10px 28px -8px rgba(15, 23, 42, 0.14)',
                }}
              >
                <div className="px-3.5 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-2">
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
                        className={`px-2 py-1 rounded-xl text-[11px] font-bold transition-colors tabular-nums cursor-pointer ${
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
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 cursor-pointer"
                  >
                    {dockCollapsed ? 'Expand ▲' : 'Minimize ▼'}
                  </button>
                </div>

                {!dockCollapsed && (
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                    {opsDockPoints.map((pt) => (
                      <div
                        key={pt.id}
                        onClick={() => setActiveMapNode(pt)}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50 text-[12.5px]"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">
                            <span className="text-[#0284C7] mr-1.5 tabular-nums">{pt.id}</span>
                            {pt.name}
                          </div>
                          <div className="text-[11.5px] text-slate-500">
                            Brgy. {pt.barangay} · {pt.source_type}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderStatusPill(pt.wvi_score)}
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ROLE AUTHENTICATION MODAL (Enforces Credential Check on Role Selection) */}
        {pendingRoleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <form
              key={`auth-modal-${pendingRoleTarget.role}-${authShakeTick}`}
              onSubmit={handleAuthenticateSubmit}
              className={`bg-white border border-slate-900/[0.10] rounded-3xl shadow-xl max-w-md w-full p-5 space-y-4 ${
                authShakeTick > 0 && authError ? 'hud-shake' : 'hud-enter'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-full bg-sky-50 text-[#0284C7]">
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
                  id="role-access-credential"
                  type="text"
                  value={accessCodeInput}
                  onChange={(e) => {
                    setAccessCodeInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  aria-invalid={Boolean(authError)}
                  aria-describedby={authError ? 'role-auth-error' : undefined}
                  placeholder="Enter access credential..."
                  className={`w-full bg-slate-50 border rounded-xl px-3 py-2 font-mono font-bold text-slate-900 outline-none transition-colors ${
                    authError
                      ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                      : 'border-slate-900/[0.12] focus:border-[#0284C7]'
                  }`}
                />
                <div className="text-[11px] text-slate-500">
                  Demo evaluation credential: <strong className="font-mono text-slate-800">{pendingRoleTarget.defaultCode}</strong>
                </div>
                {authError && (
                  <p
                    id="role-auth-error"
                    role="alert"
                    aria-live="assertive"
                    className="text-xs font-semibold text-red-600 flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{authError}</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingRoleTarget(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold"
                >
                  Verify & Sign In
                </button>
              </div>
            </form>
          </div>
        )}

        {/* COMMUNITY INCIDENT REPORT MODAL */}
        {reportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-xl max-w-md w-full p-5 space-y-4">
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

              <div className="space-y-3.5 text-[13px]">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1.5">
                    Barangay
                  </label>
                  <div className="relative">
                    <select
                      value={residentReportBarangay}
                      onChange={(e) => setResidentReportBarangay(e.target.value)}
                      className="w-full appearance-none bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3.5 pr-9 py-2.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                    >
                      {Object.keys(NAGA_BARANGAY_METADATA).map((brgy) => (
                        <option key={brgy} value={brgy}>
                          Brgy. {brgy}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1.5">
                    Issue Category
                  </label>
                  <div className="relative">
                    <select
                      value={residentReportIssueType}
                      onChange={(e) => setResidentReportIssueType(e.target.value)}
                      className="w-full appearance-none bg-slate-50/90 border border-slate-200/80 rounded-xl pl-3.5 pr-9 py-2.5 font-semibold text-slate-800 outline-none focus:border-[#0284C7]"
                    >
                      <option value="Broken Handpump">Broken Handpump</option>
                      <option value="Muddy Runoff">Muddy Runoff</option>
                      <option value="Foul Odor">Foul Odor</option>
                      <option value="Leaking Pipe">Leaking Pipe</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-1.5">
                    Observation Details
                  </label>
                  <input
                    type="text"
                    placeholder="Describe water condition or pump issue..."
                    value={residentReportNote}
                    onChange={(e) => setResidentReportNote(e.target.value)}
                    className="w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 outline-none focus:border-[#0284C7]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCommunityReportSubmit}
                  className="px-4 py-1.5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold"
                >
                  Submit Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    
  );
}
