import copy
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="BicolAqua-GIS Core API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WaterMetrics(BaseModel):
    ph: float = Field(..., ge=0.0, le=14.0)
    tds_ppm: float = Field(..., ge=0.0)
    turbidity_ntu: float = Field(..., ge=0.0)
    coliform_present: bool
    residual_chlorine: float = Field(default=0.3, ge=0.0)


class InspectionLog(BaseModel):
    point_id: str
    bhw_name: str
    status: Literal["Functional", "Under Repair", "Abandoned"]
    metrics: WaterMetrics
    incident_note: Optional[str] = ""
    recorded_at: str


class HistoricalRecord(BaseModel):
    recorded_at: str
    bhw_name: str
    wvi_score: float
    status: str
    coliform_present: bool
    incident_note: Optional[str] = ""


class WaterPoint(BaseModel):
    id: str
    name: str
    barangay: str
    barangay_name: str
    lat: float
    lng: float
    coordinates: List[float]
    elevation_m: float
    source_type: Literal[
        "Handpump",
        "Public Kiosk",
        "Communal Spring",
        "School Filtration",
        "Solar Pump",
        "Shallow Well",
    ]
    status: Literal["Functional", "Under Repair", "Abandoned"]
    flood_risk_level: int = Field(..., ge=1, le=5)
    population_served: int
    metrics: WaterMetrics
    wvi_score: float = 0.0
    risk_tier: str = "Safe / Compliant"
    verified: bool = False
    tanker_dispatched: bool = False
    last_updated: str
    data_provenance: str = "Simulated Baseline • Verified Barangay WGS84 Coordinate"
    history: List[HistoricalRecord] = []


class ReportCreate(BaseModel):
    point_id: Optional[str] = None
    barangay: str
    issue_type: str
    description: Optional[str] = ""
    reporter_role: Optional[str] = "Community User"


class FieldKitLogPayload(BaseModel):
    ph: float = Field(..., ge=0.0, le=14.0)
    tds_ppm: float = Field(..., ge=0.0)
    turbidity_ntu: float = Field(..., ge=0.0)
    coliform_positive: bool
    residual_chlorine: Optional[float] = Field(default=None, ge=0.0)
    hardware_status: Literal["Functional", "Under Repair", "Abandoned"]
    bhw_name: Optional[str] = "BHW Field Unit"
    note: Optional[str] = ""


class IncidentCreatePayload(BaseModel):
    facility_id: Optional[str] = None
    barangay_name: str
    category: str
    description: Optional[str] = ""
    reporter_role: Optional[str] = "Resident"


class AdvisoryCreatePayload(BaseModel):
    barangay_name: str
    level: str = "Boil-Water Advisory"
    message: str
    issued_by: Optional[str] = "CDRRMO Operations Center"


class EvacuationCampUpdatePayload(BaseModel):
    camp_id: str
    supply_liters: Optional[float] = Field(default=None, ge=0.0)
    add_supply_liters: Optional[float] = None
    evacuees: Optional[int] = Field(default=None, ge=0)
    status: Optional[str] = None


class FacilityCreatePayload(BaseModel):
    id: Optional[str] = None
    name: str
    barangay_name: Optional[str] = None
    barangay: Optional[str] = None
    lat: float
    lng: float
    elevation_m: float = 6.0
    source_type: Literal[
        "Handpump",
        "Public Kiosk",
        "Communal Spring",
        "School Filtration",
        "Solar Pump",
        "Shallow Well",
    ] = "Public Kiosk"
    status: Literal["Functional", "Under Repair", "Abandoned"] = "Functional"
    flood_risk_level: int = Field(default=2, ge=1, le=5)
    population_served: int = Field(default=650, ge=1)
    ph: float = Field(default=7.1, ge=0.0, le=14.0)
    tds_ppm: float = Field(default=210.0, ge=0.0)
    turbidity_ntu: float = Field(default=1.2, ge=0.0)
    coliform_positive: bool = False
    residual_chlorine: float = Field(default=0.4, ge=0.0)


class VerifyFacilityPayload(BaseModel):
    verified: Optional[bool] = None
    action: Optional[Literal["verify", "dispatch_tanker", "resolve_tanker"]] = "verify"
    actor: Optional[str] = "LGU Personnel"
    note: Optional[str] = ""


class TyphoonSimulatePayload(BaseModel):
    active: Optional[bool] = None
    scenario: Optional[Literal["baseline", "monsoon", "typhoon"]] = None


class ThresholdConfigPayload(BaseModel):
    critical_wvi: float = Field(default=65.0, ge=40.0, le=95.0)
    advisory_wvi: float = Field(default=35.0, ge=15.0, le=60.0)
    turbidity_limit: float = Field(default=5.0, ge=1.0, le=20.0)
    tds_limit: float = Field(default=500.0, ge=200.0, le=1500.0)


THRESHOLDS = {
    "critical_wvi": 65.0,
    "advisory_wvi": 35.0,
    "turbidity_limit": 5.0,
    "tds_limit": 500.0,
}

TYPHOON_STATE = {
    "active": False,
    "scenario": "baseline",
    "activated_at": None,
}


