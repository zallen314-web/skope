// Refreshes the Fama-French factor data bundled in index.html (FF_EMBED) from the Kenneth R. French
// Data Library. Run weekly by .github/workflows/factors.yml; only rewrites the page when newer data exists.
//   daily series from 2010, monthly from 1990, same layout the site already parses (values in percent)
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const SETS = {
  ff3d: ['F-F_Research_Data_Factors_daily', 8], ff5d: ['F-F_Research_Data_5_Factors_2x3_daily', 8], momd: ['F-F_Momentum_Factor_daily', 8],
  ff3m: ['F-F_Research_Data_Factors', 6], ff5m: ['F-F_Research_Data_5_Factors_2x3', 6], momm: ['F-F_Momentum_Factor', 6],
};
const FROM = { 8: '20100101', 6: '199001' };

async function series(name, digits) {
  const r = await fetch(`https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/${name}_CSV.zip`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const txt = strFromU8(Object.values(unzipSync(new Uint8Array(await r.arrayBuffer())))[0]);
  const rows = [];
  for (const raw of txt.split(/\r?\n/)) {
    const pts = raw.split(',').map(s => s.trim());
    if (pts[0].length !== digits || !/^\d+$/.test(pts[0])) continue;   // skips headers and the annual block (4-digit years)
    if (pts[0] < FROM[digits] || pts.slice(1).some(v => v === '' || !isFinite(+v) || +v <= -99.99)) continue;
    rows.push(pts.join(','));
  }
  // keep the first block only: monthly files repeat dates? (they don't, but guard against duplicates)
  return [...new Map(rows.map(l => [l.split(',')[0], l])).values()];
}

const file = new URL('../index.html', import.meta.url);
let html = readFileSync(file, 'utf8');
const curAsof = html.match(/const FF_EMBED_ASOF='(\d{8})';/)[1];
const fresh = {};
for (const [k, [name, digits]] of Object.entries(SETS)) fresh[k] = await series(name, digits);

// the new data must cover at least what the page already has, for every series
const asof = ['ff3d', 'ff5d', 'momd'].map(k => fresh[k][fresh[k].length - 1].split(',')[0]).sort()[0];
const monthEnd = ['ff3m', 'ff5m', 'momm'].map(k => fresh[k][fresh[k].length - 1].split(',')[0]).sort()[0];
for (const k of Object.keys(SETS)) {
  const cur = html.match(new RegExp(`${k}:\`([^\`]*)\``))[1].trim().split('\n');
  if (fresh[k].length < cur.length) throw new Error(`${k}: fewer rows than the current page (${fresh[k].length} < ${cur.length})`);
}
console.log(`French data: daily through ${asof}, monthly through ${monthEnd} (page has ${curAsof})`);
if (asof <= curAsof) { console.log('No newer factor data; nothing to update.'); process.exit(0); }

for (const k of Object.keys(SETS)) {
  // trim every series to the common end date so daily and monthly stay in step
  const end = k.endsWith('d') ? asof : asof.slice(0, 6);
  const body = fresh[k].filter(l => l.split(',')[0] <= end).join('\n');
  html = html.replace(new RegExp(`${k}:\`[^\`]*\``), () => `${k}:\`${body}\``);
}
html = html.replace(/const FF_EMBED_ASOF='\d{8}';/, `const FF_EMBED_ASOF='${asof}';`);
writeFileSync(file, html);
console.log(`Updated factor data in index.html: ${curAsof} → ${asof}`);
