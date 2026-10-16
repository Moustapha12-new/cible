/* Lecture des URL déjà extraites du catalogue Gmail, sans requête Gmail ni
   sortie du contenu des messages. Compte l'identité forte SmartRecruiters. */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
const account = process.argv[2]
if (!account || !/^[^@]+@[^@]+$/.test(account)) throw new Error('Compte requis en argument')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const base = process.env.SUPABASE_URL
if (!key || !base || new URL(base).hostname !== 'ucgetwemaxigkblzvndo.supabase.co') throw new Error('Projet inattendu')
const objectUrl = `${base}/storage/v1/object/${process.env.SUPABASE_BUCKET}/gmail/gmail:snapshot:${account.toLowerCase()}`
const response = await fetch(objectUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
if (!response.ok) {
  const body = await response.json().catch(() => ({}))
  if (/object not found/i.test(String(body.message || ''))) {
    console.log(JSON.stringify({ savedGmailOffers: null, strongIdentityDuplicates: null, reason: 'Aucun catalogue sauvegardé pour ce compte ; nombre de doublons inconnu.' }))
    process.exit(0)
  }
  throw new Error(`Catalogue d'offres Gmail indisponible : HTTP ${response.status}`)
}
let raw = await response.text()
if (raw.startsWith('gzip:v1:')) raw = gunzipSync(Buffer.from(raw.slice('gzip:v1:'.length), 'base64')).toString('utf8')
const snapshot = JSON.parse(raw)
const gmailOffers = snapshot.emails?.flatMap(item => item.offers || []) || []
const webOffers = JSON.parse(readFileSync('scratch/pilot-discovery-offers-report.json', 'utf8')).offers.filter(item => item.profileCompatible)
const identity = value => {
  try {
    const url = new URL(value)
    if (url.hostname !== 'jobs.smartrecruiters.com') return null
    const [slug, idPart] = url.pathname.split('/').filter(Boolean)
    const id = idPart?.match(/^[0-9]{9,}/)?.[0]
    return slug && id ? `${slug.toLowerCase()}:${id}` : null
  } catch { return null }
}
const gmailIds = new Set(gmailOffers.flatMap(item => [item.applicationUrl, item.sourceUrl].map(identity).filter(Boolean)))
const duplicates = webOffers.filter(item => gmailIds.has(identity(item.applicationUrl))).length
console.log(JSON.stringify({ savedGmailOffers: gmailOffers.length, webCompatible: webOffers.length, strongIdentityDuplicates: duplicates, newStrongIdentities: webOffers.length - duplicates }))
