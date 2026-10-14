const Q = '"';
const qpOffer = `<a href=${Q}https://fr.indeed.com/viewjob?jk=1a2cb258a85268e1${Q}>Stage Assistant ing=C3=A9nier =C3=89tudes H/F</a>`;
const qpSecond = `<a href=${Q}https://fr.indeed.com/viewjob?jk=8bbcbc3ae0364f0c${Q}>Stage Hydraulique=</a>`;
const emlQP = [
  'From: alerts@indeed.example.invalid',
  'Subject: Alertes stages',
  'MIME-Version: 1.0',
  `Content-Type: multipart/alternative; boundary="BOUND"`,
  '',
  '--BOUND',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: 7bit',
  '',
  'Fixture UTF-8.',
  '--BOUND',
  'Content-Type: text/html; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  `<html><body>${qpOffer}${qpSecond}</body></html>`,
  '--BOUND--',
  '',
].join('\r\n');
import { writeFileSync } from 'node:fs';
writeFileSync('.scratch/qp.eml', emlQP, 'utf8');
console.log('written');
