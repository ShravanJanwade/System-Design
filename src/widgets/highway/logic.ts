/**
 * Highway widget: a road as a picture of latency, throughput and bandwidth.
 *
 * Cars arrive at the on-ramp at a steady rate. Each open lane lets one car in every
 * two seconds, so the lanes set the road's capacity (its bandwidth). The speed limit
 * sets how long one car takes to cross (latency). Cars reaching the far end per minute
 * are the throughput. When cars arrive faster than the lanes can take them, a queue
 * forms at the on-ramp and every new car waits longer than the one before.
 *
 * The simulation is event-driven and deterministic: the same settings and the same
 * elapsed time always give the same picture, whatever the frame rate.
 */

/** Length of the stretch of road, in kilometres. Short on purpose, so cars cross in seconds. */
export const ROAD_KM = 0.25;
/** Each lane admits one car every this many seconds (drivers keep about two seconds apart). */
export const LANE_GAP_SEC = 2;
export const MAX_LANES = 4;
export const SPEEDS_KMH = [30, 60, 90, 120] as const;
export const ARRIVAL_MIN = 10;
export const ARRIVAL_MAX = 150;
export const ARRIVAL_STEP = 10;
/** The animation stops after this many simulated seconds; the learner can start it again. */
export const RUN_SECONDS = 180;
/** Reduced motion shows the road as it looks after this many seconds. */
export const SNAPSHOT_SECONDS = 60;

export type HighwayConfig = {
  lanes: number;
  speedKmh: number;
  arrivalsPerMin: number;
};

export const DEFAULT_CONFIG: HighwayConfig = { lanes: 2, speedKmh: 60, arrivalsPerMin: 40 };

/** Seconds for one car to cross the empty road: the latency. */
export function tripSeconds(speedKmh: number): number {
  return (ROAD_KM / speedKmh) * 3600;
}

/** Cars per minute the open lanes can carry: the bandwidth. */
export function capacityPerMin(lanes: number): number {
  return clampLanes(lanes) * (60 / LANE_GAP_SEC);
}

/** Cars delivered per minute once traffic settles: the throughput. It can never exceed capacity. */
export function throughputPerMin(cfg: HighwayConfig): number {
  return Math.min(cfg.arrivalsPerMin, capacityPerMin(cfg.lanes));
}

/** Share of the capacity in use, from 0 upwards (above 1 means overloaded). */
export function utilization(cfg: HighwayConfig): number {
  return cfg.arrivalsPerMin / capacityPerMin(cfg.lanes);
}

/** How fast the on-ramp queue grows, in cars per minute (0 while the road keeps up). */
export function queueGrowthPerMin(cfg: HighwayConfig): number {
  return Math.max(0, cfg.arrivalsPerMin - capacityPerMin(cfg.lanes));
}

/** Cars on the road at once in steady traffic: throughput × trip time (Little's law). */
export function carsOnRoad(cfg: HighwayConfig): number {
  return (throughputPerMin(cfg) / 60) * tripSeconds(cfg.speedKmh);
}

