import { resolvePeriod } from "../src/lib/period";
import { getCreatorMetrics, getNonSellers } from "../src/lib/analytics/creators";
import { classifyCreators, classifyNonSellers } from "../src/lib/analytics/classify";
import { getThresholds, getOwnAccounts } from "../src/lib/analytics/settings";
import { kpisFor, getSourceMix } from "../src/lib/analytics/overview";
import { sql } from "../src/db";

async function main() {
  const range = process.argv[2] ?? "28d";
  const period = await resolvePeriod({ range });
  console.log("period", period.label, period.start, period.end, "prev", period.prevStart, period.prevEnd);
  const own = await getOwnAccounts();
  console.log("own accounts", own);
  const k = await kpisFor(period.start, period.end, own);
  console.log("kpis", k);
  const t = await getThresholds();
  const { rows, snapshots } = await getCreatorMetrics(period);
  console.log("snapshots", Object.fromEntries(Object.entries(snapshots).map(([k, v]) => [k, v && `${v.start}..${v.end} cov ${v.coverage.toFixed(2)}`])));
  const { classified, ctx } = classifyCreators(rows, t, period);
  console.log("ctx", ctx);
  const by = new Map<string, { n: number; gmv: number; uplift: number }>();
  for (const c of classified) {
    const k2 = c.segment ?? "long tail";
    const e = by.get(k2) ?? { n: 0, gmv: 0, uplift: 0 };
    e.n++; e.gmv += c.gmv; e.uplift += c.uplift;
    by.set(k2, e);
  }
  console.table([...by].map(([k2, v]) => ({ segment: k2, creators: v.n, gmv: Math.round(v.gmv), uplift: Math.round(v.uplift) })));
  const up = classified.filter((c) => c.segment === "underposting").sort((a, b) => b.uplift - a.uplift).slice(0, 6);
  console.table(up.map((c) => ({ u: c.username, gmv: Math.round(c.gmv), vpw: c.vpw?.toFixed(2), posted: c.videosPosted, sv: c.sellingVideos, uplift: Math.round(c.uplift), flags: c.flags.join() })));
  const ns = classifyNonSellers(...Object.values(await getNonSellers(period, new Set(rows.map((r) => r.username)))) as [any, any], t);
  console.log("non-sellers", ns.length, ns.slice(0, 3));
  const mix = await getSourceMix(period);
  console.log(mix.hasShopData, mix.totals, "aff share", mix.affiliateShare.toFixed(3), mix.trend.length);
  await sql.end();
}
main();
