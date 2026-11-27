"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { evaluate, bootstrap, highLoadThreshold, imbalance, permutation, toBuyerMWh } = require("./study-model");
const { parseZone, parseLoad, parseForecast, forecastFile } = require("./prepare-study");

const date = "2025-04-01";
const flat = (forecast, actual = forecast) => Array.from({ length: 24 }, () => [actual, forecast]);
const day = (date, dayAhead, realTime, load = flat(10000)) => ({
  date, prices: Array.from({ length: 24 }, () => [dayAhead, realTime]), load,
});
const calibration = [day("2025-01-02", 100, 200)];
const evaluation = [day(date, 400, 100), day("2025-04-05", -500, -600)];

// Fifty days of varied prices and loads, calibration first, for rules that depend on history.
function series() {
  const days = Array.from({ length: 50 }, (_, offset) => {
    const stamp = new Date(Date.UTC(2025, 2, 1 + offset)).toISOString().slice(0, 10);
    const load = Array.from({ length: 24 }, (_, hour) => {
      const forecast = 8000 + ((offset * 37 + hour * 91) % 2300);
      return [forecast + ((offset * 13 + hour * 7) % 400) - 150, forecast];
    });
    const prices = Array.from({ length: 24 }, (_, hour) => {
      const dayAhead = 3000 + ((offset * 17 + hour * 29) % 900);
      return [dayAhead, dayAhead + ((offset * 53 + hour * 11) % 1500) - 600];
    });
    return { date: stamp, prices, load };
  });
  return { calibration: days.slice(0, 20), evaluation: days.slice(20) };
}

test("the evaluation period cannot change calibrated hours", () => {
  const first = evaluate({ calibration, evaluation });
  const opposite = evaluate({ calibration, evaluation: [day(date, 100, 400)] });
  assert.deepEqual(first.hours, opposite.hours);
  assert.equal(first.hours.reduce((sum, flag) => sum + flag, 0), 16);
  assert.deepEqual(evaluate({ calibration: [day("2025-01-02", 200, 100)], evaluation }).hours, Array(24).fill(0));
  assert.throws(() => evaluate({ calibration: [day(date, 100, 200)], evaluation }), /precede/);
});

test("an extra 5 MWh at a $3 premium costs exactly $15 per eligible hour", () => {
  const { days, summary } = evaluate({ calibration, evaluation });
  assert.equal(days[0].rows[18].costs[1] - days[0].rows[18].costs[0], 1500);
  assert.equal(days[0].costs[1] - days[0].costs[0], 24000);
  assert.equal(days[1].costs[1], days[1].costs[0]);
  assert.equal(summary[1].total - summary[0].total, 24000);
  assert.equal(summary[1].higherCostDays, 1);
  const zero = evaluate({ calibration, evaluation }, 0);
  for (const rule of [1, 2, 3]) assert.equal(zero.summary[rule].total, zero.summary[0].total);
  assert.equal(zero.summary[1].higherCostDays, 0);
});

test("the buyer takes 1.5% of NYC load in whole MWh, rounding halves up", () => {
  assert.deepEqual([0, 33, 34, 100, 5800, 10188].map(toBuyerMWh), [0, 0, 1, 2, 87, 153]);
});

test("forecast-only cost splits exactly into day-ahead purchases and imbalance", () => {
  const { days, summary } = evaluate(series());
  const totals = imbalance(days);
  let expectedDayAhead = 0, expectedImbalance = 0;
  for (const { rows } of days) {
    for (const row of rows) {
      const exact = row.used * row.dayAhead + (row.used - row.forecast) * (row.realTime - row.dayAhead);
      assert.equal(row.costs[0], exact);
      expectedDayAhead += row.used * row.dayAhead;
      expectedImbalance += (row.used - row.forecast) * (row.realTime - row.dayAhead);
    }
  }
  assert.equal(totals.dayAheadCost, expectedDayAhead);
  assert.equal(totals.total, expectedImbalance);
  assert.equal(totals.dayAheadCost + totals.total, summary[0].total);
  assert.equal(totals.underForecast + totals.overForecast, totals.total);
  assert.ok(totals.underForecast !== 0 && totals.overForecast !== 0, "the sample should have misses in both directions");
});

test("the high-load threshold is a nearest-rank 90th percentile of the 28 days before the date", () => {
  const history = Array.from({ length: 30 }, (_, offset) => ({
    date: new Date(Date.UTC(2025, 3, 1 + offset)).toISOString().slice(0, 10),
    load: Array.from({ length: 24 }, (_, hour) => [0, offset * 24 + hour]),
  }));
  // For May 1 the window is April 3 (offset 2) to April 30 (offset 29): values 48..719, 672 of them.
  const values = Array.from({ length: 672 }, (_, index) => 48 + index);
  assert.equal(highLoadThreshold(history, "2025-05-01"), values[Math.ceil(0.9 * 672) - 1]);
  assert.equal(highLoadThreshold(history, "2025-05-01"), 652);
  // The market date itself is never history, and no history means the rule never fires.
  assert.equal(highLoadThreshold(history, "2025-04-01"), Infinity);
  assert.equal(highLoadThreshold(history.slice(0, 1), "2025-06-01"), Infinity);
});

