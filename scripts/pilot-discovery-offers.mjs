/* Jalon 2 : recherche réelle dans les annonces publiques des ATS.
   Le rapport ne contient que les fiches détaillées effectivement lues. */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'
import { discoverSmartRecruiters } from '../src/lib/discovery-offers.ts'

dotenv.config({ path: '.env.local', quiet: true })
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || new URL(url).hostname !== 'ucgetwemaxigkblzvndo.supabase.co') throw new Error('Projet Supabase attendu indisponible')
const supabase = createClient(url, key)
const { data: companies, error } = await supabase.from('cible_decouvertes_entreprises')
  .select('siren,name,commune,naf,score,website,website_status,career_page')
  .order('score', { ascending: false }).limit(199)
if (error) throw error
const picks = []
const seenSiren = new Set()
for (const naf of ['27.12Z', '35.11Z', '35.13Z', '27.20Z', '43.21A', '71.12B']) {
  for (const row of (companies || []).filter(c => c.naf === naf).slice(0, naf === '71.12B' ? 10 : 3)) {
    if (!seenSiren.has(row.siren)) { picks.push(row); seenSiren.add(row.siren) }
  }
}
for (const row of companies || []) {
  if (picks.length >= 25) break
  if (!seenSiren.has(row.siren)) { picks.push(row); seenSiren.add(row.siren) }
}
/* ATS publiquement documenté. Les slugs sont vérifiés par la réponse API,
   et ne sont jamais déduits d'un nom d'entreprise dans le registre. */
const slugs = ['Ingrop', 'RTE1', 'EgisGroup', 'ENERTRAG', 'Statkraft1', 'Socotec', 'Talan']
const result = await discoverSmartRecruiters(slugs, fetch, 55)
const report = {
  generatedAt: new Date().toISOString(),
  source: 'https://developers.smartrecruiters.com/docs/endpoints',
  companyRegistryCount: companies?.length || 0,
  companySample: picks,
  atsCompanies: slugs,
  listingRowsExamined: result.examined,
  detailPagesChecked: result.detailChecked,
  offersVerified: result.offers.length,
  sixMonthsConfirmed: result.offers.filter(o => o.sixMonthsConfirmed).length,
  profileCompatible: result.offers.filter(o => o.profileCompatible).length,
  offers: result.offers,
  failures: result.failures,
  note: 'Les entreprises du registre et les recherches ATS sont deux voies distinctes. Aucun lien SIREN/ATS n’est affirmé sans preuve.'
}
mkdirSync(join(process.cwd(), 'scratch'), { recursive: true })
writeFileSync(join(process.cwd(), 'scratch', 'pilot-discovery-offers-report.json'), JSON.stringify(report, null, 2))
if (result.offers.length) {
  const objectUrl = `${url}/storage/v1/object/${process.env.SUPABASE_BUCKET || 'cible-private'}/gmail/discovery:offers:v1`
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const prior = await fetch(objectUrl, { headers, cache: 'no-store' })
  if (prior.ok) {
    const old = await prior.json().catch(() => null)
    if (!old || !Array.isArray(old.offers)) throw new Error('Registre existant illisible : écriture refusée')
    report.offers = [...new Map([...old.offers.filter(o => !slugs.includes(o.sourceCompany)), ...report.offers].map(o => [o.id, o])).values()]
  } else {
    const body = await prior.json().catch(() => ({}))
    if (!/object not found/i.test(String(body.message || ''))) throw new Error(`Lecture du registre impossible : HTTP ${prior.status}`)
  }
  const saved = await fetch(objectUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(report) })
  if (!saved.ok) throw new Error(`Sauvegarde du registre impossible : HTTP ${saved.status}`)
  const verify = await fetch(objectUrl, { headers, cache: 'no-store' })
  const restored = verify.ok ? await verify.json() : null
  if (!restored || restored.offers?.length !== report.offers.length) throw new Error('Lecture de contrôle du registre échouée')
  console.log(`Persistance vérifiée par relecture : ${restored.offers.length} offres`)
}
console.log(JSON.stringify({companyRegistryCount: report.companyRegistryCount, companySample: picks.map(c => `${c.siren} ${c.name}`), listingRowsExamined: report.listingRowsExamined, detailPagesChecked: report.detailPagesChecked, offersVerified: report.offersVerified, sixMonthsConfirmed: report.sixMonthsConfirmed, profileCompatible: report.profileCompatible, offers: report.offers.filter(o => o.profileCompatible).slice(0, 15).map(o => ({title:o.title,company:o.company,sourceUrl:o.sourceUrl,applicationUrl:o.applicationUrl,start:o.startEvidence,duration:o.durationEvidence})), failures: report.failures.length}, null, 2))
