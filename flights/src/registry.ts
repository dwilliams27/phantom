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
  MCO: "americas", MIA: "americas", MSP: "americas", ORD: "americas",
  PHL: "americas", PHX: "americas", SEA: "americas", SFO: "americas",
  SLC: "americas", TPA: "americas",
  // Americas - Canada
  YUL: "americas", YVR: "americas", YYZ: "americas",
  // Americas - Latin America
  BOG: "americas", CUN: "americas", GRU: "americas", GIG: "americas",
  LIM: "americas", MEX: "americas", PTY: "americas", SCL: "americas",
  // Europe
  AMS: "europe", ARN: "europe", ATH: "europe", BCN: "europe",
  BRU: "europe", CDG: "europe", CPH: "europe", DUB: "europe",
  DUS: "europe", FCO: "europe", FRA: "europe", HEL: "europe",
  IST: "europe", LHR: "europe", LGW: "europe", LIS: "europe",
  MAD: "europe", MAN: "europe", MUC: "europe", OSL: "europe",
  VIE: "europe", WAW: "europe", ZRH: "europe",
  // Asia
  BKK: "asia", BOM: "asia", CAN: "asia", CGK: "asia",
  DEL: "asia", DXB: "asia", HKG: "asia", HND: "asia",
  ICN: "asia", KIX: "asia", KUL: "asia", MNL: "asia",
  NRT: "asia", PEK: "asia", PVG: "asia", SIN: "asia",
  TPE: "asia",
  // Middle East
  AUH: "asia", DOH: "asia", JED: "asia", RUH: "asia",
  // Africa
  ADD: "africa", CAI: "africa", CMN: "africa", JNB: "africa",
  NBO: "africa", LOS: "africa",
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
