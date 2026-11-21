import { describe, expect, it } from 'vitest';
import {
  MAX_OLD_VIEW_PERCENT,
  PLAIN,
  PLAIN_TOTAL,
  PRICES,
  SCALE_MAX,
  SNAPGRAM,
  allChoices,
  biggestLine,
  breakEvenOldViewPercent,
  changeVsPlain,
  choicesFromProps,
  costLines,
  describeBill,
  formatChange,
  formatUsd,
  niceCeil,
  scaleTicks,
  storageSplit,
  tieredCost,
  totalUsd,
  type Choices,
  type LineId,
  type Tier,
} from './logic';

const on = (patch: Partial<Choices>): Choices => ({ ...PLAIN, ...patch });
const line = (c: Choices, id: LineId) => costLines(c).find((l) => l.id === id)!.usd;

describe('tiered pricing', () => {
  it('charges each slice of usage at its own tier', () => {
    expect(tieredCost(0, PRICES.internet)).toBe(0);
    expect(tieredCost(1000, PRICES.internet)).toBeCloseTo(90, 6);
    expect(tieredCost(10_240, PRICES.internet)).toBeCloseTo(921.6, 6);
    expect(tieredCost(20_240, PRICES.internet)).toBeCloseTo(921.6 + 10_000 * 0.085, 6);
    // 10 TB at $0.09 + 40 TB at $0.085 + 100 TB at $0.07 + the rest at $0.05
    expect(tieredCost(2_592_000, PRICES.internet)).toBeCloseTo(921.6 + 3481.6 + 7168 + 2_438_400 * 0.05, 4);
  });

  it('gives the CDN its first terabyte free', () => {
    expect(tieredCost(1024, PRICES.cdn)).toBe(0);
    expect(tieredCost(2048, PRICES.cdn)).toBeCloseTo(1024 * 0.085, 6);
  });

  it('only ever gets cheaper per gigabyte as volume grows, after any free allowance', () => {
    const tables: readonly (readonly Tier[])[] = [PRICES.standard, PRICES.internet, PRICES.cdn, PRICES.replicaStandard];
    for (const tiers of tables) {
      for (let i = 1; i < tiers.length; i++) expect(tiers[i]!.upToGb).toBeGreaterThan(tiers[i - 1]!.upToGb);
      const paid = tiers.filter((t) => t.usdPerGb > 0);
      for (let i = 1; i < paid.length; i++) expect(paid[i]!.usdPerGb).toBeLessThanOrEqual(paid[i - 1]!.usdPerGb);
      expect(tiers[tiers.length - 1]!.upToGb).toBe(Infinity);
    }
  });

  it('the CDN costs less than sending straight from storage at every volume (request fees aside)', () => {
    for (const gb of [500, 5_000, 50_000, 200_000, 800_000, 2_592_000, 10_000_000]) {
      expect(tieredCost(gb, PRICES.cdn)).toBeLessThan(tieredCost(gb, PRICES.internet));
    }
  });
});

