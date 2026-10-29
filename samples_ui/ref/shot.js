const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1.25 });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
for (const n of ['design_a','design_b','design_c']) { await p.goto('file://' + __dirname + '/' + n + '.html'); await p.waitForTimeout(300); await p.screenshot({ path: __dirname + '/' + n + '.png', fullPage:true }); }
console.log(errs); await b.close(); })();
