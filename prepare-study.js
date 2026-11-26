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

function parseZone(csv, date, feed) {
  const [columns, ...lines] = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const scope = feed + " " + date;
  // NYISO's price exports have fixed columns and use quotes around some fields.
  if (columns.replaceAll('"', "") !== header) throw new Error(scope + " has unexpected columns.");
  const [year, month, day] = date.split("-");
  const expectedPrefix = month + "/" + day + "/" + year + " ";
  const prices = Array(24).fill(null);
  for (const line of lines) {
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

function build(root) {
  const hash = createHash("sha256");
  const data = { calibration: [], evaluation: [], excluded };
  for (const date of daysIn2025) {
    if (excluded.includes(date)) continue;
    const prices = feeds.map(feed => {
      const file = date.replaceAll("-", "") + feed + "_zone.csv";
      const csv = readFileSync(join(root, feed, file));
      hash.update(file);
      hash.update(csv);
      return parseZone(csv.toString("utf8"), date, feed);
    });
    const period = date < "2025-04-01" ? data.calibration : data.evaluation;
    period.push({ date, prices: prices[0].map((price, hour) => [price, prices[1][hour]]) });
  }
  data.sourceHash = hash.digest("hex");
  return data;
}

if (require.main === module) {
  const root = join(__dirname, ".local-study");
  const data = build(root);
  writeFileSync(join(root, "study-data.js"), "globalThis.marketStudyData = " + JSON.stringify(data) + ";\n");
  console.log("Prepared " + data.calibration.length + " calibration days and " + data.evaluation.length + " evaluation days.");
  console.log("Source SHA-256: " + data.sourceHash);
}

module.exports = { build, parseZone };
