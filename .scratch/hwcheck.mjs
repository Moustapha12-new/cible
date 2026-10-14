import { readFileSync } from "node:fs";
// reuse compiled? simpler: quick reimplementation check via dynamic ts is heavy.
// Instead print expected TCL vs a direct cheerio extraction.
import * as cheerio from "cheerio";
const T=s=>s.replace(/\s+/g,' ').trim();
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const $=cheerio.load(readFileSync('.scratch/hellowork.html','utf8'));
const exp=JSON.parse(readFileSync('docs/freebuff/fixtures/attendus_offres.json','utf8')).expected.hellowork;
const expKeys=exp.map(e=>`${norm(e.title)}|${norm(e.company)}|${norm(e.location)}`);
const got=[];
$('a[href*="/clic/"]').each((i,el)=>{
  const title=T($(el).text()); if(!title) return;
  const cells=$(el).closest('table').find('td').map((j,t)=>T($(t).text())).get().filter(Boolean);
  let company='',location='';
  for(const c of cells){
    if(!company && c!==title && !/\d{2,3}|Stage|Voir|Alternance/i.test(c) && c.length>2) company=c;
    const m=c.match(/([A-Za-zÀ-ÿ'’.\- ]+?)\s*-\s*(\d{2,3})\b/);
    if(!location && m) location=T(m[1]);
  }
  got.push(`${norm(title)}|${norm(company)}|${norm(location)}`);
});
const gotSet=new Set(got);
console.log('EXTRACTED TCL:');
for(const g of [...new Set(got)]) console.log('  ',g, expKeys.includes(g)?'OK':'<< MISSING-IN-EXPECTED');
console.log('EXPECTED not found:');
for(const k of expKeys) if(!gotSet.has(k)) console.log('  ',k);
