import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../config/airlines.json");

export interface AirlineCapabilities {
  oneWay: boolean;
  roundTrip: boolean;
  classSelection: boolean;
}

export interface AirlineSearchMode {
  taskPath: string;
  searchUrl: string;
}

export interface Airline {
  id: string;
  name: string;
  searchModes: {
    points?: AirlineSearchMode;
    dollars?: AirlineSearchMode;
  };
  hubs: string[];
  regions: string[];
  nonstopRoutes: string[];
  capabilities: AirlineCapabilities;
  status: "onboarded" | "testing" | "planned";
}

// Major airports → region mapping. Add airports as encountered.
const AIRPORT_REGIONS: Record<string, string> = {
  // Americas - US
  ATL: "americas", AUS: "americas", BOS: "americas", BWI: "americas",
  CLT: "americas", DEN: "americas", DFW: "americas", DTW: "americas",
  EWR: "americas", FLL: "americas", HNL: "americas", IAD: "americas",
  IAH: "americas", JFK: "americas", LAS: "americas", LAX: "americas",
  MCO: "americas", MIA: "americas", MSP: "americas", MSY: "americas",
  ORD: "americas", PHL: "americas", PHX: "americas", RDU: "americas",
  SAN: "americas", SEA: "americas", SFO: "americas", SLC: "americas",
  TPA: "americas",
  // Americas - Canada
  YOW: "americas", YQB: "americas", YUL: "americas", YVR: "americas",
  YYZ: "americas",
  // Americas - Latin America + Caribbean
  BOG: "americas", CAY: "americas", CUN: "americas", EZE: "americas",
  FDF: "americas", FOR: "americas", GIG: "americas", GRU: "americas",
  HAV: "americas", LIM: "americas", MEX: "americas", PTP: "americas",
  PTY: "americas", PUJ: "americas", SCL: "americas", SJO: "americas",
  SSA: "americas", SXM: "americas",
  // Europe
  AGP: "europe", AMS: "europe", ARN: "europe", ATH: "europe",
  BCN: "europe", BER: "europe", BHX: "europe", BIO: "europe",
  BLL: "europe", BLQ: "europe", BRI: "europe", BRU: "europe",
  BSL: "europe", BUD: "europe", CDG: "europe", CPH: "europe",
  CTA: "europe", DBV: "europe", DUB: "europe", DUS: "europe",
  EDI: "europe", FCO: "europe", FLR: "europe", FRA: "europe",
  GOT: "europe", GVA: "europe", HAJ: "europe", HAM: "europe",
  HEL: "europe", HER: "europe", IST: "europe", KRK: "europe",
  LGW: "europe", LHR: "europe", LIN: "europe", LIS: "europe",
  LJU: "europe", MAD: "europe", MAN: "europe", MLA: "europe",
  MUC: "europe", MXP: "europe", NAP: "europe", NCE: "europe",
  NCL: "europe", NUE: "europe", OPO: "europe", ORK: "europe",
  OSL: "europe", OTP: "europe", PMI: "europe", PMO: "europe",
  PRG: "europe", SPU: "europe", SVQ: "europe", TIA: "europe",
  TLV: "europe", TRN: "europe", VCE: "europe", VIE: "europe",
  VLC: "europe", VRN: "europe", WAW: "europe", ZAG: "europe",
  ZRH: "europe",
  // Asia
  BKK: "asia", BLR: "asia", BOM: "asia", CAN: "asia", CGK: "asia",
  DEL: "asia", DXB: "asia", HKG: "asia", HKT: "asia", HND: "asia",
  ICN: "asia", KIX: "asia", KUL: "asia", MLE: "asia", MNL: "asia",
  NRT: "asia", PEK: "asia", PVG: "asia", SGN: "asia", SIN: "asia",
  TPE: "asia",
  // Middle East
  AUH: "asia", DOH: "asia", JED: "asia", RUH: "asia",
  // Africa
  ABJ: "africa", ABV: "africa", ADD: "africa", ALG: "africa",
  BZV: "africa", CAI: "africa", CKY: "africa", CMN: "africa",
  COO: "africa", CPT: "africa", DLA: "africa", DSS: "africa",
  FIH: "africa", JNB: "africa", JRO: "africa", LBV: "africa",
  LFW: "africa", LOS: "africa", MRU: "africa", NBO: "africa",
  NDJ: "africa", NKC: "africa", NSI: "africa", ORN: "africa",
  PNR: "africa", RAK: "africa", RBA: "africa", RUN: "africa",
  SSG: "africa", TNG: "africa", TNR: "africa", TUN: "africa",
  ZNZ: "africa",
  // Oceania
  AKL: "oceania", MEL: "oceania", SYD: "oceania",
};

export function getAirportRegion(iata: string): string | null {
  return AIRPORT_REGIONS[iata.toUpperCase()] ?? null;
}

export function loadRegistry(): Airline[] {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Airline[];
}

export function getAirline(id: string): Airline | null {
  return loadRegistry().find(a => a.id === id) ?? null;
}

export function hasNonstop(airline: Airline, origin: string, destination: string): boolean {
  const pair1 = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
  const pair2 = `${destination.toUpperCase()}-${origin.toUpperCase()}`;
  return airline.nonstopRoutes.includes(pair1) || airline.nonstopRoutes.includes(pair2);
}

export function findAirlinesForRoute(
  origin: string,
  destination: string,
  stops: "any" | "nonstop" | "max1stop" = "any",
  searchMode: "points" | "dollars" = "points",
): Airline[] {
  const airlines = loadRegistry().filter(a => a.status === "onboarded");
  const originRegion = getAirportRegion(origin);
  const destRegion = getAirportRegion(destination);

  if (!originRegion) console.error(`WARNING: Unknown airport code ${origin} -- not in AIRPORT_REGIONS. All airlines will be suggested.`);
  if (!destRegion) console.error(`WARNING: Unknown airport code ${destination} -- not in AIRPORT_REGIONS. All airlines will be suggested.`);

  return airlines.filter(airline => {
    if (!airline.searchModes[searchMode]) return false;
    if (originRegion && !airline.regions.includes(originRegion)) return false;
    if (destRegion && !airline.regions.includes(destRegion)) return false;
    if (stops === "nonstop" && !hasNonstop(airline, origin, destination)) return false;
    return true;
  });
}

export function getTaskPath(airline: Airline, searchMode: "points" | "dollars"): string | null {
  return airline.searchModes[searchMode]?.taskPath ?? null;
}

export function getSearchUrl(airline: Airline, searchMode: "points" | "dollars"): string | null {
  return airline.searchModes[searchMode]?.searchUrl ?? null;
}