describe('the Snapgram bill', () => {
  const plain = costLines(PLAIN);

  it('prices compute as machines × 730 hours × the hourly price', () => {
    expect(line(PLAIN, 'compute')).toBeCloseTo(100 * 730 * 0.2016, 6);
    expect(line(PLAIN, 'compute')).toBeCloseTo(14_716.8, 4);
  });

  it('starts at about $191k a month, with transfer out about 70% of it', () => {
    expect(PLAIN_TOTAL).toBeCloseTo(190_771.2, 2);
    expect(line(PLAIN, 'transfer')).toBeCloseTo(133_491.2, 2);
    expect(line(PLAIN, 'standard')).toBeCloseTo(42_563.2, 2);
    expect(line(PLAIN, 'transfer') / PLAIN_TOTAL).toBeCloseTo(0.7, 2);
    expect(line(PLAIN, 'compute') / PLAIN_TOTAL).toBeLessThan(0.1);
    for (const id of ['cold', 'retrieval', 'replica'] as const) expect(line(PLAIN, id)).toBe(0);
    expect(plain.map((l) => l.id)).toEqual(['compute', 'standard', 'cold', 'retrieval', 'transfer', 'replica']);
  });

  it('the CDN cuts the transfer line by about 40%', () => {
    const cdn = line(on({ cdn: true }), 'transfer');
    expect(cdn).toBeCloseTo(79_223.04, 2);
    expect(1 - cdn / line(PLAIN, 'transfer')).toBeCloseTo(0.41, 2);
    expect(changeVsPlain(on({ cdn: true }))).toBeCloseTo(-0.28, 2);
  });

  it('colder storage moves 80% of photos to a class about a sixth of the price', () => {
    const c = on({ coldStorage: true, oldViewPercent: 0 });
    expect(storageSplit(c)).toEqual({ hotGb: 400_000, coldGb: 1_600_000 });
    expect(PRICES.cold / PRICES.standard[0]!.usdPerGb).toBeCloseTo(1 / 5.75, 6);
    expect(line(c, 'standard')).toBeCloseTo(8851.2, 2);
    expect(line(c, 'cold')).toBeCloseTo(6400, 6);
    // Storage drops from about $43k to about $15k before any reads.
    expect(line(c, 'standard') + line(c, 'cold')).toBeCloseTo(15_251.2, 2);
  });

  it('charges $0.03 for every gigabyte of old photos read back', () => {
    expect(line(on({ coldStorage: true, oldViewPercent: 5 }), 'retrieval')).toBeCloseTo(0.05 * 2_592_000 * 0.03, 6);
    expect(line(on({ coldStorage: false, oldViewPercent: 40 }), 'retrieval')).toBe(0);
  });

  it('colder storage stops paying off at about 35% of views, or about 72% with a cold second copy', () => {
    const alone = breakEvenOldViewPercent(on({ coldStorage: true }));
    expect(alone).toBeCloseTo(35.12, 1);
    // Below the break-even it saves money; above it, it costs more than it saves.
    expect(totalUsd(costLines(on({ coldStorage: true, oldViewPercent: 30 })))).toBeLessThan(PLAIN_TOTAL);
    expect(totalUsd(costLines(on({ coldStorage: true, oldViewPercent: 40 })))).toBeGreaterThan(PLAIN_TOTAL);
    const withCopy = breakEvenOldViewPercent(on({ coldStorage: true, secondRegion: true }));
    expect(withCopy).toBeCloseTo(72.3, 1);
    expect(withCopy).toBeGreaterThan(MAX_OLD_VIEW_PERCENT);
    // The CDN does not change the break-even: it only changes the transfer line.
    expect(breakEvenOldViewPercent(on({ coldStorage: true, cdn: true }))).toBeCloseTo(alone, 6);
  });

  it('a second region adds the copy across regions and a second set of storage', () => {
    const hot = line(on({ secondRegion: true }), 'replica');
    expect(hot).toBeCloseTo(46_563.2 + 30_000 * 0.02, 2);
    const cold = line(on({ secondRegion: true, coldStorage: true }), 'replica');
    expect(cold).toBeCloseTo(9651.2 + 8000 + 600, 2);
    expect(changeVsPlain(on({ secondRegion: true }))).toBeCloseTo(0.247, 3);
  });

  it('all three choices together cut the bill by about 31% at 5% old views', () => {
    const all = on({ coldStorage: true, cdn: true, secondRegion: true, oldViewPercent: 5 });
    expect(totalUsd(costLines(all))).toBeCloseTo(131_330.24, 2);
    expect(formatChange(changeVsPlain(all))).toBe('−31%');
  });

  it('transfer out is the biggest line in every combination', () => {
    for (const c of allChoices()) expect(biggestLine(costLines(c)).id).toBe('transfer');
  });

  it('is deterministic', () => {
    const c = on({ coldStorage: true, cdn: true, oldViewPercent: 17 });
    expect(costLines(c)).toEqual(costLines(c));
  });
});

describe('scale and formatting', () => {
  it('uses one fixed scale that fits every bar in every combination', () => {
    expect(SCALE_MAX).toBe(150_000);
    for (const c of allChoices()) for (const l of costLines(c)) expect(l.usd).toBeLessThanOrEqual(SCALE_MAX);
  });

  it('rounds up to friendly numbers and picks three to six gridlines', () => {
    expect(niceCeil(133_491.2)).toBe(150_000);
    expect(niceCeil(42_000)).toBe(50_000);
    expect(niceCeil(100)).toBe(100);
    expect(scaleTicks(150_000)).toEqual([0, 50_000, 100_000, 150_000]);
    expect(scaleTicks(50_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
  });

  it('formats money as ballpark figures', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(147.17)).toBe('$147');
    expect(formatUsd(3888)).toBe('$3.9k');
    expect(formatUsd(133_491.2)).toBe('$133k');
    expect(formatUsd(2_400_000)).toBe('$2.4M');
    expect(formatChange(-0.284)).toBe('−28%');
    expect(formatChange(0.247)).toBe('+25%');
    expect(formatChange(0.001)).toBe('No change');
  });

  it('reads starting choices from lesson props and clamps them', () => {
    expect(choicesFromProps()).toEqual(PLAIN);
    expect(choicesFromProps({ cold: true, cdn: true, secondRegion: false, oldViews: 12 })).toEqual({
      coldStorage: true,
      cdn: true,
      secondRegion: false,
      oldViewPercent: 12,
    });
    expect(choicesFromProps({ oldViews: 400 }).oldViewPercent).toBe(MAX_OLD_VIEW_PERCENT);
    expect(choicesFromProps({ oldViews: -3 }).oldViewPercent).toBe(0);
    expect(choicesFromProps({ cdn: 'yes' }).cdn).toBe(false);
  });

  it('describes the bill in words for screen readers', () => {
    const text = describeBill(on({ cdn: true }));
    expect(text).toContain('Transfer out, through the CDN: $79k');
    expect(text).toContain('Colder storage: off');
    expect(text).toContain('Total $137k a month');
    expect(SNAPGRAM.servedGb).toBe(2_592_000);
  });
});
