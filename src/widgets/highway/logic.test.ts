import { describe, expect, it } from 'vitest';
import {
  advance,
  capacityPerMin,
  carsOnRoad,
  formatClock,
  formatSeconds,
  initialState,
  measuredThroughputPerMin,
  progress,
  queueGrowthPerMin,
  snapshot,
  throughputPerMin,
  tripForNewCar,
  tripSeconds,
  utilization,
  waitForNewCar,
  type HighwayConfig,
  type HighwayState,
} from './logic';

/** Run in small steps, the way the animation does, and record the longest queue seen. */
function run(cfg: HighwayConfig, seconds: number, from: HighwayState = initialState(), dt = 1 / 30) {
  let s = from;
  let maxQueue = 0;
  const target = from.t + seconds;
  while (s.t < target - 1e-9) {
    s = advance(s, Math.min(dt, target - s.t), cfg);
    maxQueue = Math.max(maxQueue, s.queue.length);
  }
  return { state: s, maxQueue };
}

describe('formulas', () => {
  it('the speed limit sets the trip time (latency)', () => {
    expect(tripSeconds(60)).toBeCloseTo(15);
    expect(tripSeconds(120)).toBeCloseTo(7.5);
    expect(tripSeconds(30)).toBeCloseTo(30);
  });

  it('the lanes set the capacity (bandwidth): 30 cars a minute per lane', () => {
    expect(capacityPerMin(1)).toBe(30);
    expect(capacityPerMin(4)).toBe(120);
    expect(capacityPerMin(9)).toBe(120);
    expect(capacityPerMin(0)).toBe(30);
  });

  it('throughput is the arrival rate, capped at capacity', () => {
    expect(throughputPerMin({ lanes: 2, speedKmh: 60, arrivalsPerMin: 40 })).toBe(40);
    expect(throughputPerMin({ lanes: 2, speedKmh: 60, arrivalsPerMin: 90 })).toBe(60);
  });

  it('a faster speed limit lowers latency but leaves capacity and throughput alone', () => {
    const slow = { lanes: 2, speedKmh: 30, arrivalsPerMin: 50 };
    const fast = { ...slow, speedKmh: 120 };
    expect(tripSeconds(fast.speedKmh)).toBeLessThan(tripSeconds(slow.speedKmh));
    expect(throughputPerMin(fast)).toBe(throughputPerMin(slow));
    expect(capacityPerMin(fast.lanes)).toBe(capacityPerMin(slow.lanes));
  });

  it('utilization and queue growth', () => {
    expect(utilization({ lanes: 2, speedKmh: 60, arrivalsPerMin: 45 })).toBeCloseTo(0.75);
    expect(queueGrowthPerMin({ lanes: 2, speedKmh: 60, arrivalsPerMin: 45 })).toBe(0);
    expect(queueGrowthPerMin({ lanes: 1, speedKmh: 60, arrivalsPerMin: 90 })).toBe(60);
  });

  it('cars on the road equal throughput times trip time (Little’s law)', () => {
    // 40 cars a minute for 15 seconds each: 10 cars on the road at once.
    expect(carsOnRoad({ lanes: 2, speedKmh: 60, arrivalsPerMin: 40 })).toBeCloseTo(10);
  });
});

