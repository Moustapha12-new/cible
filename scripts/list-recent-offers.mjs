import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function listOffers() {
  try {
    const { data, error } = await supabase
      .from('cible_catalog_offers')
      .select('id, title, company, domain_text, location_text')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error(`Error listing offers:`, error.message)
      return
    }

    console.log('Recent offers:')
    data.forEach(offer => {
      console.log(`- ${offer.title} at ${offer.company} (${offer.location_text}) - Domain: ${offer.domain_text}`)
    })
  } catch (err) {
    console.error(`Exception:`, err.message)
  }
}

listOffers()