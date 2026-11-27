"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const daysIn2025 = Array.from({ length: 365 }, (_, offset) =>
  new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10)
);
const excluded = ["2025-03-09", "2025-11-02"];
const feeds = ["damlbmp", "rtlbmp"];
const header = "Time Stamp,Name,PTID,LBMP ($/MWHr),Marginal Cost Losses ($/MWHr),Marginal Cost Congestion ($/MWHr)";
const loadHeader = "Time Stamp,Time Zone,Name,PTID,Integrated Load";
const forecastHeader = "Time Stamp,Capitl,Centrl,Dunwod,Genese,Hud Vl,Longil,Mhk Vl,Millwd,N.Y.C.,North,West,NYISO";
const nycColumn = forecastHeader.split(",").indexOf("N.Y.C.");

const dayBefore = date => new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
// Market day D uses the forecast file issued on D-1.
const forecastFile = date => dayBefore(date).replaceAll("-", "") + "isolf.csv";
const lines = (csv, expected, scope) => {
  const [columns, ...rest] = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
  // NYISO's exports have fixed columns and use quotes around some fields.
  if (columns.replaceAll('"', "") !== expected) throw new Error(scope + " has unexpected columns.");
  return rest;
};
const prefix = date => { const [year, month, day] = date.split("-"); return month + "/" + day + "/" + year + " "; };

function parseZone(csv, date, feed) {
  const scope = feed + " " + date;
  const expectedPrefix = prefix(date);
  const prices = Array(24).fill(null);
  for (const line of lines(csv, header, scope)) {
    const [timestamp, name, ptid, price] = line.replaceAll('"', "").split(",");
    if (ptid !== "61761" && name !== "N.Y.C.") continue;
    const hour = Number(timestamp.slice(11, 13));
    if (ptid !== "61761" || name !== "N.Y.C." || !timestamp.startsWith(expectedPrefix) ||
        !/^(?:[01]\d|2[0-3]):00$/.test(timestamp.slice(11)) || !/^-?\d{1,6}\.\d{2}$/.test(price)) {
      throw new Error(scope + " has an invalid NYC observation.");
    }
    if (prices[hour] !== null) throw new Error(scope + " repeats hour " + hour + ".");
    prices[hour] = Number(price.replace(".", ""));
  }
  if (prices.includes(null)) throw new Error(scope + " is missing NYC hours.");
  return prices;
}

// Integrated real-time actual load (MW) for N.Y.C., one row per zone per hour. Whole MW are kept.
function parseLoad(csv, date) {
  const scope = "palIntegrated " + date;
  const expectedPrefix = prefix(date);
  const load = Array(24).fill(null);
  for (const line of lines(csv, loadHeader, scope)) {
    const [timestamp, zone, name, ptid, value] = line.replaceAll('"', "").split(",");
    if (ptid !== "61761" && name !== "N.Y.C.") continue;
    const hour = Number(timestamp.slice(11, 13));
    if (ptid !== "61761" || name !== "N.Y.C." || !/^E[SD]T$/.test(zone) || !timestamp.startsWith(expectedPrefix) ||
        !/^(?:[01]\d|2[0-3]):00:00$/.test(timestamp.slice(11)) || !/^\d{1,6}(?:\.\d{1,4})?$/.test(value)) {
      throw new Error(scope + " has an invalid NYC observation.");
    }
    if (load[hour] !== null) throw new Error(scope + " repeats hour " + hour + ".");
    load[hour] = Math.round(Number(value));
  }
  if (load.includes(null)) throw new Error(scope + " is missing NYC hours.");
  return load;
}

// A daily NYISO load-forecast file holds hourly forecasts for several days by zone. Return
// the N.Y.C. column (whole MW) for the requested market date. The caller passes the file
// issued on the previous day.
function parseForecast(csv, date) {
  const scope = "isolf for " + date;
  const expectedPrefix = prefix(date);
  const forecast = Array(24).fill(null);
  for (const line of lines(csv, forecastHeader, scope)) {
    const cells = line.replaceAll('"', "").split(",");
    const timestamp = cells[0];
    if (cells.length !== forecastHeader.split(",").length || !/^\d\d\/\d\d\/\d{4} (?:[01]\d|2[0-3]):00$/.test(timestamp) ||
        !/^\d{1,6}$/.test(cells[nycColumn])) {
      throw new Error(scope + " has an invalid forecast row.");
    }
    if (!timestamp.startsWith(expectedPrefix)) continue;
    const hour = Number(timestamp.slice(11, 13));
    if (forecast[hour] !== null) throw new Error(scope + " repeats hour " + hour + ".");
    forecast[hour] = Number(cells[nycColumn]);
  }
  if (forecast.includes(null)) throw new Error(scope + " is missing NYC hours.");
  return forecast;
}

function build(root) {
  const hash = createHash("sha256");
  const data = { calibration: [], evaluation: [], excluded };
  const read = (feed, file) => {
    const csv = readFileSync(join(root, feed, file));
    hash.update(file);
    hash.update(csv);
    return csv.toString("utf8");
  };
  for (const date of daysIn2025) {
    if (excluded.includes(date)) continue;
    const stamp = date.replaceAll("-", "");
    const prices = feeds.map(feed => parseZone(read(feed, stamp + feed + "_zone.csv"), date, feed));
    const actual = parseLoad(read("palIntegrated", stamp + "palIntegrated.csv"), date);
    const forecast = parseForecast(read("isolf", forecastFile(date)), date);
    const period = date < "2025-04-01" ? data.calibration : data.evaluation;
    period.push({
      date,
      prices: prices[0].map((price, hour) => [price, prices[1][hour]]),
      load: actual.map((mw, hour) => [mw, forecast[hour]]),
    });
  }
  data.sourceHash = hash.digest("hex");
  return data;
}

if (require.main === module) {
  const root = join(__dirname, ".local-study");
  const data = build(root);
  writeFileSync(join(__dirname, "data", "study-data.js"), "globalThis.marketStudyData = " + JSON.stringify(data) + ";\n");
  console.log("Prepared " + data.calibration.length + " calibration days and " + data.evaluation.length + " evaluation days.");
  console.log("Source SHA-256: " + data.sourceHash);
}

module.exports = { build, parseZone, parseLoad, parseForecast, forecastFile };
