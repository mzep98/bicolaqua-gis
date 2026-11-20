import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  FlaskConical,
  MapPin,
  Megaphone,
  Navigation,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';

function getSafetyMeta(node, advisoryThreshold = 35, criticalThreshold = 65) {
  const wvi = Number(node?.wvi_score ?? 0);
  const coliform = Boolean(node?.metrics?.coliform_present);
  const status = node?.status || 'Functional';

  if (status === 'Abandoned' || coliform || wvi >= criticalThreshold) {
    return {
      tier: 'High Risk',
      publicRating: 'Do Not Drink — Use CDRRMO Tanker',
      badgeClass: 'bg-[#FEE2E2] text-[#991B1B] border border-red-200/60',
      barColor: 'bg-[#EF4444]',
      accentText: 'text-[#991B1B]',
      textColor: 'text-[#991B1B]',
    };
  }
  if (status === 'Under Repair' || wvi >= advisoryThreshold) {
    return {
      tier: 'Moderate Advisory',
      publicRating: 'Boil Water / Advisory Recommended',
      badgeClass: 'bg-[#FEF3C7] text-[#92400E] border border-amber-200/60',
      barColor: 'bg-[#F59E0B]',
      accentText: 'text-[#92400E]',
      textColor: 'text-[#92400E]',
    };
  }
  return {
    tier: 'Low Risk · Safe',
    publicRating: 'Safe to Drink (PNSDW Compliant)',
    badgeClass: 'bg-[#D1FAE5] text-[#065F46] border border-emerald-200/60',
    barColor: 'bg-[#10B981]',
    accentText: 'text-[#065F46]',
    textColor: 'text-[#065F46]',
  };
}

function buildTrendSeries(wvi) {
  const base = Math.max(6, Math.min(96, Number(wvi || 15)));
  return [
    Math.max(4, Math.round(base * 0.72)),
    Math.max(5, Math.round(base * 0.81)),
    Math.max(6, Math.round(base * 0.78)),
    Math.max(6, Math.round(base * 0.92)),
    Math.max(7, Math.round(base * 0.96)),
    Math.round(base),
  ];
}

function normalizePh(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 14 ? n.toFixed(1) : '7.1';
}

