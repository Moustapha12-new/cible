/* Recalcule la qualité des 199 entreprises déjà découvertes, sans appel à
   Recherche d'entreprises. Les SIREN et données administratives sont préservés. */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import dotenv from 'dotenv'
import { DEPARTMENT_ROTATION, NAF_FAMILIES, TRANCHE_LABELS, scoreCompanyForProfile } from '../src/lib/discovery.ts'

dotenv.config({ path: '.env.local', quiet: true })
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || new URL(url).hostname !== 'ucgetwemaxigkblzvndo.supabase.co') throw new Error('Projet Supabase inattendu')
const db = createClient(url, key)
const { data: rows, error } = await db.from('cible_decouvertes_entreprises').select('*').limit(500)
if (error) throw error

const domains = {
  '489626135': { status: 'confirmed', url: 'https://carrieres.ingerop.com', career: 'https://carrieres.ingerop.com', proof: 'Mentions légales du site carrière : raison sociale et RCS 489626135', proofUrl: 'https://carrieres.ingerop.com/politique-de-confidentialite' },
  '909073363': { status: 'confirmed', url: 'https://www.engie-vianeo.com', proof: 'Politique de confidentialité : ENGIE MOBILITES ELECTRIQUES, RCS 909073363', proofUrl: 'https://www.engie-vianeo.com/en/personal-data-app/' },
  '799222823': { status: 'probable', url: 'https://erese.fr', proof: 'Site ERESE : nom commercial et activité concordants, SIREN non trouvé sur le site', proofUrl: 'https://erese.fr/' },
  '442090163': { status: 'probable', url: 'https://www.wpd.fr', proof: 'Document wpd.fr : nom wpd onshore France et adresse concordante, SIREN non trouvé', proofUrl: 'https://www.wpd.fr/wp-content/uploads/2020/01/20190624_Lettre_d_information.pdf' },
}
const results = []
for (const row of rows || []) {
  const family = NAF_FAMILIES.find(x => x.code === row.naf)
  const tranche = TRANCHE_LABELS[row.tranche]
  const domain = domains[row.siren]
  const websiteStatus = domain?.status || row.website_status
  const size = tranche?.size || 'inconnue'
  const nafTier = family?.tier || 'hors cible'
  const region = DEPARTMENT_ROTATION.find(x => x.code === row.departement)?.region
  const scored = scoreCompanyForProfile({ naf: row.naf, nafTier, size, name: row.name, commune: row.commune, website: domain?.url || row.website, websiteStatus }, 'Île-de-France', region)
  const reasons = domain ? [...scored.reasons, `${domain.proof} (${domain.proofUrl})`] : scored.reasons
  const update = { naf_tier: nafTier, naf_label: family?.label || row.naf_label, tranche_label: tranche?.label || row.tranche_label, size, website_status: websiteStatus, website: domain?.url || row.website, career_page: domain?.career || row.career_page, score: scored.score, reasons, missing: scored.missing, last_checked_at: new Date().toISOString() }
  const { error: writeError } = await db.from('cible_decouvertes_entreprises').update(update).eq('siren', row.siren)
  if (writeError) throw new Error(`Échec ${row.siren}: ${writeError.code || writeError.message}`)
  results.push({ siren: row.siren, name: row.name, naf: row.naf, nafTier, tranche: row.tranche, size, score: scored.score, website: update.website, websiteStatus, careerPage: update.career_page, domainProof: domain?.proofUrl || null })
}
const { count, error: countError } = await db.from('cible_decouvertes_entreprises').select('siren', { head: true, count: 'exact' })
if (countError || count !== rows?.length) throw new Error('Relecture de contrôle du registre échouée')
writeFileSync('scratch/discovery-company-quality-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), count, examinedSample: results.filter(x => ['489626135','909073363','799222823','442090163'].includes(x.siren)), all: results }, null, 2))
console.log(JSON.stringify({ registryCount: count, corrected: results.length, confirmed: results.filter(x => x.websiteStatus === 'confirmed').length, probable: results.filter(x => x.websiteStatus === 'probable').length, naf7112b: results.filter(x => x.naf === '71.12B').length, tranche32: results.filter(x => x.tranche === '32').map(x => ({ siren: x.siren, size: x.size })), verifiedDomains: results.filter(x => x.domainProof).map(x => ({ siren: x.siren, status: x.websiteStatus, proof: x.domainProof })) }, null, 2))
