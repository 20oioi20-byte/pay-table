const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:1200, height:800 }, deviceScaleFactor:1.5 });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
for (const v of ['a','b','c']) { await p.goto('file://' + __dirname + '/view.html?v=' + v); await p.waitForTimeout(200); await p.screenshot({ path: __dirname + `/sub_${v}.png`, fullPage:true }); }
console.log(errs); await b.close(); })();