test("the high-load rule uses no forecast from the market date or later for earlier decisions", () => {
  const data = series();
  const base = evaluate(data);
  assert.ok(base.highLoadHours > 0, "the sample should trigger the rule");
  for (const start of [5, 17, 29]) {
    const mutated = structuredClone(data);
    mutated.evaluation.slice(start).forEach((item, offset) => {
      item.load = item.load.map(([actual, forecast]) => [actual, forecast + 5000 * (offset % 2 ? 1 : -1)]);
    });
    const changed = evaluate(mutated);
    assert.deepEqual(changed.days.slice(0, start).map(item => item.rows.map(row => row.scheduled)),
      base.days.slice(0, start).map(item => item.rows.map(row => row.scheduled)));
    // Even the threshold on the first mutated date is unchanged: it sees only earlier days.
    assert.deepEqual(changed.days.slice(0, start + 1).map(item => item.threshold),
      base.days.slice(0, start + 1).map(item => item.threshold));
  }
  // The rule applies to every day of the week, weekends included.
  const weekend = base.days.find(item =>
    [0, 6].includes(new Date(item.date + "T00:00:00Z").getUTCDay()) && item.rows.some(row => row.highLoad));
  assert.ok(weekend);
});

test("the load forecast for day D comes from the file issued on day D-1", () => {
  assert.equal(forecastFile("2025-01-01"), "20241231isolf.csv");
  assert.equal(forecastFile("2025-03-10"), "20250309isolf.csv");
  const header = '"Time Stamp","Capitl","Centrl","Dunwod","Genese","Hud Vl","Longil","Mhk Vl","Millwd","N.Y.C.","North","West","NYISO"';
  const row = (stamp, nyc) => '"' + stamp + '",1,2,3,4,5,6,7,8,' + nyc + ",10,11,12";
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0") + ":00");
  const file = [header, ...hours.map(hour => row("01/01/2025 " + hour, 4000)),
    ...hours.map(hour => row("01/02/2025 " + hour, 5000)), ...hours.map(hour => row("01/03/2025 " + hour, 6000))];
  assert.deepEqual(parseForecast(file.join("\r\n"), "2025-01-02"), Array(24).fill(5000));
  assert.deepEqual(parseForecast(file.join("\r\n"), "2025-01-03"), Array(24).fill(6000));
});