def calculate_wvi(point: dict) -> tuple[float, str]:
    """
    Deterministic 0-100 Water Vulnerability Index (WVI) using configurable thresholds:
    - Water Quality Hazard (40%): Coliform (+25), TDS > tds_limit (up to +10), unsafe pH (+5), turbidity > turbidity_limit (+5)
    - Flood Inundation Exposure (25%): Flood risk tier (1-5) scaled to 25
    - Infrastructure Operational State (20%): Functional (0), Under Repair (14), Abandoned (20)
    - Population Dependency Pressure (15%): Normalized to 1,000 residents
    """
    m = point["metrics"]
    quality_risk = 0.0
    if m["coliform_present"]:
        quality_risk += 25.0
    tds_limit = THRESHOLDS["tds_limit"]
    if m["tds_ppm"] > tds_limit:
        quality_risk += min(10.0, (m["tds_ppm"] - tds_limit) / 50.0)
    if m["ph"] < 6.5 or m["ph"] > 8.5:
        quality_risk += 5.0
    if m["turbidity_ntu"] > THRESHOLDS["turbidity_limit"]:
        quality_risk += 5.0
    quality_risk = min(40.0, quality_risk)

    flood_risk = (point["flood_risk_level"] / 5.0) * 25.0
    status_map = {"Functional": 0.0, "Under Repair": 14.0, "Abandoned": 20.0}
    infra_risk = status_map.get(point["status"], 10.0)
    pop_risk = min(15.0, (point["population_served"] / 1000.0) * 15.0)

    total_wvi = round(min(100.0, quality_risk + flood_risk + infra_risk + pop_risk), 1)

    if total_wvi >= THRESHOLDS["critical_wvi"]:
        tier = "Critical (Dispatch Tanker)"
    elif total_wvi >= THRESHOLDS["advisory_wvi"]:
        tier = "Moderate (Boil-Water Advisory)"
    else:
        tier = "Safe / Compliant"

    return total_wvi, tier


# High-flood confluence zone (Bicol-Naga River Floodplain, [lng, lat]) for spatial intersection
HIGH_FLOOD_CONFLUENCE_RING = [
    [123.17533, 13.61688], [123.17568, 13.61768], [123.17538, 13.61803],
    [123.17634, 13.61932], [123.17553, 13.61989], [123.17696, 13.62146],
    [123.17637, 13.62185], [123.17650, 13.62524], [123.17950, 13.62450],
    [123.18450, 13.62420], [123.18900, 13.62650], [123.19550, 13.63180],
    [123.20150, 13.63350], [123.19950, 13.62850], [123.19450, 13.62450],
    [123.19400, 13.61950], [123.19350, 13.60250], [123.18306, 13.60651],
    [123.17776, 13.60967], [123.17694, 13.61126], [123.17643, 13.61593],
    [123.17533, 13.61688],
]