export default function TelemetryInspectorDrawer({
  node,
  collapsed,
  onToggleCollapse,
  onClose,
  authenticatedRole,
  isOnline,
  pendingSyncCount = 0,
  onSyncPendingQueue,
  showFloodLayer,
  onToggleFloodLayer,
  advisoryThreshold = 35,
  criticalThreshold = 65,
  onAdvisoryThresholdChange,
  onCriticalThresholdChange,
  onApplyThresholds,
  onAdminReset,
  onSubmitIssue,
  onSubmitFieldKit,
  onVerifyOrTanker,
  onBroadcastAdvisory,
  onFindNearestSafe,
}) {
  // Quick incident report form (Community Resident / BHW)
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueCategory, setIssueCategory] = useState('Muddy Runoff');
  const [issueNotes, setIssueNotes] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // BHW Field-Kit inline form state
  const [kitPh, setKitPh] = useState('7.0');
  const [kitTds, setKitTds] = useState('240');
  const [kitTurbidity, setKitTurbidity] = useState('1.8');
  const [kitColiform, setKitColiform] = useState(false);
  const [kitHardwareStatus, setKitHardwareStatus] = useState('Functional');
  const [kitSanitationHazard, setKitSanitationHazard] = useState(false);
  const [kitNote, setKitNote] = useState('');
  const [submittingKit, setSubmittingKit] = useState(false);

  // CDRRMO / Coordinator inline advisory/guideline state
  const [advisoryMsg, setAdvisoryMsg] = useState('');
  const [submittingAdv, setSubmittingAdv] = useState(false);

  useEffect(() => {
    if (!node) return;
    const m = node.metrics || {};
    setKitPh(normalizePh(m.ph));
    setKitTds(String(Math.round(Number(m.tds_ppm ?? 240))));
    setKitTurbidity(String(Number(m.turbidity_ntu ?? 1.8).toFixed(1)));
    setKitColiform(Boolean(m.coliform_present));
    setKitHardwareStatus(node.status || 'Functional');
    setKitSanitationHazard(Boolean(m.coliform_present));
    setKitNote('');
    setIssueOpen(false);
    setIssueNotes('');
    setAdvisoryMsg('');
  }, [node?.id, node?.wvi_score, node?.status]);

  const safety = useMemo(
    () => getSafetyMeta(node, advisoryThreshold, criticalThreshold),
    [node, advisoryThreshold, criticalThreshold]
  );

  const wviTrend = useMemo(
    () => buildTrendSeries(node?.wvi_score),
    [node?.wvi_score]
  );

  if (!node) return null;

  const metrics = node.metrics || {};
  const turb = Number(metrics.turbidity_ntu ?? 1.2);
  const phVal = Number(metrics.ph ?? 7.1);
  const cl2 = Number(metrics.residual_chlorine ?? 0.4);
  const tds = Number(metrics.tds_ppm ?? 210);
  const isTankerActive = Boolean(node.tanker_dispatched);
  const clMin = isTankerActive ? 0.5 : 0.3;

  const turbOk = turb < 5.0;
  const phOk = phVal >= 6.5 && phVal <= 8.5;
  const clOk = cl2 >= clMin && cl2 <= 1.5;

  async function handleQuickIncidentSubmit(e) {
    e.preventDefault();
    if (!onSubmitIssue || submittingIssue) return;
    setSubmittingIssue(true);
    try {
      await onSubmitIssue({
        barangay: node.barangay,
        pointId: node.isBarangay ? null : node.id,
        category: issueCategory,
        description:
          issueNotes.trim() || `${issueCategory} reported near ${node.name}.`,
      });
      setIssueNotes('');
      setIssueOpen(false);
    } finally {
      setSubmittingIssue(false);
    }
  }

  async function handleFieldKitSubmit(e) {
    e.preventDefault();
    if (!onSubmitFieldKit || submittingKit || node.isBarangay) return;
    setSubmittingKit(true);
    try {
      await onSubmitFieldKit(node.id, {
        ph: parseFloat(kitPh) || 7.0,
        tds_ppm: parseFloat(kitTds) || 240,
        turbidity_ntu: parseFloat(kitTurbidity) || 1.8,
        coliform_positive: Boolean(kitColiform),
        hardware_status: kitHardwareStatus,
        sanitation_hazard: kitSanitationHazard,
        note:
          kitNote.trim() ||
          (kitSanitationHazard
            ? 'Sanitation / runoff hazard flagged during BHW inspection.'
            : 'Routine BHW field-kit test verified.'),
      });
      setKitNote('');
    } finally {
      setSubmittingKit(false);
    }
  }

  async function handleInlineBroadcast(e, levelLabel) {
    e.preventDefault();
    if (!onBroadcastAdvisory || submittingAdv) return;
    const msg =
      advisoryMsg.trim() ||
      (levelLabel === 'WASH Guideline'
        ? `Municipal WASH compliance guideline issued for Brgy. ${node.barangay}.`
        : `Boil drinking water for 3 minutes or draw from CDRRMO Tanker at Brgy. ${node.barangay}.`);
    setSubmittingAdv(true);
    try {
      await onBroadcastAdvisory({
        barangay_name: node.barangay,
        level: levelLabel,
        message: msg,
      });
      setAdvisoryMsg('');
    } finally {
      setSubmittingAdv(false);
    }
  }

  return (
    <aside
      aria-label="Telemetry and Action Inspector"
      className="pointer-events-auto fixed inset-x-3 bottom-3 z-40 md:static md:w-[360px] md:z-20 bg-white/95 backdrop-blur-md border border-slate-200/80 text-slate-900 rounded-2xl shadow-lg flex flex-col overflow-hidden transition-all duration-200 max-h-[60vh] md:max-h-[calc(100dvh-156px)] shrink-0"
    >
      {/* Drag Handle on mobile bottom-sheet */}
      <div className="flex justify-center pt-2 md:hidden shrink-0">
        <span className="h-1 w-10 rounded-full bg-slate-300" />
      </div>

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white/95 flex items-start justify-between gap-2.5 shrink-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-center text-[#0284C7] shrink-0 mt-0.5">
            {node.isBarangay ? (
              <MapPin className="w-4 h-4" />
            ) : (
              <Droplets className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {node.isBarangay ? 'Barangay Zone' : node.id}
              </span>
              {!node.isBarangay && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                    node.verified
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {node.verified ? 'BHW Verified' : 'Sensor / Sim'}
                </span>
              )}
              {isTankerActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-[#0284C7] border border-sky-200">
                  Tanker Active
                </span>
              )}
            </div>
            <h2 className="text-[15px] font-bold text-slate-900 leading-snug tracking-tight truncate mt-0.5">
              {node.name}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 text-[#0284C7] shrink-0" />
              Brgy. {node.barangay}
              {!node.isBarangay && node.source_type ? ` · ${node.source_type}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand Inspector' : 'Collapse Inspector'}
            className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Inspector"
            className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsible Scroll Body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 text-xs">
          {/* WVI Summary + Sparkline Bar */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Water Vulnerability Index
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                    {node.wvi_score}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                    / 100
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${safety.badgeClass}`}
                  >
                    {safety.tier}
                  </span>
                </div>
              </div>

              {/* Compact Sparkline */}
              <div
                className="flex items-end gap-1 h-9 px-2 py-1 rounded-xl bg-white border border-slate-200/80 shrink-0"
                title="Recent WVI Trend"
              >
                {wviTrend.map((val, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${Math.max(18, val)}%` }}
                    className={`w-1.5 rounded-full ${
                      idx === wviTrend.length - 1 ? safety.barColor : 'bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Linear Threshold Progress */}
            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.max(4, Number(node.wvi_score ?? 0)))}%` }}
                className={`h-full rounded-full transition-all duration-300 ${safety.barColor}`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 tabular-nums">
              <span>
                Status:{' '}
                <strong className="text-slate-800">{node.status || 'Active'}</strong>
              </span>
              {!node.isBarangay && node.population_served ? (
                <span>
                  Pop:{' '}
                  <strong className="text-slate-800">
                    {Number(node.population_served).toLocaleString()}
                  </strong>
                </span>
              ) : (
                <span>
                  Facilities:{' '}
                  <strong className="text-slate-800">{node.facility_count ?? '—'}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Public Safety Guidance (especially prominent for Community Residents) */}
          <div className={`px-3 py-2.5 rounded-xl border ${safety.badgeClass} flex items-center gap-2.5`}>
            {safety.tier.includes('High') ? (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            ) : safety.tier.includes('Moderate') ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                Public Drinking Guidance
              </div>
              <div className="text-xs font-bold leading-snug">{safety.publicRating}</div>
            </div>
          </div>

          {/* PNSDW / DOH AO 2017-0010 Telemetry Breakdown */}
          {!node.isBarangay ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>PNSDW Water Quality</span>
                <span>DOH AO 2017-0010</span>
              </div>
              <div className="grid grid-cols-2 gap-2 tabular-nums">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>Turbidity</span>
                    <span className={turbOk ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                      {turbOk ? 'Pass' : 'High'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {turb.toFixed(1)} <span className="text-[11px] font-medium text-slate-500">NTU</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Limit &lt; 5.0 NTU</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>pH Level</span>
                    <span className={phOk ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      {phOk ? 'Pass' : 'Drift'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {phVal.toFixed(1)} <span className="text-[11px] font-medium text-slate-500">pH</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Std 6.5 – 8.5</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>Residual Cl₂</span>
                    <span className={clOk ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      {clOk ? 'Pass' : 'Low'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {cl2.toFixed(2)} <span className="text-[11px] font-medium text-slate-500">mg/L</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {isTankerActive ? 'Tanker 0.5–1.5' : 'Std 0.3–1.5'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>Coliform / TDS</span>
                    <span
                      className={
                        metrics.coliform_present ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'
                      }
                    >
                      {metrics.coliform_present ? 'Positive (+)' : 'Negative (-)'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {Math.round(tds)} <span className="text-[11px] font-medium text-slate-500">ppm</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Std &lt; 600 ppm</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 leading-relaxed">
              Barangay polygon telemetry aggregates WVI scores from active water kiosks, wells, and
              hydrologic flood exposure in <strong className="text-slate-900">Brgy. {node.barangay}</strong>.
            </div>
          )}

          {/* ACTOR 1: Community Resident Quick Actions */}
          {authenticatedRole === 'RESIDENT' && (
            <div className="space-y-2.5 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={onFindNearestSafe}
                className="w-full py-2.5 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                Locate Nearest Safe Water Kiosk
              </button>

              <div className="p-3 rounded-xl bg-sky-50/80 border border-sky-200/70 text-slate-700 space-y-1">
                <div className="text-[11px] font-bold text-[#0284C7] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  PNSDW Conservation &amp; Hygiene Tip
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Use covered narrow-neck containers for fetched water. During yellow or red WVI advisories, boil drinking water for at least 3 minutes.
                </p>
              </div>
            </div>
          )}

          {/* ACTOR 2: BHW Mobile Field-Kit Data Entry Form */}
          {authenticatedRole === 'BHW' && !node.isBarangay && (
            <form
              onSubmit={handleFieldKitSubmit}
              className="p-3 rounded-xl bg-sky-50/50 border border-sky-200/80 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                  <FlaskConical className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>BHW Field-Kit Test</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    {isOnline ? 'Online' : 'Offline Queue'}
                  </span>
                  {pendingSyncCount > 0 && onSyncPendingQueue && (
                    <button
                      type="button"
                      onClick={onSyncPendingQueue}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                    >
                      Sync ({pendingSyncCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    pH
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="4"
                    max="11"
                    value={kitPh}
                    onChange={(e) => setKitPh(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    TDS (ppm)
                  </label>
                  <input
                    type="number"
                    step="5"
                    min="20"
                    max="2000"
                    value={kitTds}
                    onChange={(e) => setKitTds(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Turbidity
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={kitTurbidity}
                    onChange={(e) => setKitTurbidity(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Coliform Indicator
                  </label>
                  <select
                    value={kitColiform ? 'Positive' : 'Negative'}
                    onChange={(e) => setKitColiform(e.target.value === 'Positive')}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  >
                    <option value="Negative">Negative (-)</option>
                    <option value="Positive">Positive (+)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Hardware Status
                  </label>
                  <select
                    value={kitHardwareStatus}
                    onChange={(e) => setKitHardwareStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  >
                    <option value="Functional">Functional</option>
                    <option value="Under Repair">Under Repair</option>
                    <option value="Abandoned">Abandoned</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kitSanitationHazard}
                  onChange={(e) => setKitSanitationHazard(e.target.checked)}
                  className="rounded border-slate-300 text-[#0284C7] focus:ring-sky-500"
                />
                <span className="text-[11px] font-medium text-slate-700">
                  Flag sanitation / flood runoff hazard nearby
                </span>
              </label>

              <input
                type="text"
                value={kitNote}
                onChange={(e) => setKitNote(e.target.value)}
                placeholder="e.g., Muddy runoff observed near well apron after rain"
                className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
              />

              <button
                type="submit"
                disabled={submittingKit}
                className="w-full py-2 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {submittingKit ? 'Saving Field-Kit Log...' : 'Save Field-Kit & Verify'}
              </button>
            </form>
          )}

          {/* Community / BHW Quick Report Water Issue */}
          {(authenticatedRole === 'RESIDENT' || authenticatedRole === 'BHW') && (
            <div className="pt-1 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => setIssueOpen((v) => !v)}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-semibold flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Report Water Issue at Node
                </span>
                {issueOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {issueOpen && (
                <form onSubmit={handleQuickIncidentSubmit} className="space-y-2 pt-1">
                  <select
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  >
                    <option value="Muddy Runoff">Muddy / Turbid Water</option>
                    <option value="Foul Odor">Foul / Sewage Odor</option>
                    <option value="Broken Pump">Broken Pump / Valve</option>
                    <option value="Dry Well">Dry Well / No Pressure</option>
                  </select>
                  <input
                    type="text"
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                    placeholder="Brief observation for CDRRMO & BHW..."
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                  />
                  <button
                    type="submit"
                    disabled={submittingIssue}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submittingIssue ? 'Submitting...' : 'Submit Community Alert'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ACTOR 3: CDRRMO Operator Panel */}
          {authenticatedRole === 'CDRRMO' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#0284C7]" />
                  CDRRMO Dispatch &amp; Advisories
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onToggleFloodLayer}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    showFloodLayer
                      ? 'bg-[#0284C7] text-white border-[#0284C7]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  {showFloodLayer ? 'Flood Layer On' : 'Flood Layer'}
                </button>

                {!node.isBarangay && onVerifyOrTanker && (
                  <button
                    type="button"
                    onClick={() =>
                      onVerifyOrTanker(
                        node.id,
                        isTankerActive ? 'resolve_tanker' : 'dispatch_tanker'
                      )
                    }
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isTankerActive
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        : 'bg-[#0284C7] hover:bg-[#0369A1] text-white border-[#0284C7]'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    {isTankerActive ? 'Resolve Tanker' : 'Dispatch Tanker'}
                  </button>
                )}
              </div>

              <form onSubmit={(e) => handleInlineBroadcast(e, 'Boil-Water Advisory')} className="space-y-2 pt-1 border-t border-slate-200/80">
                <input
                  type="text"
                  value={advisoryMsg}
                  onChange={(e) => setAdvisoryMsg(e.target.value)}
                  placeholder={`Boil-water note for Brgy. ${node.barangay}...`}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  disabled={submittingAdv}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  {submittingAdv ? 'Broadcasting...' : 'Broadcast Boil-Water Advisory'}
                </button>
              </form>
            </div>
          )}

          {/* ACTOR 4: LGU / WASH Coordinator Panel */}
          {authenticatedRole === 'LGU_COORDINATOR' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#0284C7]" />
                  LGU / WASH Governance
                </span>
              </div>

              {!node.isBarangay && onVerifyOrTanker && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onVerifyOrTanker(node.id, 'verify')}
                    className="py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Verify Node
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onVerifyOrTanker(
                        node.id,
                        isTankerActive ? 'resolve_tanker' : 'dispatch_tanker'
                      )
                    }
                    className="py-2 px-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    {isTankerActive ? 'Resolve Tanker' : 'Dispatch Tanker'}
                  </button>
                </div>
              )}

              <form onSubmit={(e) => handleInlineBroadcast(e, 'WASH Guideline')} className="space-y-2">
                <input
                  type="text"
                  value={advisoryMsg}
                  onChange={(e) => setAdvisoryMsg(e.target.value)}
                  placeholder={`WASH guideline for Brgy. ${node.barangay}...`}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  disabled={submittingAdv}
                  className="w-full py-2 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  Broadcast WASH Guideline
                </button>
              </form>

              {onApplyThresholds && (
                <form onSubmit={onApplyThresholds} className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <SlidersHorizontal className="w-3 h-3 text-[#0284C7]" />
                    WVI Threshold Policy
                  </div>
                  <div className="grid grid-cols-2 gap-2 tabular-nums">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Advisory (&ge;)
                      </label>
                      <input
                        type="number"
                        value={advisoryThreshold}
                        onChange={(e) =>
                          onAdvisoryThresholdChange?.(Number(e.target.value))
                        }
                        className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Critical (&ge;)
                      </label>
                      <input
                        type="number"
                        value={criticalThreshold}
                        onChange={(e) =>
                          onCriticalThresholdChange?.(Number(e.target.value))
                        }
                        className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Apply Thresholds
                    </button>
                    {onAdminReset && (
                      <button
                        type="button"
                        onClick={onAdminReset}
                        className="py-1.5 px-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reset
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