test("NYISO price parser rejects missing, duplicate, off-hour and wrong-zone records", () => {
  const header = "Time Stamp,Name,PTID,LBMP ($/MWHr),Marginal Cost Losses ($/MWHr),Marginal Cost Congestion ($/MWHr)";
  const lines = Array.from({ length: 24 }, (_, hour) =>
    '"04/01/2025 ' + String(hour).padStart(2, "0") + ':00","N.Y.C.",61761,-17.04,0.00,0.00'
  );
  const parse = records => parseZone([header, ...records].join("\r\n"), date, "rtlbmp");
  assert.deepEqual(parse(lines), Array(24).fill(-1704));
  assert.throws(() => parse(lines.slice(1)), /missing/);
  assert.throws(() => parse([...lines, lines[0]]), /repeats/);
  assert.throws(() => parse([lines[0].replace("00:00", "00:05"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("61761", "61760"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("04/01/2025", "04/02/2025"), ...lines.slice(1)]), /invalid/);
});

test("NYISO load parser rejects missing hours, wrong zones and malformed values", () => {
  const header = '"Time Stamp","Time Zone","Name","PTID","Integrated Load"';
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  const lines = hours.map(hour => '"04/01/2025 ' + hour + ':00:00","EDT","N.Y.C.",61761,5000.4585');
  const others = hours.map(hour => '"04/01/2025 ' + hour + ':00:00","EDT","CAPITL",61757,1000.1');
  const parse = records => parseLoad([header, ...records].join("\r\n"), date);
  assert.deepEqual(parse([...others, ...lines]), Array(24).fill(5000));
  assert.throws(() => parse(lines.slice(1)), /missing/);
  assert.throws(() => parse(others), /missing/);
  assert.throws(() => parse([...lines, lines[3]]), /repeats/);
  assert.throws(() => parse([lines[0].replace("N.Y.C.", "LONGIL"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("61761", "61760"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("00:00:00", "00:30:00"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("5000.4585", "n/a"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("04/01/2025", "04/02/2025"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parseLoad([header.replace("Integrated Load", "Load"), ...lines].join("\r\n"), date), /unexpected columns/);
});

test("NYISO forecast parser rejects missing hours, wrong zones and malformed values", () => {
  const header = '"Time Stamp","Capitl","Centrl","Dunwod","Genese","Hud Vl","Longil","Mhk Vl","Millwd","N.Y.C.","North","West","NYISO"';
  const row = (hour, nyc = 4537) => '"04/01/2025 ' + String(hour).padStart(2, "0") + ':00",1,2,3,4,5,6,7,8,' + nyc + ",10,11,12";
  const lines = Array.from({ length: 24 }, (_, hour) => row(hour));
  const parse = (records, columns = header) => parseForecast([columns, ...records].join("\r\n"), date);
  assert.deepEqual(parse(lines), Array(24).fill(4537));
  assert.throws(() => parse(lines.slice(1)), /missing/);
  assert.throws(() => parse([...lines, row(5)]), /repeats/);
  assert.throws(() => parse([row(0, "n/a"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([row(0, "45.5"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0].replace("00:00", "00:15"), ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse([lines[0] + ",99", ...lines.slice(1)]), /invalid/);
  assert.throws(() => parse(lines, header.replace('"N.Y.C."', '"Long Is"')), /unexpected columns/);
  assert.throws(() => parse(lines, header.replace('"N.Y.C.","North"', '"North","N.Y.C."')), /unexpected columns/);
});

test("bootstrap and permutation are deterministic for a fixed seed", () => {
  const { days } = evaluate(series());
  assert.deepEqual(bootstrap(days, 3, { draws: 500 }), bootstrap(days, 3, { draws: 500 }));
  assert.notDeepEqual(bootstrap(days, 3, { draws: 500, seed: 1 }), bootstrap(days, 3, { draws: 500, seed: 2 }));
  assert.deepEqual(permutation(days, { draws: 200 }), permutation(days, { draws: 200 }));
  assert.notDeepEqual(permutation(days, { draws: 200, seed: 1 }), permutation(days, { draws: 200, seed: 2 }));
  // The observed figure the permutations are compared with is the imbalance cost itself.
  assert.equal(permutation(days, { draws: 10 }).observed, imbalance(days).total);
});

test("the bundled NYISO data reproduces the figures quoted in STUDY.md", () => {
  require("./data/study-data.js");
  const data = globalThis.marketStudyData;
  assert.equal(data.sourceHash, "1b793b15035d484a22e134360b5f7d5377f5fcce8571fef0dc7273feab15ec8e");
  assert.equal(data.calibration.length, 89);
  assert.equal(data.evaluation.length, 274);
  const { days, summary, highLoadHours } = evaluate(data, 5);
  const [forecast, fixed, calibrated, highLoad] = summary;
  const meanUse = days.reduce((sum, item) => sum + item.rows.reduce((hourSum, row) => hourSum + row.used, 0), 0) / (274 * 24);
  assert.ok(meanUse > 70 && meanUse < 130, "mean buyer load should be about 87 MWh");
  assert.equal(Math.round(meanUse * 10), 866);
  assert.equal(forecast.total, 3391994602);
  assert.equal(fixed.total - forecast.total, -5245220);
  assert.equal(calibrated.total - forecast.total, -3239050);
  assert.equal(highLoad.total - forecast.total, -9302660);
  assert.deepEqual([fixed.lowerCostDays, fixed.higherCostDays], [72, 125]);
  assert.deepEqual([highLoad.lowerCostDays, highLoad.higherCostDays], [44, 73]);
  assert.equal(highLoadHours, 976);
  const fixedInterval = bootstrap(days, 1);
  assert.ok(fixedInterval.low < 0 && fixedInterval.high > 0, "the fixed rule's 95% interval should include zero");
  const highLoadInterval = bootstrap(days, 3);
  assert.deepEqual([highLoadInterval.low, highLoadInterval.high], [-25452940, 1091720]);
  const totals = imbalance(days);
  assert.equal(totals.total, 18289963);
  assert.equal(totals.dayAheadCost + totals.total, forecast.total);
  assert.equal(totals.underForecast, 15124264);
  assert.deepEqual(totals.worstDay, { date: "2025-06-24", cost: 4685362 });
  assert.equal(totals.correlation.toFixed(2), "0.11");
  assert.equal(totals.rankCorrelation.toFixed(2), "0.25");
  const baseline = permutation(days);
  assert.deepEqual([baseline.observed, baseline.low, baseline.high, baseline.shareAtLeastObserved], [18289963, -3490821, 5300425, 0]);
  assert.equal(Math.round(baseline.mean), 891695);
});
