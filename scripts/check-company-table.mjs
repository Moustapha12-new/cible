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

async function checkCompanyTable() {
  const tableName = 'cible_companies'

  try {
    // Get count
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`Error counting table ${tableName}:`, error.message)
      return
    }

    console.log(`Response:`, { data, error, count })
    console.log(`Table ${tableName} has ${count} rows.`)

    // If there are rows, get a sample
    if (count > 0) {
      const { data: sampleData, error: sampleError } = await supabase
        .from(tableName)
        .select('*')
        .limit(5)

      if (sampleError) {
        console.log(`Error fetching data from ${tableName}:`, sampleError.message)
      } else {
        console.log(`Sample data from ${tableName}:`, JSON.stringify(sampleData, null, 2))
      }
    }
  } catch (err) {
    console.log(`Exception:`, err.message)
  }
}

checkCompanyTable().catch(console.error)