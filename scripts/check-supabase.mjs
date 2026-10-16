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

async function checkTables() {
  // Try to see if there is a table for companies
  // We'll try to select from a table that might exist
  const tablesToCheck = [
    'cible_companies',
    'cible_entreprises',
    'cible_discovered_companies',
    'cible_catalog_companies'
  ]

  for (const tableName of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('count', { count: 'exact', head: true })
        .limit(0)

      if (!error) {
        console.log(`Table ${tableName} exists. Count:`, data)
      } else {
        // If error is not found, it might be that the table doesn't exist
        if (error.code === '42P01') { // undefined_table
          console.log(`Table ${tableName} does not exist.`)
        } else {
          console.log(`Error checking table ${tableName}:`, error.message)
        }
      }
    } catch (err) {
      console.log(`Exception checking table ${tableName}:`, err.message)
    }
  }

  // Also check the existing tables we know
  const knownTables = ['cible_catalog_offers', 'cible_catalog_import_batches', 'cible_candidatures']
  for (const tableName of knownTables) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('count', { count: 'exact', head: true })
        .limit(0)

      if (!error) {
        console.log(`Table ${tableName} exists. Count:`, data)
      } else {
        console.log(`Error checking table ${tableName}:`, error.message)
      }
    } catch (err) {
      console.log(`Exception checking table ${tableName}:`, err.message)
    }
  }
}

checkTables().catch(console.error)