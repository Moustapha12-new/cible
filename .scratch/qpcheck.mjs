// Quick check: does the QP decoder turn =C3=89 into É?
import { readFileSync } from "node:fs";
// Compile just mime-text via tsc is heavy; replicate minimal QP decode:
const qp = "ing=C3=A9nier =C3=89tudes";
const bytes = Buffer.from(qp, "latin1");
// naive QP decode
let out=[]; for(let i=0;i<bytes.length;i++){ if(bytes[i]===0x3d && i+2<bytes.length){ out.push(parseInt(bytes.slice(i+1,i+3).toString(),16)); i+=2;} else out.push(bytes[i]);}
console.log("decoded:", Buffer.from(out).toString("utf8"));
