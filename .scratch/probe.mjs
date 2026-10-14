import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// decode eml via python helper writing html files
for (const n of ["indeed","linkedin","hellowork"]) {
  
}
const $hw = cheerio.load(readFileSync(".scratch/hellowork.html","utf8"));
// HelloWork card anchor -> closest table -> lines
let count=0;
$hw('a[href*="/clic/"]').each((i,el)=>{
  const href=$hw(el).attr('href')||'';
  const title=$hw(el).text().replace(/\s+/g,' ').trim();
  if(!title) return;
  count++;
  if(count<=3){
    const tbl=$hw(el).closest('table');
    const lines=tbl.text().split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
    console.log('HW card', count, 'title=',title.slice(0,40));
    console.log('  closest-table-lines:', JSON.stringify(tbl.text().replace(/\s+/g,'|').slice(0,200)));
    // try next siblings text
    const after = $hw(el).parent().nextAll().text().replace(/\s+/g,' ').trim();
    console.log('  after-parent:', after.slice(0,120));
  }
});
console.log('HW total card anchors with title:', count);

const $li = cheerio.load(readFileSync(".scratch/linkedin.html","utf8"));
console.log('LI h1 links:', $li('h1 a[href*="/jobs/view/"]').length);
console.log('LI total /jobs/view/ links:', $li('a[href*="/jobs/view/"]').length);
