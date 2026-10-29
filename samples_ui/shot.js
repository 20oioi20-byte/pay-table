const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:1200, height:800 }, deviceScaleFactor:1.5 });
for (const n of ['s1','s2','s3']) { await p.goto('file://' + __dirname + '/' + n + '.html'); await p.screenshot({ path: __dirname + '/' + n + '.png', fullPage:true }); }
await b.close(); })();