def point_in_ring(lng: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


BARANGAY_METADATA_DB: Dict[str, dict] = {
    "Abella": {"id": "BRGY-01", "population": 5420, "baseline_wvi": 52.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.5m – 1.2m"},
    "Bagumbayan Norte": {"id": "BRGY-02", "population": 3680, "baseline_wvi": 31.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.3m – 0.9m"},
    "Bagumbayan Sur": {"id": "BRGY-03", "population": 5890, "baseline_wvi": 34.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.4m – 1.1m"},
    "Balatas": {"id": "BRGY-04", "population": 11240, "baseline_wvi": 42.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.5m – 1.3m"},
    "Calauag": {"id": "BRGY-05", "population": 12180, "baseline_wvi": 46.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.5m – 1.3m"},
    "Cararayan": {"id": "BRGY-06", "population": 15840, "baseline_wvi": 19.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Carolina": {"id": "BRGY-07", "population": 6420, "baseline_wvi": 14.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Concepcion Grande": {"id": "BRGY-08", "population": 13210, "baseline_wvi": 33.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.4m – 1.1m"},
    "Concepcion Pequeña": {"id": "BRGY-09", "population": 24890, "baseline_wvi": 38.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.6m – 1.4m"},
    "Dayangdang": {"id": "BRGY-10", "population": 4910, "baseline_wvi": 44.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.5m – 1.2m"},
    "Del Rosario": {"id": "BRGY-11", "population": 8940, "baseline_wvi": 28.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Dinaga": {"id": "BRGY-12", "population": 620, "baseline_wvi": 68.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.6m – 2.8m"},
    "Igualdad Interior": {"id": "BRGY-13", "population": 3480, "baseline_wvi": 74.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.8m – 3.1m"},
    "Lerma": {"id": "BRGY-14", "population": 2890, "baseline_wvi": 67.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.5m – 2.6m"},
    "Liboton": {"id": "BRGY-15", "population": 3320, "baseline_wvi": 36.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.4m – 1.1m"},
    "Mabolo": {"id": "BRGY-16", "population": 8760, "baseline_wvi": 69.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.8m – 3.2m+"},
    "Pacol": {"id": "BRGY-17", "population": 13450, "baseline_wvi": 18.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Panicuason": {"id": "BRGY-18", "population": 3120, "baseline_wvi": 12.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Peñafrancia": {"id": "BRGY-19", "population": 7340, "baseline_wvi": 49.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.5m – 2.4m"},
    "Sabang": {"id": "BRGY-20", "population": 7190, "baseline_wvi": 86.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "2.0m – 3.4m+"},
    "San Felipe": {"id": "BRGY-21", "population": 21450, "baseline_wvi": 32.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.4m – 1.0m"},
    "San Francisco": {"id": "BRGY-22", "population": 1240, "baseline_wvi": 45.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.6m – 1.3m"},
    "San Isidro": {"id": "BRGY-23", "population": 3420, "baseline_wvi": 22.0, "flood_tier": "upland", "hazard_classification": "Upland Runoff / Landslide Buffer", "flood_depth": "Runoff / Slope"},
    "Santa Cruz": {"id": "BRGY-24", "population": 7850, "baseline_wvi": 41.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.5m – 1.3m"},
    "Tabuco": {"id": "BRGY-25", "population": 4380, "baseline_wvi": 91.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "2.1m – 3.5m+"},
    "Tinago": {"id": "BRGY-26", "population": 3610, "baseline_wvi": 47.0, "flood_tier": "moderate", "hazard_classification": "Moderate Flood Susceptibility (<1.5m)", "flood_depth": "0.6m – 1.4m"},
    "Triangulo": {"id": "BRGY-27", "population": 10980, "baseline_wvi": 66.0, "flood_tier": "high", "hazard_classification": "High Flood Depth (>1.5m–3.0m+)", "flood_depth": "1.6m – 2.9m"},
}

BARANGAY_REPORT_DELTAS: Dict[str, float] = {}

INITIAL_WATER_POINTS_SEED: dict[str, dict] = {
    "NAGA-01": {
        "id": "NAGA-01",
        "name": "Sitio Cararayan Shallow Well #2",
        "barangay": "Cararayan",
        "lat": 13.6275,
        "lng": 123.2215,
        "elevation_m": 48.0,
        "source_type": "Handpump",
        "status": "Functional",
        "flood_risk_level": 2,
        "population_served": 320,
        "metrics": {"ph": 7.1, "tds_ppm": 240.0, "turbidity_ntu": 1.8, "coliform_present": False, "residual_chlorine": 0.35},
        "verified": True,
        "last_updated": "2026-11-12T08:00:00Z",
        "data_provenance": "LGU Verified Field Telemetry",
        "history": [
            {"recorded_at": "2026-11-12T08:00:00Z", "bhw_name": "LGU Field Unit #01", "wvi_score": 14.8, "status": "Functional", "coliform_present": False, "incident_note": "Clear discharge; concrete apron drainage intact."}
        ],
    },
    "NAGA-02": {
        "id": "NAGA-02",
        "name": "Sabang Riverside Public Kiosk",
        "barangay": "Sabang",
        "lat": 13.6192,
        "lng": 123.1766,
        "elevation_m": 4.0,
        "source_type": "Public Kiosk",
        "status": "Under Repair",
        "flood_risk_level": 5,
        "population_served": 850,
        "metrics": {"ph": 6.4, "tds_ppm": 610.0, "turbidity_ntu": 7.2, "coliform_present": True, "residual_chlorine": 0.05},
        "verified": False,
        "last_updated": "2026-11-12T14:30:00Z",
        "data_provenance": "Simulated Baseline • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-05T09:15:00Z", "bhw_name": "LGU Field Unit #02", "wvi_score": 37.8, "status": "Functional", "coliform_present": False, "incident_note": "Pre-monsoon baseline check"},
            {"recorded_at": "2026-11-12T14:30:00Z", "bhw_name": "LGU Field Unit #02", "wvi_score": 89.0, "status": "Under Repair", "coliform_present": True, "incident_note": "Tidal backflow intrusion near Bicol River; positive coliform test."}
        ],
    },
    "NAGA-03": {
        "id": "NAGA-03",
        "name": "Concepcion Pequeña Filtration Station",
        "barangay": "Concepcion Pequeña",
        "lat": 13.6178,
        "lng": 123.2042,
        "elevation_m": 14.0,
        "source_type": "School Filtration",
        "status": "Functional",
        "flood_risk_level": 3,
        "population_served": 640,
        "metrics": {"ph": 7.3, "tds_ppm": 185.0, "turbidity_ntu": 0.9, "coliform_present": False, "residual_chlorine": 0.45},
        "verified": True,
        "last_updated": "2026-11-12T07:15:00Z",
        "data_provenance": "LGU Verified Field Telemetry",
        "history": [
            {"recorded_at": "2026-11-12T07:15:00Z", "bhw_name": "Municipal WASH Unit", "wvi_score": 24.6, "status": "Functional", "coliform_present": False, "incident_note": "Dual-media filter pressure nominal; UV disinfection active."}
        ],
    },
    "NAGA-04": {
        "id": "NAGA-04",
        "name": "Triangulo Zone 4 Communal Pump",
        "barangay": "Triangulo",
        "lat": 13.6118,
        "lng": 123.1924,
        "elevation_m": 6.0,
        "source_type": "Handpump",
        "status": "Functional",
        "flood_risk_level": 4,
        "population_served": 510,
        "metrics": {"ph": 6.8, "tds_ppm": 430.0, "turbidity_ntu": 4.1, "coliform_present": False, "residual_chlorine": 0.25},
        "verified": False,
        "last_updated": "2026-11-11T16:45:00Z",
        "data_provenance": "Simulated Baseline • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-11T16:45:00Z", "bhw_name": "LGU Field Unit #03", "wvi_score": 27.7, "status": "Functional", "coliform_present": False, "incident_note": "Slightly elevated TDS after rain; within potable threshold."}
        ],
    },
    "NAGA-05": {
        "id": "NAGA-05",
        "name": "Peñafrancia Community Refill Kiosk",
        "barangay": "Peñafrancia",
        "lat": 13.6335,
        "lng": 123.1922,
        "elevation_m": 11.0,
        "source_type": "Public Kiosk",
        "status": "Functional",
        "flood_risk_level": 3,
        "population_served": 720,
        "metrics": {"ph": 7.2, "tds_ppm": 210.0, "turbidity_ntu": 1.2, "coliform_present": False, "residual_chlorine": 0.40},
        "verified": True,
        "last_updated": "2026-11-12T06:50:00Z",
        "data_provenance": "LGU Verified Field Telemetry",
        "history": [
            {"recorded_at": "2026-11-12T06:50:00Z", "bhw_name": "LGU Field Unit #01", "wvi_score": 25.8, "status": "Functional", "coliform_present": False, "incident_note": "Residual chlorine verified at 0.4 mg/L."}
        ],
    },
    "NAGA-06": {
        "id": "NAGA-06",
        "name": "Mabolo Riverbank Shallow Well",
        "barangay": "Mabolo",
        "lat": 13.6095,
        "lng": 123.1818,
        "elevation_m": 5.0,
        "source_type": "Handpump",
        "status": "Under Repair",
        "flood_risk_level": 5,
        "population_served": 590,
        "metrics": {"ph": 6.6, "tds_ppm": 540.0, "turbidity_ntu": 5.8, "coliform_present": False, "residual_chlorine": 0.12},
        "verified": False,
        "last_updated": "2026-11-11T17:10:00Z",
        "data_provenance": "Simulated Baseline • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-11T17:10:00Z", "bhw_name": "LGU Field Unit #02", "wvi_score": 53.7, "status": "Under Repair", "coliform_present": False, "incident_note": "Boil-water advisory issued due to elevated turbidity."}
        ],
    },
    "NAGA-07": {
        "id": "NAGA-07",
        "name": "Tabuco Public Water Stand",
        "barangay": "Tabuco",
        "lat": 13.6164,
        "lng": 123.1848,
        "elevation_m": 4.0,
        "source_type": "Public Kiosk",
        "status": "Abandoned",
        "flood_risk_level": 5,
        "population_served": 910,
        "metrics": {"ph": 6.3, "tds_ppm": 690.0, "turbidity_ntu": 8.4, "coliform_present": True, "residual_chlorine": 0.0},
        "verified": False,
        "last_updated": "2026-11-12T11:20:00Z",
        "data_provenance": "Simulated Baseline • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-12T11:20:00Z", "bhw_name": "Municipal WASH Unit", "wvi_score": 97.5, "status": "Abandoned", "coliform_present": True, "incident_note": "Foot valve seal damaged during flood surge; tanker rationing active."}
        ],
    },
    "NAGA-08": {
        "id": "NAGA-08",
        "name": "Mt. Isarog Upland Gravity Spring Box",
        "barangay": "Pacol",
        "lat": 13.6470,
        "lng": 123.2240,
        "elevation_m": 115.0,
        "source_type": "Communal Spring",
        "status": "Functional",
        "flood_risk_level": 1,
        "population_served": 410,
        "metrics": {"ph": 7.4, "tds_ppm": 125.0, "turbidity_ntu": 0.6, "coliform_present": False, "residual_chlorine": 0.50},
        "verified": True,
        "last_updated": "2026-11-12T08:10:00Z",
        "data_provenance": "LGU Verified Field Telemetry",
        "history": [
            {"recorded_at": "2026-11-12T08:10:00Z", "bhw_name": "LGU Field Unit #03", "wvi_score": 11.2, "status": "Functional", "coliform_present": False, "incident_note": "High-elevation spring intake clear; zero sediment."}
        ],
    },
}

INITIAL_REPORTS_SEED = [
    {
        "id": "REP-2026-01",
        "point_id": "NAGA-02",
        "facility_id": "NAGA-02",
        "barangay": "Sabang",
        "barangay_name": "Sabang",
        "reporter_role": "Community User",
        "issue_type": "Muddy Runoff",
        "category": "Muddy Runoff",
        "description": "Cloudy discharge near Sabang riverside kiosk after morning high tide.",
        "status": "Tanker Dispatched",
        "submitted_at": "09:15 AM",
        "timestamp": "2026-11-14T09:15:00Z",
    },
    {
        "id": "REP-2026-02",
        "point_id": "NAGA-07",
        "facility_id": "NAGA-07",
        "barangay": "Tabuco",
        "barangay_name": "Tabuco",
        "reporter_role": "BHW Field Unit",
        "issue_type": "Leaking Pipe",
        "category": "Leaking Pipe",
        "description": "Submerged supply manifold leaking near Tabuco Riverside Well dock.",
        "status": "Tanker Dispatched",
        "submitted_at": "10:05 AM",
        "timestamp": "2026-11-14T10:05:00Z",
    },
    {
        "id": "REP-2026-03",
        "point_id": "NAGA-06",
        "facility_id": "NAGA-06",
        "barangay": "Mabolo",
        "barangay_name": "Mabolo",
        "reporter_role": "Resident",
        "issue_type": "Broken Handpump",
        "category": "Broken Handpump",
        "description": "Handpump lever pin is loose and discharge has slight silt after tide.",
        "status": "Under LGU Review",
        "submitted_at": "10:40 AM",
        "timestamp": "2026-11-14T10:40:00Z",
    },
]

INITIAL_ADVISORIES_SEED = [
    {
        "id": "ADV-2026-01",
        "barangay_name": "Sabang",
        "level": "Boil-Water Advisory",
        "message": "Boil drinking water for at least 3 minutes or draw from CDRRMO Tanker #01 stationed near Sabang Public Kiosk.",
        "issued_by": "CDRRMO Operations Center",
        "timestamp": "2026-11-14T09:20:00Z",
    },
    {
        "id": "ADV-2026-02",
        "barangay_name": "Tabuco",
        "level": "Emergency Tanker Order",
        "message": "Direct well extraction suspended at NAGA-07 due to positive coliform and elevated turbidity; tanker rationing active.",
        "issued_by": "Naga City Health Office / CDRRMO",
        "timestamp": "2026-11-14T10:12:00Z",
    },
]

INITIAL_CAMPS_SEED = [
    {
        "id": "CAMP-01",
        "name": "Jesse M. Robredo Coliseum",
        "barangay_name": "Triangulo",
        "lat": 13.6226,
        "lng": 123.1955,
        "evacuees": 420,
        "daily_demand_liters": 6300,
        "supply_liters": 4800,
        "status": "Dispatch Needed",
        "last_updated": "2026-11-14T10:00:00Z",
    },
    {
        "id": "CAMP-02",
        "name": "Naga City People's Hall",
        "barangay_name": "Concepcion Pequeña",
        "lat": 13.6194,
        "lng": 123.1948,
        "evacuees": 185,
        "daily_demand_liters": 2775,
        "supply_liters": 3200,
        "status": "Adequate",
        "last_updated": "2026-11-14T09:45:00Z",
    },
    {
        "id": "CAMP-03",
        "name": "Sabang Barangay Evacuation Center",
        "barangay_name": "Sabang",
        "lat": 13.6191,
        "lng": 123.1806,
        "evacuees": 260,
        "daily_demand_liters": 3900,
        "supply_liters": 1600,
        "status": "Critical Deficit",
        "last_updated": "2026-11-14T10:30:00Z",
    },
]

WATER_POINTS_DB: dict[str, dict] = {}
REPORTS_DB: list[dict] = []
ADVISORIES_DB: list[dict] = []
EVACUATION_CAMPS_DB: list[dict] = []


def enrich_point(pt: dict) -> dict:
    pt["barangay_name"] = pt["barangay"]
    pt["coordinates"] = [pt["lng"], pt["lat"]]
    pt["wvi_score"], pt["risk_tier"] = calculate_wvi(pt)
    if pt["wvi_score"] >= THRESHOLDS["critical_wvi"]:
        pt["tanker_dispatched"] = True
    elif "tanker_dispatched" not in pt:
        pt["tanker_dispatched"] = False
    return pt


def reset_to_baseline():
    global WATER_POINTS_DB, REPORTS_DB, ADVISORIES_DB, EVACUATION_CAMPS_DB, BARANGAY_REPORT_DELTAS
    WATER_POINTS_DB = copy.deepcopy(INITIAL_WATER_POINTS_SEED)
    REPORTS_DB = copy.deepcopy(INITIAL_REPORTS_SEED)
    ADVISORIES_DB = copy.deepcopy(INITIAL_ADVISORIES_SEED)
    EVACUATION_CAMPS_DB = copy.deepcopy(INITIAL_CAMPS_SEED)
    BARANGAY_REPORT_DELTAS = {}
    TYPHOON_STATE["active"] = False
    TYPHOON_STATE["scenario"] = "baseline"
    TYPHOON_STATE["activated_at"] = None
    for pt in WATER_POINTS_DB.values():
        pt["tanker_dispatched"] = False
        enrich_point(pt)


reset_to_baseline()


def build_barangays_summary() -> list[dict]:
    out = []
    scenario = TYPHOON_STATE.get("scenario", "baseline")
    for name, meta in BARANGAY_METADATA_DB.items():
        matching = [pt for pt in WATER_POINTS_DB.values() if pt["barangay"].lower() == name.lower()]
        if matching:
            wvi = max(pt["wvi_score"] for pt in matching)
        else:
            wvi = meta["baseline_wvi"] + BARANGAY_REPORT_DELTAS.get(name, 0.0)
            if scenario == "typhoon":
                if meta["flood_tier"] == "high":
                    wvi = max(wvi, 78.0)
                elif meta["flood_tier"] == "moderate":
                    wvi = min(100.0, wvi + 16.0)
            elif scenario == "monsoon":
                if meta["flood_tier"] == "high":
                    wvi = max(wvi, 60.0)
                elif meta["flood_tier"] == "moderate":
                    wvi = min(100.0, wvi + 9.0)
        wvi = round(min(100.0, wvi), 1)
        if wvi >= THRESHOLDS["critical_wvi"]:
            risk_tier = "Critical"
        elif wvi >= THRESHOLDS["advisory_wvi"]:
            risk_tier = "Advisory"
        else:
            risk_tier = "Safe"
        out.append({
            "id": meta["id"],
            "name": name,
            "wvi_score": wvi,
            "risk_tier": risk_tier,
            "population_exposure": meta["population"],
            "flood_tier": meta["flood_tier"],
            "hazard_classification": meta["hazard_classification"],
            "flood_depth": meta["flood_depth"],
            "active_facility_count": len(matching),
        })
    return out


# ============================================================================
# STEP 2 LIVE TELEMETRY & SPATIAL ENDPOINTS (/api/*) + Legacy /api/v1/* aliases
# ============================================================================

@app.get("/api/facilities", response_model=List[WaterPoint])
@app.get("/api/v1/water-points", response_model=List[WaterPoint])
def get_facilities():
    return [enrich_point(pt) for pt in WATER_POINTS_DB.values()]


@app.post("/api/facilities")
def register_facility(payload: FacilityCreatePayload):
    barangay_name = (payload.barangay_name or payload.barangay or "").strip()
    if not barangay_name:
        raise HTTPException(status_code=422, detail="barangay_name is required")

    next_index = len(WATER_POINTS_DB) + 1
    facility_id = payload.id.strip().upper() if payload.id else f"NAGA-{next_index:02d}"
    while facility_id in WATER_POINTS_DB:
        next_index += 1
        facility_id = f"NAGA-{next_index:02d}"

    now_iso = datetime.now(timezone.utc).isoformat()
    new_pt = {
        "id": facility_id,
        "name": payload.name,
        "barangay": barangay_name,
        "lat": payload.lat,
        "lng": payload.lng,
        "elevation_m": payload.elevation_m,
        "source_type": payload.source_type,
        "status": payload.status,
        "flood_risk_level": payload.flood_risk_level,
        "population_served": payload.population_served,
        "metrics": {
            "ph": payload.ph,
            "tds_ppm": payload.tds_ppm,
            "turbidity_ntu": payload.turbidity_ntu,
            "coliform_present": payload.coliform_positive,
            "residual_chlorine": payload.residual_chlorine,
        },
        "verified": True,
        "tanker_dispatched": False,
        "last_updated": now_iso,
        "data_provenance": "LGU / WASH Registry • Commissioned Node",
        "history": [],
    }
    enrich_point(new_pt)
    new_pt["history"].append({
        "recorded_at": now_iso,
        "bhw_name": "LGU WASH Registry",
        "wvi_score": new_pt["wvi_score"],
        "status": new_pt["status"],
        "coliform_present": new_pt["metrics"]["coliform_present"],
        "incident_note": f"Registered new {payload.source_type} facility in Brgy. {barangay_name}.",
    })
    WATER_POINTS_DB[facility_id] = new_pt

    return {
        "facility": new_pt,
        "facilities": [enrich_point(pt) for pt in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.get("/api/barangays")
def get_barangays():
    return {
        "typhoon_active": TYPHOON_STATE["active"],
        "scenario": TYPHOON_STATE.get("scenario", "baseline"),
        "thresholds": THRESHOLDS,
        "barangays": build_barangays_summary(),
    }


def _record_incident(
    *,
    facility_id: Optional[str],
    barangay_name: str,
    category: str,
    description: str,
    reporter_role: str,
) -> tuple[dict, Optional[dict]]:
    now_iso = datetime.now(timezone.utc).isoformat()
    report_id = f"REP-2026-{len(REPORTS_DB) + 1:02d}"

    target_pt = None
    if facility_id and facility_id in WATER_POINTS_DB:
        target_pt = WATER_POINTS_DB[facility_id]
    else:
        for pt in WATER_POINTS_DB.values():
            if pt["barangay"].lower() == barangay_name.lower():
                target_pt = pt
                break

    issue_lower = category.lower()
    if target_pt is not None:
        m = target_pt["metrics"]
        if "flood" in issue_lower or "submer" in issue_lower or "coliform" in issue_lower:
            m["coliform_present"] = True
            m["turbidity_ntu"] = round(m["turbidity_ntu"] + 4.8, 1)
            m["tds_ppm"] = round(m["tds_ppm"] + 190.0, 1)
            m["residual_chlorine"] = 0.0
            target_pt["flood_risk_level"] = 5
            target_pt["status"] = "Under Repair"
        elif "turbid" in issue_lower or "muddy" in issue_lower or "runoff" in issue_lower or "discolor" in issue_lower:
            m["turbidity_ntu"] = round(m["turbidity_ntu"] + 4.2, 1)
            m["tds_ppm"] = round(m["tds_ppm"] + 160.0, 1)
            m["residual_chlorine"] = max(0.0, round(m["residual_chlorine"] - 0.15, 2))
        elif "odor" in issue_lower or "taste" in issue_lower:
            m["coliform_present"] = True
            m["residual_chlorine"] = 0.0
            m["ph"] = 6.2
        else:
            target_pt["status"] = "Under Repair"
            m["turbidity_ntu"] = round(m["turbidity_ntu"] + 2.0, 1)

        target_pt["verified"] = False
        target_pt["data_provenance"] = "Community Incident Alert • Pending LGU Verification"
        target_pt["last_updated"] = now_iso
        enrich_point(target_pt)
        target_pt["history"].insert(0, {
            "recorded_at": now_iso,
            "bhw_name": reporter_role or "Community User",
            "wvi_score": target_pt["wvi_score"],
            "status": target_pt["status"],
            "coliform_present": m["coliform_present"],
            "incident_note": f"[{category}] {description or 'Crowd-sourced report'}",
        })
    else:
        bump = 24.0 if ("flood" in issue_lower or "odor" in issue_lower) else 16.0
        BARANGAY_REPORT_DELTAS[barangay_name] = BARANGAY_REPORT_DELTAS.get(barangay_name, 0.0) + bump

    resolved_facility_id = target_pt["id"] if target_pt else (facility_id or "BARANGAY-ZONE")
    item = {
        "id": report_id,
        "point_id": resolved_facility_id,
        "facility_id": resolved_facility_id,
        "barangay": barangay_name,
        "barangay_name": barangay_name,
        "reporter_role": reporter_role or "Community User",
        "issue_type": category,
        "category": category,
        "description": description or category,
        "status": "Tanker Dispatched" if (target_pt and target_pt["wvi_score"] >= THRESHOLDS["critical_wvi"]) else "Pending LGU Review",
        "submitted_at": datetime.now().strftime("%I:%M %p"),
        "timestamp": now_iso,
    }
    REPORTS_DB.insert(0, item)
    return item, target_pt


@app.get("/api/reports")
def get_reports():
    return REPORTS_DB


@app.post("/api/reports")
def create_report(payload: ReportCreate):
    new_report, target_pt = _record_incident(
        facility_id=payload.point_id,
        barangay_name=payload.barangay,
        category=payload.issue_type,
        description=payload.description or payload.issue_type,
        reporter_role=payload.reporter_role or "Community User",
    )
    return {
        "report": new_report,
        "updated_facility": target_pt,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.get("/api/incidents")
def get_incidents():
    return REPORTS_DB


@app.post("/api/incidents")
def create_incident(payload: IncidentCreatePayload):
    new_incident, target_pt = _record_incident(
        facility_id=payload.facility_id,
        barangay_name=payload.barangay_name,
        category=payload.category,
        description=payload.description or payload.category,
        reporter_role=payload.reporter_role or "Resident",
    )
    return {
        "incident": new_incident,
        "updated_facility": target_pt,
        "incidents": REPORTS_DB,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.patch("/api/facilities/{facility_id}/field-kit")
def log_facility_field_kit(facility_id: str, payload: FieldKitLogPayload):
    if facility_id not in WATER_POINTS_DB:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} not found")

    pt = WATER_POINTS_DB[facility_id]
    now_iso = datetime.now(timezone.utc).isoformat()
    pt["metrics"]["ph"] = payload.ph
    pt["metrics"]["tds_ppm"] = payload.tds_ppm
    pt["metrics"]["turbidity_ntu"] = payload.turbidity_ntu
    pt["metrics"]["coliform_present"] = payload.coliform_positive
    if payload.residual_chlorine is not None:
        pt["metrics"]["residual_chlorine"] = payload.residual_chlorine
    pt["status"] = payload.hardware_status
    pt["verified"] = True
    pt["data_provenance"] = "BHW Verified Field-Kit Telemetry"
    pt["last_updated"] = now_iso

    enrich_point(pt)
    if pt["wvi_score"] < THRESHOLDS["critical_wvi"] and not payload.coliform_positive:
        pt["tanker_dispatched"] = False

    pt["history"].insert(0, {
        "recorded_at": now_iso,
        "bhw_name": payload.bhw_name or "BHW Field Unit",
        "wvi_score": pt["wvi_score"],
        "status": pt["status"],
        "coliform_present": payload.coliform_positive,
        "incident_note": payload.note or f"BHW field-kit test logged ({payload.hardware_status}).",
    })

    return {
        "facility": pt,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.get("/api/advisories")
def get_advisories():
    return ADVISORIES_DB


@app.post("/api/advisories")
def broadcast_advisory(payload: AdvisoryCreatePayload):
    now_iso = datetime.now(timezone.utc).isoformat()
    item = {
        "id": f"ADV-2026-{len(ADVISORIES_DB) + 1:02d}",
        "barangay_name": payload.barangay_name,
        "level": payload.level,
        "message": payload.message,
        "issued_by": payload.issued_by or "CDRRMO Operations Center",
        "timestamp": now_iso,
    }
    ADVISORIES_DB.insert(0, item)
    return {
        "advisory": item,
        "advisories": ADVISORIES_DB,
    }


@app.get("/api/evacuation-camps")
def get_evacuation_camps():
    return EVACUATION_CAMPS_DB


@app.patch("/api/evacuation-camps")
def update_evacuation_camp(payload: EvacuationCampUpdatePayload):
    target = next((c for c in EVACUATION_CAMPS_DB if c["id"] == payload.camp_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Evacuation camp {payload.camp_id} not found")

    if payload.evacuees is not None:
        target["evacuees"] = payload.evacuees
        target["daily_demand_liters"] = payload.evacuees * 15
    if payload.supply_liters is not None:
        target["supply_liters"] = round(payload.supply_liters, 1)
    elif payload.add_supply_liters is not None:
        target["supply_liters"] = round(max(0.0, target["supply_liters"] + payload.add_supply_liters), 1)

    if payload.status:
        target["status"] = payload.status
    else:
        demand = max(1, target["daily_demand_liters"])
        ratio = target["supply_liters"] / demand
        target["status"] = "Adequate" if ratio >= 1.0 else ("Dispatch Needed" if ratio >= 0.5 else "Critical Deficit")

    target["last_updated"] = datetime.now(timezone.utc).isoformat()
    return {
        "camp": target,
        "camps": EVACUATION_CAMPS_DB,
    }


@app.patch("/api/facilities/{facility_id}/verify")
def verify_facility(facility_id: str, payload: VerifyFacilityPayload):
    if facility_id not in WATER_POINTS_DB:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} not found")

    pt = WATER_POINTS_DB[facility_id]
    now_iso = datetime.now(timezone.utc).isoformat()

    if payload.action == "dispatch_tanker":
        pt["tanker_dispatched"] = True
        pt["verified"] = True
        note = payload.note or "CDRRMO emergency water tanker dispatched."
    elif payload.action == "resolve_tanker":
        pt["tanker_dispatched"] = False
        pt["status"] = "Functional"
        pt["metrics"]["coliform_present"] = False
        pt["metrics"]["turbidity_ntu"] = min(pt["metrics"]["turbidity_ntu"], 1.8)
        pt["metrics"]["tds_ppm"] = min(pt["metrics"]["tds_ppm"], 280.0)
        pt["metrics"]["ph"] = 7.1
        pt["metrics"]["residual_chlorine"] = 0.4
        pt["verified"] = True
        note = payload.note or "Tanker ration resolved; chlorine shock dosing & line flush completed."
    else:
        pt["verified"] = True if payload.verified is None else payload.verified
        note = payload.note or "Telemetry verified by LGU Personnel."

    pt["data_provenance"] = "LGU Verified Field Telemetry" if pt["verified"] else "Simulated Baseline"
    pt["last_updated"] = now_iso
    enrich_point(pt)
    if payload.action == "dispatch_tanker":
        pt["tanker_dispatched"] = True
    elif payload.action == "resolve_tanker":
        pt["tanker_dispatched"] = False

    pt["history"].insert(0, {
        "recorded_at": now_iso,
        "bhw_name": payload.actor or "LGU Personnel",
        "wvi_score": pt["wvi_score"],
        "status": pt["status"],
        "coliform_present": pt["metrics"]["coliform_present"],
        "incident_note": note,
    })

    return {
        "facility": pt,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.post("/api/simulate/typhoon")
def simulate_typhoon(payload: Optional[TyphoonSimulatePayload] = None):
    if payload is not None and payload.scenario is not None:
        target_scenario = payload.scenario
    elif payload is not None and payload.active is not None:
        target_scenario = "typhoon" if payload.active else "baseline"
    else:
        target_scenario = "baseline" if TYPHOON_STATE["scenario"] != "baseline" else "typhoon"

    reset_to_baseline()
    if target_scenario == "baseline":
        return {
            "typhoon_active": False,
            "scenario": "baseline",
            "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
            "barangays": build_barangays_summary(),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    TYPHOON_STATE["scenario"] = target_scenario
    TYPHOON_STATE["active"] = target_scenario == "typhoon"
    TYPHOON_STATE["activated_at"] = now_iso

    for pt in WATER_POINTS_DB.values():
        in_high_flood = point_in_ring(pt["lng"], pt["lat"], HIGH_FLOOD_CONFLUENCE_RING)
        meta = BARANGAY_METADATA_DB.get(pt["barangay"], {})
        flood_tier = meta.get("flood_tier")

        if target_scenario == "monsoon":
            if in_high_flood or flood_tier == "high":
                pt["flood_risk_level"] = max(pt["flood_risk_level"], 4)
                pt["metrics"]["turbidity_ntu"] = max(round(pt["metrics"]["turbidity_ntu"] + 2.6, 1), 5.4)
                pt["metrics"]["tds_ppm"] = round(pt["metrics"]["tds_ppm"] + 115.0, 1)
                pt["metrics"]["residual_chlorine"] = max(0.0, round(pt["metrics"]["residual_chlorine"] - 0.15, 2))
                pt["data_provenance"] = "Monsoon Heavy Rain • Lowland Runoff Elevated"
            elif flood_tier == "moderate":
                pt["flood_risk_level"] = max(pt["flood_risk_level"], 3)
                pt["metrics"]["turbidity_ntu"] = round(pt["metrics"]["turbidity_ntu"] + 1.5, 1)
                pt["metrics"]["tds_ppm"] = round(pt["metrics"]["tds_ppm"] + 65.0, 1)
                pt["data_provenance"] = "Monsoon Heavy Rain • Moderate Corridor Exposure"
            else:
                pt["metrics"]["turbidity_ntu"] = round(pt["metrics"]["turbidity_ntu"] + 0.6, 1)
        else:
            if in_high_flood or flood_tier == "high":
                pt["flood_risk_level"] = 5
                pt["status"] = "Under Repair" if pt["status"] == "Functional" else pt["status"]
                pt["metrics"]["coliform_present"] = True
                pt["metrics"]["turbidity_ntu"] = max(pt["metrics"]["turbidity_ntu"], 9.2)
                pt["metrics"]["tds_ppm"] = max(pt["metrics"]["tds_ppm"], 680.0)
                pt["metrics"]["residual_chlorine"] = 0.0
                pt["data_provenance"] = "Typhoon Flood Simulation • High-Flood Spatial Intersection"
            elif flood_tier == "moderate":
                pt["flood_risk_level"] = max(pt["flood_risk_level"], 4)
                pt["metrics"]["turbidity_ntu"] = round(pt["metrics"]["turbidity_ntu"] + 2.8, 1)
                pt["metrics"]["tds_ppm"] = round(pt["metrics"]["tds_ppm"] + 120.0, 1)
                pt["data_provenance"] = "Typhoon Flood Simulation • Moderate Runoff Exposure"
            else:
                pt["metrics"]["turbidity_ntu"] = round(pt["metrics"]["turbidity_ntu"] + 1.4, 1)

        pt["last_updated"] = now_iso
        enrich_point(pt)

    return {
        "typhoon_active": TYPHOON_STATE["active"],
        "scenario": target_scenario,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.get("/api/admin/state")
def get_admin_state():
    return {
        "typhoon_active": TYPHOON_STATE["active"],
        "scenario": TYPHOON_STATE.get("scenario", "baseline"),
        "thresholds": THRESHOLDS,
    }


@app.patch("/api/admin/thresholds")
def update_thresholds(payload: ThresholdConfigPayload):
    THRESHOLDS["critical_wvi"] = payload.critical_wvi
    THRESHOLDS["advisory_wvi"] = payload.advisory_wvi
    THRESHOLDS["turbidity_limit"] = payload.turbidity_limit
    THRESHOLDS["tds_limit"] = payload.tds_limit
    return {
        "thresholds": THRESHOLDS,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
    }


@app.post("/api/admin/reset")
def admin_reset():
    reset_to_baseline()
    return {
        "typhoon_active": False,
        "scenario": "baseline",
        "thresholds": THRESHOLDS,
        "facilities": [enrich_point(p) for p in WATER_POINTS_DB.values()],
        "barangays": build_barangays_summary(),
        "reports": REPORTS_DB,
        "incidents": REPORTS_DB,
        "advisories": ADVISORIES_DB,
        "camps": EVACUATION_CAMPS_DB,
    }


@app.post("/api/v1/inspections/sync")
def sync_offline_inspections(logs: List[InspectionLog]):
    updated_points = []
    for log in logs:
        if log.point_id not in WATER_POINTS_DB:
            raise HTTPException(status_code=404, detail=f"Water point {log.point_id} not found")

        pt = WATER_POINTS_DB[log.point_id]
        pt["status"] = log.status
        pt["metrics"] = log.metrics.model_dump()
        pt["verified"] = True
        pt["data_provenance"] = "LGU Verified Field Telemetry"
        pt["last_updated"] = log.recorded_at or datetime.now(timezone.utc).isoformat()
        enrich_point(pt)

        pt["history"].insert(0, {
            "recorded_at": pt["last_updated"],
            "bhw_name": log.bhw_name,
            "wvi_score": pt["wvi_score"],
            "status": log.status,
            "coliform_present": log.metrics.coliform_present,
            "incident_note": log.incident_note or "Field inspection synced",
        })
        updated_points.append(pt)

    return {
        "synced_count": len(updated_points),
        "updated_points": updated_points,
        "barangays": build_barangays_summary(),
    }
