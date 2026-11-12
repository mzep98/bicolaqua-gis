from datetime import datetime, timezone
from typing import List, Literal, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="BicolAqua-GIS Core API", version="2.0.0")

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
    lat: float
    lng: float
    elevation_m: float
    source_type: Literal["Handpump", "Public Kiosk", "Communal Spring", "School Filtration"]
    status: Literal["Functional", "Under Repair", "Abandoned"]
    flood_risk_level: int = Field(..., ge=1, le=5)
    population_served: int
    metrics: WaterMetrics
    wvi_score: float = 0.0
    risk_tier: str = "Safe / Compliant"
    last_updated: str
    data_provenance: str = "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate"
    history: List[HistoricalRecord] = []

def calculate_wvi(point: dict) -> tuple[float, str]:
    """
    Deterministic 0-100 Water Vulnerability Index (WVI):
    - Water Quality Hazard (40%): Coliform presence (+25), TDS > 500 ppm (up to +10), unsafe pH (+5), turbidity > 5 NTU (+5)
    - Flood Inundation Exposure (25%): Flood risk tier (1-5) scaled to 25
    - Infrastructure Operational State (20%): Functional (0), Under Repair (14), Abandoned (20)
    - Population Dependency Pressure (15%): Normalized to 1,000 residents
    """
    m = point["metrics"]
    quality_risk = 0.0
    if m["coliform_present"]:
        quality_risk += 25.0
    if m["tds_ppm"] > 500:
        quality_risk += min(10.0, (m["tds_ppm"] - 500) / 50.0)
    if m["ph"] < 6.5 or m["ph"] > 8.5:
        quality_risk += 5.0
    if m["turbidity_ntu"] > 5.0:
        quality_risk += 5.0
    quality_risk = min(40.0, quality_risk)

    flood_risk = (point["flood_risk_level"] / 5.0) * 25.0
    status_map = {"Functional": 0.0, "Under Repair": 14.0, "Abandoned": 20.0}
    infra_risk = status_map.get(point["status"], 10.0)
    pop_risk = min(15.0, (point["population_served"] / 1000.0) * 15.0)

    total_wvi = round(quality_risk + flood_risk + infra_risk + pop_risk, 1)

    if total_wvi >= 65.0:
        tier = "Critical (Dispatch Tanker)"
    elif total_wvi >= 35.0:
        tier = "Moderate (Boil-Water Advisory)"
    else:
        tier = "Safe / Compliant"

    return total_wvi, tier

