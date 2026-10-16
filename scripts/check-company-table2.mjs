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
    // Try to select one row
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (error) {
      console.log(`Error selecting from table ${tableName}:`, error.message)
      // Check if it's because the table doesn't exist
      if (error.code === '42P01') {
        console.log('This error indicates the table does not exist.')
      }
      return
    }

    console.log(`Successfully selected from ${tableName}. Data:`, JSON.stringify(data, null, 2))
  } catch (err) {
    console.log(`Exception:`, err.message)
  }
}

checkCompanyTable().catch(console.error)