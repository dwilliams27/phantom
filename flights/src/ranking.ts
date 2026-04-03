export interface Flight {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: string[];
  aircraft: string;
  economyMiles: number;
  businessMiles: number;
  seatsRemaining?: string;
}

export interface RankingConfig {
  maxTravelHours: number;
  preferNonstop: boolean;
  topN: number;
  weights: {
    price: number;
    duration: number;
  };
}

export interface RankedFlight extends Flight {
  score: number;
  durationMinutes: number;
  relevantMiles: number;
}

export function parseDuration(dur: string): number {
  let minutes = 0;
  const hMatch = dur.match(/(\d+)\s*h/);
  const mMatch = dur.match(/(\d+)\s*m/);
  if (hMatch) minutes += parseInt(hMatch[1], 10) * 60;
  if (mMatch) minutes += parseInt(mMatch[1], 10);
  return minutes;
}

export function rankFlights(flights: Flight[], config: RankingConfig, searchClass: string): RankedFlight[] {
  const maxMinutes = config.maxTravelHours * 60;

  // Attach parsed data
  const parsed: RankedFlight[] = flights.map(f => ({
    ...f,
    durationMinutes: parseDuration(f.duration),
    relevantMiles: searchClass === "business" ? f.businessMiles : f.economyMiles,
    score: 0,
  }));

  // Filter by max travel time
  const filtered = parsed.filter(f => f.durationMinutes <= maxMinutes);
  if (filtered.length === 0) return [];

  // Find min/max for normalization
  const prices = filtered.map(f => f.relevantMiles).filter(p => p > 0);
  const durations = filtered.map(f => f.durationMinutes);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDur = Math.min(...durations);
  const maxDur = Math.max(...durations);
  const priceRange = maxPrice - minPrice || 1;
  const durRange = maxDur - minDur || 1;

  // Score each flight (lower = better)
  for (const f of filtered) {
    const priceNorm = (f.relevantMiles - minPrice) / priceRange;
    const durNorm = (f.durationMinutes - minDur) / durRange;
    let score = config.weights.price * priceNorm + config.weights.duration * durNorm;
    // Nonstop bonus: reduce score by 10% for nonstop flights
    if (config.preferNonstop && f.stops.length === 0) score *= 0.9;
    f.score = Math.round(score * 1000) / 1000;
  }

  // Sort by score (lower = better)
  filtered.sort((a, b) => a.score - b.score);

  return filtered.slice(0, config.topN);
}
