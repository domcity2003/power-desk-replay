"use strict";

const MarketStudy = (() => {
  const { calculate } = typeof module === "undefined" ? PowerDesk : require("./model");
  const policies = ["Forecast only", "Fixed peak buffer", "Calibrated peak buffer", "High-load buffer"];
  const amounts = [0, 5, 10];
  // The simulated buyer takes a fixed 1.5% (15 per mille) slice of New York City zone load.
  // Whole MWh keep every cost in integer cents. Halves round up.
  const sharePerMille = 15;
  const toBuyerMWh = megawatts => Math.floor((megawatts * sharePerMille + 500) / 1000);
  const historyDays = 28;
  const highLoadQuantile = 0.9;
  const peak = hour => hour >= 7 && hour < 23;
  const dayNumber = date => Date.parse(date + "T00:00:00Z") / 86400000;
  const weekday = date => {
    const day = new Date(date + "T00:00:00Z").getUTCDay();
    return day >= 1 && day <= 5;
  };

  function fit(days) {
    const byHour = Array(24).fill(0);
    for (const { date, prices } of days) {
      if (!weekday(date)) continue;
      prices.forEach(([dayAhead, realTime], hour) => { byHour[hour] += realTime - dayAhead; });
    }
    return byHour.map((spread, hour) => peak(hour) && spread > 0 ? 1 : 0);
  }

  // Nearest-rank 90th percentile of the forecast MW in the 28 calendar days before the market
  // date. Only days strictly before the market date can enter, so nothing from the date itself
  // or later can reach the threshold. No history means the rule never fires.
  function highLoadThreshold(days, date) {
    const last = dayNumber(date);
    const values = [];
    for (const day of days) {
      const number = dayNumber(day.date);
      if (number >= last - historyDays && number < last) for (const [, forecast] of day.load) values.push(forecast);
    }
    if (!values.length) return Infinity;
    values.sort((a, b) => a - b);
    return values[Math.ceil(highLoadQuantile * values.length) - 1];
  }

  function runDay({ date, prices, load }, hours, bufferMWh, threshold) {
    const workday = weekday(date);
    const rows = prices.map(([dayAhead, realTime], hour) => {
      const [actualMW, forecastMW] = load[hour];
      const forecast = toBuyerMWh(forecastMW);
      const used = toBuyerMWh(actualMW);
      const highLoad = forecastMW > threshold;
      const scheduled = [
        forecast, forecast + (workday && peak(hour) ? bufferMWh : 0),
        forecast + (workday ? hours[hour] * bufferMWh : 0),
        forecast + (highLoad ? bufferMWh : 0),
      ];
      const costs = scheduled.map(schedule => calculate({ schedule, usage: used, dayAhead, realTime }).cost);
      return { hour, forecast, used, forecastMW, actualMW, highLoad, dayAhead, realTime, scheduled, costs };
    });
    const costs = policies.map((_, index) => rows.reduce((sum, row) => sum + row.costs[index], 0));
    return { date, threshold, rows, costs };
  }

  function summarize(days) {
    const tailCount = Math.ceil(days.length * 0.1);
    return policies.map((policy, index) => {
      const ranked = days.map(day => day.costs[index]).sort((a, b) => b - a);
      const total = ranked.reduce((sum, cost) => sum + cost, 0);
      return {
        policy, total, worst: ranked[0],
        tailMean: ranked.slice(0, tailCount).reduce((sum, cost) => sum + cost, 0) / tailCount,
        lowerCostDays: days.filter(day => day.costs[index] < day.costs[0]).length,
        higherCostDays: days.filter(day => day.costs[index] > day.costs[0]).length,
      };
    });
  }

  function evaluate(data, bufferMWh = 5) {
    if (!amounts.includes(bufferMWh)) throw new Error("Unknown buffer size.");
    const { calibration, evaluation } = data;
    if (!calibration.length || !evaluation.length || calibration.at(-1).date >= evaluation[0].date) {
      throw new Error("Calibration must precede the evaluation period.");
    }
    const hours = fit(calibration);
    const history = [...calibration, ...evaluation];
    const days = evaluation.map(day => runDay(day, hours, bufferMWh, highLoadThreshold(history, day.date)));
    const highLoadHours = days.reduce((sum, day) => sum + day.rows.filter(row => row.highLoad).length, 0);
    return { hours, days, summary: summarize(days), highLoadHours };
  }

  // Seeded linear congruential generator shared by the bootstrap and the permutation test.
  function generator(seed) {
    let state = seed;
    return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  }

  // Moving-block bootstrap of the total change versus forecast only. Seven-day blocks keep
  // weekly and weather-driven runs of price spikes together. The seeded generator makes the
  // interval reproducible.
  function bootstrap(days, index, { draws = 20000, block = 7, seed = 12345 } = {}) {
    const deltas = days.map(day => day.costs[index] - day.costs[0]);
    const n = deltas.length;
    const random = generator(seed);
    const totals = [];
    for (let draw = 0; draw < draws; draw++) {
      let total = 0;
      for (let filled = 0; filled < n;) {
        const start = Math.floor(random() * (n - block + 1));
        for (let step = 0; step < block && filled < n; step++, filled++) total += deltas[start + step];
      }
      totals.push(total);
    }
    totals.sort((a, b) => a - b);
    return {
      low: totals[Math.floor(draws * 0.025)],
      high: totals[Math.floor(draws * 0.975)],
      shareNotSaving: totals.filter(total => total >= 0).length / draws,
    };
  }

  const pearson = (xs, ys) => {
    const n = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  // Average ranks, so ties share a rank.
  const ranks = values => {
    const order = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
    const result = Array(values.length);
    for (let start = 0; start < order.length;) {
      let end = start;
      while (end + 1 < order.length && order[end + 1][0] === order[start][0]) end++;
      for (let k = start; k <= end; k++) result[order[k][1]] = (start + end) / 2;
      start = end + 1;
    }
    return result;
  };

  // Forecast-only cost = sum(used x DA) + sum((used - forecast) x (RT - DA)). The second term is
  // the imbalance cost: what forecast misses cost when real time settles away from day ahead.
  function imbalance(days) {
    let dayAheadCost = 0, total = 0, underForecast = 0, overForecast = 0, underHours = 0, hours = 0, errorSum = 0;
    const errors = [], spreads = [];
    let worstDay = null;
    for (const day of days) {
      let dayTotal = 0;
      for (const row of day.rows) {
        const error = row.used - row.forecast;
        const spread = row.realTime - row.dayAhead;
        dayAheadCost += row.used * row.dayAhead;
        dayTotal += error * spread;
        if (error > 0) { underForecast += error * spread; underHours++; } else overForecast += error * spread;
        errorSum += error;
        errors.push(error);
        spreads.push(spread);
        hours++;
      }
      total += dayTotal;
      if (!worstDay || dayTotal > worstDay.cost) worstDay = { date: day.date, cost: dayTotal };
    }
    return {
      dayAheadCost, total, forecastOnlyCost: dayAheadCost + total,
      underForecast, overForecast, underForecastShare: total ? underForecast / total : 0,
      underForecastHours: underHours, hours, meanError: errorSum / hours,
      correlation: pearson(errors, spreads), rankCorrelation: pearson(ranks(errors), ranks(spreads)),
      worstDay,
    };
  }

  // Permutation baseline: shuffle each hour-of-day's forecast errors across days, keep prices
  // and the error distribution fixed, and recompute the imbalance cost. This is what imbalance
  // would cost if misses were unrelated to which days had price spikes.
  function permutation(days, { draws = 2000, seed = 20250101 } = {}) {
    const n = days.length;
    const errors = Array.from({ length: 24 }, (_, hour) => days.map(day => day.rows[hour].used - day.rows[hour].forecast));
    const spreads = Array.from({ length: 24 }, (_, hour) => days.map(day => day.rows[hour].realTime - day.rows[hour].dayAhead));
    let observed = 0;
    for (let hour = 0; hour < 24; hour++) for (let d = 0; d < n; d++) observed += errors[hour][d] * spreads[hour][d];
    const random = generator(seed);
    const totals = [];
    for (let draw = 0; draw < draws; draw++) {
      let total = 0;
      for (let hour = 0; hour < 24; hour++) {
        const shuffled = errors[hour].slice();
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (let d = 0; d < n; d++) total += shuffled[d] * spreads[hour][d];
      }
      totals.push(total);
    }
    totals.sort((a, b) => a - b);
    return {
      observed, draws,
      mean: totals.reduce((sum, total) => sum + total, 0) / draws,
      low: totals[Math.floor(draws * 0.025)],
      high: totals[Math.floor(draws * 0.975)],
      shareAtLeastObserved: totals.filter(total => total >= observed).length / draws,
    };
  }

  return { policies, amounts, sharePerMille, toBuyerMWh, evaluate, bootstrap, highLoadThreshold, imbalance, permutation };
})();

if (typeof module !== "undefined") module.exports = MarketStudy;
