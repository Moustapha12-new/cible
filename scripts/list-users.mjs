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

async function listUsers() {
  try {
    const { data, error } = await supabase
      .from('cible_user_data')
      .select('user_id, data, version, updated_at')

    if (error) {
      console.error(`Error listing users:`, error.message)
      return
    }

    console.log('Users:')
    console.log(JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(`Exception:`, err.message)
  }
}

listUsers()