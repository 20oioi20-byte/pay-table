const { chromium } = require('playwright'); const XLSX_PATH = __dirname + '/../../stats_test.xlsx';
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:1228, height:900 }, deviceScaleFactor:1.5, acceptDownloads:true });
await p.route('**/xlsx.full.min.js', r => r.fulfill({ path: process.argv[3] }));
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + __dirname + '/stats_prototype.html'); await p.waitForTimeout(800);
await p.screenshot({ path: __dirname + '/s4_stats.png', fullPage:true });
await p.click('#dim button[data-d="reg"]'); await p.screenshot({ path: __dirname + '/s4_stats_region.png', fullPage:true });
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xls')]); await dl.saveAs(process.argv[2]);
console.log('errors', errs); await b.close(); })();
