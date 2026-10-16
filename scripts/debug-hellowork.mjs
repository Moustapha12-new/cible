import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { load } from 'cheerio'
import { writeFileSync } from 'node:fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Function to fetch a URL and return the HTML text
const fetchHTML = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`)
  }
}

async function main() {
  const keyword = 'génie électrique'
  const baseUrl = 'https://www.hellowork.com'
  const searchPath = '/fr-fr/emploi/recherche.html'
  const url = `${baseUrl}${searchPath}?lc=FR&ll=Paris&t=stage&k=${encodeURIComponent(keyword)}`
  console.log(`Fetching: ${url}`)
  const html = await fetchHTML(url)
  console.log('HTML length:', html.length)
  // Save to a file for inspection
  writeFileSync('./scratch/hellowork-sample.html', html)
  console.log('Saved to scratch/hellowork-sample.html')
  // Also output first 2000 chars
  console.log('First 2000 chars:')
  console.log(html.substring(0, 2000))
}

main().catch(console.error)