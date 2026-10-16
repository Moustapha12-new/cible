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

async function countOffers() {
  try {
    const { count, error } = await supabase
      .from('cible_catalog_offers')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error(`Error counting offers:`, error.message)
      return
    }

    console.log(`Number of offers in the database: ${count}`)
  } catch (err) {
    console.error(`Exception:`, err.message)
  }
}

countOffers()