describe('simulation', () => {
  it('is deterministic and independent of the frame rate', () => {
    // 61.1 s sits between events (arrivals come every 2/3 s, lanes free on whole seconds).
    const cfg = { lanes: 2, speedKmh: 60, arrivalsPerMin: 90 };
    const a = run(cfg, 61.1, initialState(), 1 / 60).state;
    const b = run(cfg, 61.1, initialState(), 1 / 7).state;
    const c = snapshot(cfg, 61.1);
    for (const other of [b, c]) {
      expect(other.delivered).toBe(a.delivered);
      expect(other.queue.length).toBe(a.queue.length);
      expect(other.road.length).toBe(a.road.length);
    }
  });

  it('accounts for every car: arrived = waiting + on the road + delivered', () => {
    const s = snapshot({ lanes: 1, speedKmh: 30, arrivalsPerMin: 120 }, 90);
    expect(s.nextId).toBe(s.queue.length + s.road.length + s.delivered);
  });

  it('below capacity, no car ever waits at the on-ramp', () => {
    for (const cfg of [
      { lanes: 2, speedKmh: 60, arrivalsPerMin: 40 },
      { lanes: 2, speedKmh: 30, arrivalsPerMin: 60 },
      { lanes: 1, speedKmh: 120, arrivalsPerMin: 30 },
      { lanes: 4, speedKmh: 90, arrivalsPerMin: 120 },
    ]) {
      const { state, maxQueue } = run(cfg, 120);
      expect(maxQueue).toBe(0);
      expect(waitForNewCar(state, cfg)).toBeLessThan(0.01);
      expect(tripForNewCar(state, cfg)).toBeCloseTo(tripSeconds(cfg.speedKmh), 1);
    }
  });

  it('above capacity, the queue grows by arrivals minus capacity', () => {
    // 90 a minute into 60 a minute of lanes: 30 more waiting every minute.
    const s = snapshot({ lanes: 2, speedKmh: 60, arrivalsPerMin: 90 }, 120);
    expect(s.queue.length).toBeGreaterThanOrEqual(58);
    expect(s.queue.length).toBeLessThanOrEqual(62);
  });

  it('above capacity, each new car waits longer than the last: latency climbs', () => {
    const cfg = { lanes: 1, speedKmh: 60, arrivalsPerMin: 60 };
    const waits = [30, 60, 90, 120].map((t) => waitForNewCar(snapshot(cfg, t), cfg));
    for (let i = 1; i < waits.length; i++) expect(waits[i]!).toBeGreaterThan(waits[i - 1]!);
    // After two minutes, 60 cars are waiting for one lane that takes a car every 2 s.
    expect(waits[3]!).toBeGreaterThan(110);
    expect(waits[3]!).toBeLessThan(130);
  });

  it('measured throughput settles at the formula: arrivals below capacity, capacity above it', () => {
    const under = { lanes: 2, speedKmh: 60, arrivalsPerMin: 50 };
    const over = { lanes: 2, speedKmh: 60, arrivalsPerMin: 110 };
    expect(Math.abs(measuredThroughputPerMin(snapshot(under, 120)) - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(measuredThroughputPerMin(snapshot(over, 120)) - 60)).toBeLessThanOrEqual(1);
  });

  it('the speed limit does not change throughput once traffic settles', () => {
    const slow = snapshot({ lanes: 2, speedKmh: 30, arrivalsPerMin: 50 }, 150);
    const fast = snapshot({ lanes: 2, speedKmh: 120, arrivalsPerMin: 50 }, 150);
    expect(Math.abs(measuredThroughputPerMin(slow) - measuredThroughputPerMin(fast))).toBeLessThanOrEqual(1);
  });

  it('a faster speed limit does not shorten a queue: only more lanes do', () => {
    const slow = snapshot({ lanes: 1, speedKmh: 30, arrivalsPerMin: 60 }, 90);
    const fast = snapshot({ lanes: 1, speedKmh: 120, arrivalsPerMin: 60 }, 90);
    expect(fast.queue.length).toBe(slow.queue.length);
    const wider = snapshot({ lanes: 2, speedKmh: 30, arrivalsPerMin: 60 }, 90);
    expect(wider.queue.length).toBe(0);
  });

  it('opening lanes mid-run drains the queue instead of resetting the road', () => {
    const jammed = snapshot({ lanes: 1, speedKmh: 60, arrivalsPerMin: 60 }, 60);
    expect(jammed.queue.length).toBeGreaterThanOrEqual(28);
    const wider = { lanes: 4, speedKmh: 60, arrivalsPerMin: 60 };
    // Four lanes carry 120 a minute; the extra 60 a minute clears about 30 cars in 30 seconds.
    const after10 = advance(jammed, 10, wider);
    expect(after10.queue.length).toBeLessThan(jammed.queue.length);
    expect(after10.queue.length).toBeGreaterThan(0);
    const after45 = advance(jammed, 45, wider);
    expect(after45.queue.length).toBe(0);
    expect(after45.delivered).toBeGreaterThan(jammed.delivered);
  });

  it('cars on the road match Little’s law in steady traffic', () => {
    const cfg = { lanes: 2, speedKmh: 60, arrivalsPerMin: 40 };
    const s = snapshot(cfg, 90);
    expect(Math.abs(s.road.length - carsOnRoad(cfg))).toBeLessThanOrEqual(1);
  });

  it('only uses open lanes, and spreads cars across them', () => {
    const s = snapshot({ lanes: 3, speedKmh: 30, arrivalsPerMin: 90 }, 40);
    const used = new Set(s.road.map((c) => c.lane));
    expect([...used].sort()).toEqual([0, 1, 2]);
  });

  it('progress runs from 0 at the on-ramp to 1 at the exit', () => {
    const car = { id: 0, arrivedAt: 0, lane: 0, enteredAt: 10, exitAt: 25 };
    expect(progress(car, 10)).toBe(0);
    expect(progress(car, 17.5)).toBeCloseTo(0.5);
    expect(progress(car, 40)).toBe(1);
  });
});

describe('formatting', () => {
  it('formats seconds and clock times', () => {
    expect(formatSeconds(7.5)).toBe('7.5 s');
    expect(formatSeconds(15)).toBe('15 s');
    expect(formatSeconds(95)).toBe('1 min 35 s');
    expect(formatSeconds(120)).toBe('2 min');
    expect(formatClock(42)).toBe('0:42');
    expect(formatClock(125.7)).toBe('2:05');
  });
});
