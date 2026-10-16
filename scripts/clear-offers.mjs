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

async function main() {
  // First, count the offers
  let countBefore = 0
  try {
    const { count, error } = await supabase
      .from('cible_catalog_offers')
      .select('*', { count: 'exact', head: true })
    if (error) {
      throw error
    }
    countBefore = count ?? 0
    console.log(`Number of offers before deletion: ${countBefore}`)
  } catch (err) {
    console.error(`Error counting offers:`, err.message)
    // We'll try to delete anyway
  }

  // Now delete all offers
  try {
    const { data, error } = await supabase
      .from('cible_catalog_offers')
      .delete()
      .neq('id', '0') // This is a hack: we assume no id is exactly '0'. We'll delete all rows where id is not '0', which should be all rows.
    if (error) {
      throw error
    }
    console.log(`Delete result:`, data)
  } catch (err) {
    console.error(`Error deleting offers:`, err.message)
  }

  // Count again to confirm
  let countAfter = 0
  try {
    const { count, error } = await supabase
      .from('cible_catalog_offers')
      .select('*', { count: 'exact', head: true })
    if (error) {
      throw error
    }
    countAfter = count ?? 0
    console.log(`Number of offers after deletion: ${countAfter}`)
  } catch (err) {
    console.error(`Error counting offers after deletion:`, err.message)
  }
}

main().catch(console.error)