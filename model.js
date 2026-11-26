"use strict";

const PowerDesk = (() => {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const expectedInputs = [
    ["schedule", "Day-ahead schedule", false],
    ["usage", "Metered usage", false],
    ["dayAhead", "Day-ahead price", true],
    ["realTime", "Real-time price", true],
  ];

  // Demo volumes are whole MWh. Prices and every resulting amount use integer cents.
  function ledger(day, baseline) {
    const issues = [];
    const rows = hours.map(hour => {
      const inputs = {};
      for (const [field, label, signed] of expectedInputs) {
        const entries = day[field].filter(entry => entry.hour === hour);
        const value = entries[0]?.value;
        const reason = entries.length === 0 ? "Missing"
          : entries.length > 1 ? "Duplicate"
          : !Number.isSafeInteger(value) || (!signed && value < 0) ? "Invalid" : null;
        if (reason) issues.push({ hour, field, label, reason, values: entries.map(entry => entry.value) });
        inputs[field] = reason ? null : value;
      }
      if (Object.values(inputs).includes(null)) return { hour, ...inputs, cost: null };
      return { hour, ...inputs, ...calculate(inputs, baseline?.[hour]) };
    });
    const total = issues.length ? null : rows.reduce((sum, row) => sum + row.cost, 0);
    const drivers = total === null || !baseline ? null
      : rows.reduce((sums, row) => sums.map((sum, index) => sum + row.drivers[index]), [0, 0, 0, 0]);
    return { rows, issues, total, drivers };
  }

  function calculate({ schedule, usage, dayAhead, realTime }, baseline) {
    const deviation = usage - schedule;
    const dayAheadCost = schedule * dayAhead;
    const balancingCost = deviation * realTime;
    const cost = dayAheadCost + balancingCost;
    if (!baseline) return { deviation, dayAheadCost, balancingCost, cost };
    // Swap price first, then quantity, in each of the two cost components.
    const drivers = [
      baseline.schedule * (dayAhead - baseline.dayAhead),
      (schedule - baseline.schedule) * dayAhead,
      baseline.deviation * (realTime - baseline.realTime),
      (deviation - baseline.deviation) * realTime,
    ];
    return { deviation, dayAheadCost, balancingCost, cost, drivers };
  }

  function createReview(scenario, baseline) {
    let inputs = structuredClone(scenario.inputs);
    const events = [];
    let reviewer = "";
    return {
      snapshot() {
        return { ...ledger(inputs, baseline), reviewer, events: events.slice() };
      },
      repair(hour, field) {
        const replacement = scenario.repairs.find(item => item.hour === hour && item.field === field);
        const issue = ledger(inputs, baseline).issues.find(item => item.hour === hour && item.field === field);
        if (reviewer || !replacement || !issue) return false;
        inputs[field] = inputs[field].filter(entry => entry.hour !== hour);
        inputs[field].push({ hour, value: replacement.value });
        events.push({ type: "repair", ...issue, value: replacement.value, source: replacement.source });
        return true;
      },
      sign(name) {
        const cleanName = name.trim();
        if (reviewer || !cleanName || ledger(inputs, baseline).issues.length) return false;
        reviewer = cleanName;
        events.push({ type: "sign", name: cleanName });
        return true;
      },
      csv() {
        if (!reviewer) return "";
        const header = "hour_et,scheduled_mwh,used_mwh,day_ahead_usd_per_mwh,realtime_usd_per_mwh,day_ahead_usd,balancing_usd,total_usd";
        const lines = ledger(inputs, baseline).rows.map(row =>
          [
            String(row.hour).padStart(2, "0") + ":00", row.schedule, row.usage,
            ...[row.dayAhead, row.realTime, row.dayAheadCost, row.balancingCost, row.cost]
              .map(cents => (cents / 100).toFixed(2)),
          ].join(",")
        );
        return [header, ...lines].join("\r\n") + "\r\n";
      },
    };
  }

  return { ledger, calculate, createReview };
})();

if (typeof module !== "undefined") module.exports = PowerDesk;
