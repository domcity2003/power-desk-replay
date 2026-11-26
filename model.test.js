"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculate, ledger, createReview } = require("./model.js");
const [normal, cold, broken] = require("./scenarios.js");
const baseline = ledger(normal.inputs);

test("buy 100 MWh at $40 and cover a 10 MWh shortfall at $200", () => {
  assert.deepEqual(calculate({ schedule: 100, usage: 110, dayAhead: 4000, realTime: 20000 }), {
    deviation: 10, dayAheadCost: 400000, balancingCost: 200000, cost: 600000,
  });
});

test("a surplus earns a credit at a positive price and costs money at a negative price", () => {
  assert.equal(calculate({ schedule: 100, usage: 90, dayAhead: 4000, realTime: 1500 }).cost, 385000);
  assert.equal(calculate({ schedule: 100, usage: 90, dayAhead: 4000, realTime: -1500 }).cost, 415000);
});

test("the cold snap passes input review and preserves the $480/MWh spike", () => {
  const result = ledger(cold.inputs, baseline.rows);
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows[18].realTime, 48000);
  assert.equal(result.rows[18].cost, 1833600);
  assert.equal(result.rows.reduce((sum, row) => sum + row.cost, 0), result.total);
  assert.deepEqual(result.rows[18].drivers, [320000, 57600, 425000, 576000]);
  for (const row of result.rows) {
    assert.equal(row.drivers.reduce((a, b) => a + b, 0), row.cost - baseline.rows[row.hour].cost);
  }
  assert.equal(result.drivers.reduce((a, b) => a + b, 0), result.total - baseline.total);
});

test("a negative volume is invalid, and a zero or negative price is valid", () => {
  const day = structuredClone(normal.inputs);
  day.schedule[0].value = -1;
  day.dayAhead[0].value = 0;
  day.realTime[0].value = -1500;
  const result = ledger(day);
  assert.deepEqual(result.issues.map(issue => [issue.hour, issue.field, issue.reason]), [[0, "schedule", "Invalid"]]);
  assert.equal(result.total, null);
});

test("two issues hold the total until both are repaired and review requires a name", () => {
  for (const repairs of [[broken.repairs[0], broken.repairs[1]], [broken.repairs[1], broken.repairs[0]]]) {
    const review = createReview(broken, baseline.rows);
    const held = review.snapshot();
    assert.deepEqual(held.issues.map(issue => issue.reason), ["Duplicate", "Missing"]);
    assert.equal(held.total, null);
    assert.equal(held.drivers, null);
    assert.equal(held.rows[17].cost, null);
    assert.equal(held.rows[18].cost, null);
    assert.equal(review.sign("Analyst"), false);
    assert.equal(review.csv(), "");
    assert.equal(review.repair(repairs[0].hour, repairs[0].field), true);
    assert.equal(review.repair(repairs[0].hour, repairs[0].field), false);
    assert.equal(review.snapshot().total, null);
    assert.equal(review.sign("Analyst"), false);
    assert.equal(review.repair(repairs[1].hour, repairs[1].field), true);
    assert.deepEqual(review.snapshot().rows, ledger(cold.inputs, baseline.rows).rows);
    assert.equal(review.sign("  "), false);
    assert.equal(review.csv(), "");
    assert.equal(review.sign(" Analyst "), true);
    assert.equal(review.sign("Other analyst"), false);
    assert.equal(review.snapshot().reviewer, "Analyst");
    assert.deepEqual(review.snapshot().events.map(event => event.type), ["repair", "repair", "sign"]);
    const lines = review.csv().trim().split("\r\n");
    assert.equal(lines.length, 25);
    assert.equal(lines[19], "18:00,108,130,72.00,480.00,7776.00,10560.00,18336.00");
    assert.equal(lines.slice(1).reduce((sum, line) => sum + Math.round(Number(line.split(",").at(-1)) * 100), 0), review.snapshot().total);
  }
  assert.equal(ledger(broken.inputs).total, null);
});
