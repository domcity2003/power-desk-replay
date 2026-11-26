# Power Desk Replay build plan

## The reviewer’s job

Review an hourly energy-cost estimate for a fictional power buyer. Explain what changed versus a normal day, investigate an extreme hour, and decide whether to sign off. The DRW trade operations posting calls for daily variance review, discrepancy resolution, and testing system changes. Those are the three tasks this demo should make observable. [DRW role](https://job-boards.greenhouse.io/drweng/jobs/8333973)

## Build order and review gates

1. **Cost ledger.** Calculate day-ahead cost and the cost or credit for the real-time difference. Hand-check a shortfall, a surplus, and a negative price. Calculate four drivers of the change against a baseline. Every driver must tie to the ledger.
2. **Exception workflow.** Use one comparison day, one cold-weather scenario, and a copy of that scenario with a missing price and a duplicate schedule. Hold the total and sign-off when an input is ambiguous. Apply explicitly labeled demo replacements one at a time, record each correction, and require a named reviewer to sign off.
3. **Browser review.** Put the decision, price chart, hourly inputs, and event history on one page. A reviewer should be able to trace a price spike, sign off, and export the ledger without credentials or a live data connection.
4. **Release review.** Run model tests against hand-calculated values. Open the app in a browser from an isolated copy. Check the normal, cold, and broken scenarios, both repairs, the sign-off gate, and the CSV. Check the mobile layout and reread the README against the build.

## Data and first-release limits

The bundle uses fictional prices and volumes. Winter Storm Fern motivates the cold-weather case. Its numbers do not come from that event. PJM's Data Miner limits redistribution of its data and derived information. Grid Status identifies the separate day-ahead and real-time hourly feeds, which are a candidate source for a future authorized historical replay. [PJM cold-weather review](https://insidelines.pjm.com/pjm-reviews-january-cold-weather-operations/) · [PJM data terms](https://www.pjm.com/markets-and-operations/etools/data-miner-2) · [Grid Status PJM implementation](https://github.com/gridstatus/gridstatus/blob/12dea4c68ebe6a037e846afb076a1685da820f47/gridstatus/pjm.py)

The first release models one 24-hour market day at a single hub using hourly energy prices. PJM real-time settlement uses five-minute intervals and bills other components. A scheduling comparison belongs in a later release, with rules fixed before evaluation on held-out days. [PJM settlement manual](https://www.pjm.com/-/media/DotCom/documents/manuals/m28.ashx)

## Release check · November 26, 2026

- Five model tests passed. These include the hand-worked shortfall, surplus and negative-price cases, the cost breakdown, and repairing the two errors in either order.
- An isolated copy passed the Edge walkthrough. The cold-snap estimate was $142,119, up $58,556 from the normal day. The broken scenario stayed on hold after one correction and returned to $142,119 after both. The downloaded CSV contained 24 hourly rows that summed to that total.
- Checked the desktop and 390-pixel mobile layouts, separate review state for each scenario, and focus when drilling into an hour. Sign-off and the correction history last for the browser session. The CSV contains the hourly inputs and costs.