export function clampLanes(lanes: number): number {
  return Math.max(1, Math.min(MAX_LANES, Math.round(lanes)));
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export type QueuedCar = { id: number; arrivedAt: number };
export type RoadCar = { id: number; arrivedAt: number; lane: number; enteredAt: number; exitAt: number };

export type HighwayState = {
  /** Simulated seconds since the start. */
  t: number;
  nextArrivalAt: number;
  nextId: number;
  /** Cars waiting at the on-ramp, oldest first. */
  queue: QueuedCar[];
  /** Cars on the road. */
  road: RoadCar[];
  /** When each lane can take its next car. */
  laneFreeAt: number[];
  delivered: number;
  /** Exit times in the last minute, for the measured throughput. */
  recentExits: number[];
};

export function initialState(): HighwayState {
  return {
    t: 0,
    nextArrivalAt: 0,
    nextId: 0,
    queue: [],
    road: [],
    laneFreeAt: new Array<number>(MAX_LANES).fill(0),
    delivered: 0,
    recentExits: [],
  };
}

/** The open lane that frees up first (the least recently used one), and when. */
function earliestLane(laneFreeAt: number[], lanes: number): { lane: number; freeAt: number } {
  let lane = 0;
  for (let i = 1; i < lanes; i++) if (laneFreeAt[i]! < laneFreeAt[lane]!) lane = i;
  return { lane, freeAt: laneFreeAt[lane]! };
}

/**
 * Move the simulation forward by `dt` seconds with the current settings.
 * Settings may change between calls: cars already on the road keep their speed,
 * and a queue drains or grows from where it is.
 */
export function advance(state: HighwayState, dt: number, cfg: HighwayConfig): HighwayState {
  const lanes = clampLanes(cfg.lanes);
  const trip = tripSeconds(cfg.speedKmh);
  const gap = 60 / Math.max(1e-6, cfg.arrivalsPerMin);
  const end = state.t + Math.max(0, dt);

  const queue = state.queue.slice();
  const road = state.road.slice();
  const laneFreeAt = state.laneFreeAt.slice();
  let nextArrivalAt = state.nextArrivalAt;
  let nextId = state.nextId;
  let head = 0;

  for (;;) {
    let admitAt = Infinity;
    let admitLane = 0;
    if (head < queue.length) {
      const { lane, freeAt } = earliestLane(laneFreeAt, lanes);
      // Never before now: a lane that just opened cannot take cars in the past.
      admitAt = Math.max(queue[head]!.arrivedAt, freeAt, state.t);
      admitLane = lane;
    }
    const next = Math.min(admitAt, nextArrivalAt);
    if (next > end) break;
    if (admitAt <= nextArrivalAt) {
      const car = queue[head++]!;
      road.push({ id: car.id, arrivedAt: car.arrivedAt, lane: admitLane, enteredAt: admitAt, exitAt: admitAt + trip });
      laneFreeAt[admitLane] = admitAt + LANE_GAP_SEC;
    } else {
      queue.push({ id: nextId++, arrivedAt: nextArrivalAt });
      nextArrivalAt += gap;
    }
  }

  let delivered = state.delivered;
  const recentExits = state.recentExits.filter((x) => x > end - 60);
  const stillOnRoad: RoadCar[] = [];
  for (const car of road) {
    if (car.exitAt <= end) {
      delivered++;
      if (car.exitAt > end - 60) recentExits.push(car.exitAt);
    } else {
      stillOnRoad.push(car);
    }
  }

  return {
    t: end,
    nextArrivalAt,
    nextId,
    queue: queue.slice(head),
    road: stillOnRoad,
    laneFreeAt,
    delivered,
    recentExits,
  };
}

/** The road after `seconds` of traffic from an empty start: the reduced-motion snapshot. */
export function snapshot(cfg: HighwayConfig, seconds = SNAPSHOT_SECONDS): HighwayState {
  return advance(initialState(), seconds, cfg);
}

/** Where a car on the road is, from 0 (on-ramp) to 1 (exit). */
export function progress(car: RoadCar, t: number): number {
  const span = car.exitAt - car.enteredAt;
  return span > 0 ? Math.max(0, Math.min(1, (t - car.enteredAt) / span)) : 1;
}

/** Seconds a car joining the back of the queue right now would wait before it gets a lane. */
export function waitForNewCar(state: HighwayState, cfg: HighwayConfig): number {
  const lanes = clampLanes(cfg.lanes);
  const free = state.laneFreeAt.slice();
  for (const car of state.queue) {
    const { lane, freeAt } = earliestLane(free, lanes);
    free[lane] = Math.max(car.arrivedAt, freeAt, state.t) + LANE_GAP_SEC;
  }
  const { freeAt } = earliestLane(free, lanes);
  return Math.max(0, freeAt - state.t);
}

/** Total time for a car arriving now: the wait at the on-ramp plus the trip itself. */
export function tripForNewCar(state: HighwayState, cfg: HighwayConfig): number {
  return waitForNewCar(state, cfg) + tripSeconds(cfg.speedKmh);
}

/** Cars that reached the exit in the last minute (meaningful once a minute has passed). */
export function measuredThroughputPerMin(state: HighwayState): number {
  return state.recentExits.length;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** 7.5 -> "7.5 s", 15 -> "15 s", 95 -> "1 min 35 s". */
export function formatSeconds(sec: number): string {
  if (sec < 10) return `${(Math.round(sec * 10) / 10).toString()} s`;
  if (sec < 60) return `${Math.round(sec)} s`;
  const whole = Math.round(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** 42 -> "0:42", 125 -> "2:05". */
export function formatClock(sec: number): string {
  const whole = Math.floor(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
