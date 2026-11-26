"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { evaluate, bootstrap } = require("./study-model");
const { parseZone } = require("./prepare-study");

const date = "2025-04-01";
const day = (date, dayAhead, realTime) => ({
  date, prices: Array.from({ length: 24 }, () => [dayAhead, realTime]),
});
const calibration = [day("2025-01-02", 100, 200)];
const evaluation = [day(date, 400, 100), day("2025-04-05", -500, -600)];

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
  assert.equal(zero.summary[1].total, zero.summary[0].total);
  assert.equal(zero.summary[1].higherCostDays, 0);
});

test("NYISO parser rejects missing, duplicate, off-hour and wrong-zone records", () => {
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

test("the bundled NYISO data reproduces the figures quoted in STUDY.md", () => {
  require("./data/study-data.js");
  const data = globalThis.marketStudyData;
  assert.equal(data.sourceHash, "ae7b6ce7f20fa64a3c3e3f68d575b9aa86fe1d13de5f638338125116a1a06447");
  assert.equal(data.calibration.length, 89);
  assert.equal(data.evaluation.length, 274);
  const { days, summary } = evaluate(data, 5);
  const [forecast, fixed, calibrated] = summary;
  assert.equal(forecast.total, 3484171637);
  assert.equal(fixed.total - forecast.total, -5245220);
  assert.equal(calibrated.total - forecast.total, -3239050);
  assert.deepEqual([fixed.lowerCostDays, fixed.higherCostDays], [72, 125]);
  const interval = bootstrap(days, 1);
  assert.ok(interval.low < 0 && interval.high > 0, "the 95% interval should include zero");
});
