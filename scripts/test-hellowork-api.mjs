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

// Function to fetch JSON from a URL
const fetchJSON = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`)
  }
}

async function main() {
  const keyword = 'génie électrique'
  const baseUrl = 'https://www.hellowork.com'
  // Try the search endpoint
  const url = `${baseUrl}/fr-fr/searchoffers/search?lc=FR&ll=Paris&t=stage&k=${encodeURIComponent(keyword)}`
  console.log(`Trying: ${url}`)
  try {
    const data = await fetchJSON(url)
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error(error.message)
    // Try another endpoint
    const url2 = `${baseUrl}/fr-fr/offres/recherche?lc=FR&ll=Paris&t=stage&k=${encodeURIComponent(keyword)}`
    console.log(`Trying: ${url2}`)
    try {
      const data2 = await fetchJSON(url2)
      console.log('Response2:', JSON.stringify(data2, null, 2))
    } catch (error2) {
      console.error(error2.message)
    }
  }
}

main().catch(console.error)