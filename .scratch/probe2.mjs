import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";
const T = s => s.replace(/\s+/g,' ').trim();

// ── HelloWork: td cells per card ──
const $hw = cheerio.load(readFileSync(".scratch/hellowork.html","utf8"));
$hw('a[href*="/clic/"]').each((i,el)=>{
  const title=T($hw(el).text()); if(!title) return;
  const tds=$hw(el).closest('table').find('td').map((j,t)=>T($hw(t).text())).get().filter(Boolean);
  if(i<3) console.log('HW td['+i+']:', JSON.stringify(tds.slice(0,5)));
});

// ── Indeed: card structure around jk links ──
const $in = cheerio.load(readFileSync(".scratch/indeed.html","utf8"));
console.log('\nINDEED anchors with jk:', $in('a[href*="jk="]').length);
$in('a[href*="jk="]').each((i,el)=>{
  if(i>=2) return;
  const h=$in(el).attr('href');
  const blk=$in(el).closest('td, div');
  const lines=blk.text().split('\n').map(T).filter(Boolean);
  console.log('INDEED['+i+'] href=',h.slice(0,60));
  console.log('   blockText:', JSON.stringify(blk.text().replace(/\s+/g,'|').slice(0,160)));
});

// ── LinkedIn: identify recommendation card container, exclude h1 ──
const $li = cheerio.load(readFileSync(".scratch/linkedin.html","utf8"));
const ids=new Set();
$li('a[href*="/jobs/view/"]').each((i,el)=>{
  const m=($li(el).attr('href')||'').match(/\/jobs\/view\/(\d+)/);
  if(m) ids.add(m[1]);
});
console.log('\nLINKEDIN unique jobIds (all):', ids.size, [...ids].join(','));
// which is in h1
const h1id=$li('h1 a[href*="/jobs/view/"]').attr('href').match(/\/jobs\/view\/(\d+)/)[1];
console.log('LINKEDIN h1 (context) jobId:', h1id);
console.log('LINKEDIN card jobIds (excl h1):', ids.size-1);