WATER_POINTS_DB: dict[str, dict] = {
    "NAGA-01": {
        "id": "NAGA-01",
        "name": "Sitio Cararayan Shallow Well #2",
        "barangay": "Cararayan",
        "lat": 13.6368,
        "lng": 123.2351,
        "elevation_m": 48.0,
        "source_type": "Handpump",
        "status": "Functional",
        "flood_risk_level": 2,
        "population_served": 320,
        "metrics": {"ph": 7.1, "tds_ppm": 240.0, "turbidity_ntu": 1.8, "coliform_present": False},
        "last_updated": "2026-11-10T08:00:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-01T08:00:00Z", "bhw_name": "BHW M. Santos", "wvi_score": 14.8, "status": "Functional", "coliform_present": False, "incident_note": "Routine baseline check"}
        ],
    },
    "NAGA-02": {
        "id": "NAGA-02",
        "name": "Sabang Riverside Public Kiosk",
        "barangay": "Sabang",
        "lat": 13.6192,
        "lng": 123.1815,
        "elevation_m": 2.1,
        "source_type": "Public Kiosk",
        "status": "Under Repair",
        "flood_risk_level": 5,
        "population_served": 850,
        "metrics": {"ph": 6.4, "tds_ppm": 610.0, "turbidity_ntu": 7.2, "coliform_present": True},
        "last_updated": "2026-11-11T14:30:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [
            {"recorded_at": "2026-11-05T09:15:00Z", "bhw_name": "BHW R. Reyes", "wvi_score": 37.8, "status": "Functional", "coliform_present": False, "incident_note": "Pre-monsoon check"},
            {"recorded_at": "2026-11-11T14:30:00Z", "bhw_name": "BHW R. Reyes", "wvi_score": 80.5, "status": "Under Repair", "coliform_present": True, "incident_note": "River backflow intrusion near kiosk apron"}
        ],
    },
    "NAGA-03": {
        "id": "NAGA-03",
        "name": "Concepcion Pequeña Elementary Filtration",
        "barangay": "Concepcion Pequeña",
        "lat": 13.6154,
        "lng": 123.1972,
        "elevation_m": 6.5,
        "source_type": "School Filtration",
        "status": "Functional",
        "flood_risk_level": 3,
        "population_served": 640,
        "metrics": {"ph": 7.3, "tds_ppm": 185.0, "turbidity_ntu": 0.9, "coliform_present": False},
        "last_updated": "2026-11-12T07:15:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
    "NAGA-04": {
        "id": "NAGA-04",
        "name": "Triangulo Zone 4 Communal Pump",
        "barangay": "Triangulo",
        "lat": 13.6148,
        "lng": 123.1889,
        "elevation_m": 2.4,
        "source_type": "Handpump",
        "status": "Functional",
        "flood_risk_level": 4,
        "population_served": 510,
        "metrics": {"ph": 6.8, "tds_ppm": 430.0, "turbidity_ntu": 4.1, "coliform_present": False},
        "last_updated": "2026-11-11T16:45:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
    "NAGA-05": {
        "id": "NAGA-05",
        "name": "Peñafrancia Basilica Community Refill Station",
        "barangay": "Peñafrancia",
        "lat": 13.6312,
        "lng": 123.1945,
        "elevation_m": 5.2,
        "source_type": "Public Kiosk",
        "status": "Functional",
        "flood_risk_level": 3,
        "population_served": 720,
        "metrics": {"ph": 7.2, "tds_ppm": 210.0, "turbidity_ntu": 1.2, "coliform_present": False},
        "last_updated": "2026-11-12T06:50:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
    "NAGA-06": {
        "id": "NAGA-06",
        "name": "Mabolo Bicol-Riverbank Shallow Well",
        "barangay": "Mabolo",
        "lat": 13.6115,
        "lng": 123.1785,
        "elevation_m": 1.8,
        "source_type": "Handpump",
        "status": "Under Repair",
        "flood_risk_level": 5,
        "population_served": 590,
        "metrics": {"ph": 6.6, "tds_ppm": 540.0, "turbidity_ntu": 5.8, "coliform_present": False},
        "last_updated": "2026-11-11T17:10:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
    "NAGA-07": {
        "id": "NAGA-07",
        "name": "Tabuco Market Annex Public Water Stand",
        "barangay": "Tabuco",
        "lat": 13.6188,
        "lng": 123.1862,
        "elevation_m": 2.0,
        "source_type": "Public Kiosk",
        "status": "Abandoned",
        "flood_risk_level": 5,
        "population_served": 910,
        "metrics": {"ph": 6.3, "tds_ppm": 690.0, "turbidity_ntu": 8.4, "coliform_present": True},
        "last_updated": "2026-11-11T11:20:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
    "NAGA-08": {
        "id": "NAGA-08",
        "name": "Mt. Isarog Pacol Upland Gravity Spring",
        "barangay": "Pacol",
        "lat": 13.6485,
        "lng": 123.2410,
        "elevation_m": 92.0,
        "source_type": "Communal Spring",
        "status": "Functional",
        "flood_risk_level": 1,
        "population_served": 410,
        "metrics": {"ph": 7.4, "tds_ppm": 125.0, "turbidity_ntu": 0.6, "coliform_present": False},
        "last_updated": "2026-11-12T08:10:00Z",
        "data_provenance": "Synthetic Demo Telemetry • Verified Barangay WGS84 Coordinate",
        "history": [],
    },
}

for pt in WATER_POINTS_DB.values():
    pt["wvi_score"], pt["risk_tier"] = calculate_wvi(pt)

@app.get("/api/v1/water-points", response_model=List[WaterPoint])
def get_water_points():
    return list(WATER_POINTS_DB.values())

@app.post("/api/v1/inspections/sync")
def sync_offline_inspections(logs: List[InspectionLog]):
    updated_points = []
    for log in logs:
        if log.point_id not in WATER_POINTS_DB:
            raise HTTPException(status_code=404, detail=f"Water point {log.point_id} not found")

        pt = WATER_POINTS_DB[log.point_id]
        pt["status"] = log.status
        pt["metrics"] = log.metrics.model_dump()
        pt["last_updated"] = log.recorded_at or datetime.now(timezone.utc).isoformat()
        pt["wvi_score"], pt["risk_tier"] = calculate_wvi(pt)

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
    }