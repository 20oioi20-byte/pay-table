const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
await p.route('**/xlsx.full.min.js', r => r.fulfill({ body:'' }));
await p.goto('file://' + __dirname + '/../stats_prototype.html'); await p.waitForTimeout(300);
const d = await p.evaluate(() => { const pr = scoped(['cls']), one = rs => { const c = agg(yearOf(rs, 2026)), q = agg(yearOf(rs, 2025)); return { n:c.n, heads:c.heads, cur:Math.round(c.avg*12/10000), prev:Math.round(q.avg*12/10000), base:Math.round(c.base*12/10000), fixed:Math.round(c.fixed*12/10000), perf:Math.round(c.perf*12/10000) }; };
 return { all:one(pr), inds:IND.map(i => ({ name:i, ...one(pr.filter(r => r.ind === i)), subs:Object.keys(TREE[i].subs).map(s => ({ name:s, ...one(pr.filter(r => r.sub === s)) })) })) }; });
require('fs').writeFileSync(__dirname + '/data.json', JSON.stringify(d)); await b.close(); })();
