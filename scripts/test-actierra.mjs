import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { load } from 'cheerio'

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

// Function to extract text content from a Cheerio element, cleaning up whitespace
const getText = ($elem) => {
  return $elem.text().trim().replace(/\s+/g, ' ')
}

// Function to check if a string contains internship-related keywords
const isInternshipRelated = (text) => {
  const lowerText = text.toLowerCase()
  return (
    lowerText.includes('stage') ||
    lowerText.includes('intern') ||
    lowerText.includes('alternance') ||
    lowerText.includes('apprentissage')
  )
}

// Function to extract duration from text (e.g., "6 mois", "12 weeks")
// Returns the number of months if we can determine, otherwise null
const extractDurationInMonths = (text) => {
  const lowerText = text.toLowerCase()
  // Look for patterns like "6 mois", "six mois", "12 semaines"
  const moisMatch = lowerText.match(/(\d+)\s*mois/)
  if (moisMatch) {
    return parseInt(moisMatch[1])
  }
  const semainesMatch = lowerText.match(/(\d+)\s*semaines/)
  if (semainesMatch) {
    const weeks = parseInt(semainesMatch[1])
    // Convert weeks to months: weeks * 12 / 52 (approx)
    return weeks * 12 / 52
  }
  // Look for "un an" or "1 an"
  if (lowerText.includes('an') || lowerText.includes('year')) {
    return 12
  }
  return null
}

// Function to check if the text matches our target domains
const matchesTargetDomain = (text) => {
  const lowerText = text.toLowerCase()
  const keywords = [
    'génie électrique',
    'électrotechnique',
    'bureau d\'études électriques',
    'hta',
    'bt',
    'cfo',
    'cfa',
    'dimensionnement',
    'énergie',
    'renouvelables',
    'photovoltaïque',
    'stockage',
    'énergie',
    'performance énergétique',
    'automatisation industrielle',
    'automatisation'
  ]
  return keywords.some(keyword => lowerText.includes(keyword))
}

async function main() {
  const url = 'https://actierra.fr'
  console.log(`Fetching ${url}`)
  let html
  try {
    html = await fetchHTML(url)
    console.log(`HTML length: ${html.length}`)
  } catch (error) {
    console.error(`Failed to fetch ${url}: ${error.message}`)
    return
  }

  const $ = load(html)

  // Look for JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]')
  console.log(`Found ${jsonLdScripts.length} JSON-LD scripts`)
  jsonLdScripts.each((_, script) => {
    const content = $(script).html()
    try {
      const data = JSON.parse(content)
      console.log('Parsed JSON-LD:', JSON.stringify(data, null, 2))
    } catch (e) {
      // Not JSON, ignore
    }
  })

  // Also look for internship keywords in the text
  const bodyText = getText($('body'))
  if (isInternshipRelated(bodyText)) {
    console.log('Body contains internship-related keywords')
  } else {
    console.log('Body does NOT contain internship-related keywords')
  }
  // Check domain matching
  const domainMatches = matchesTargetDomain(bodyText)
  console.log(`Domain matches target: ${domainMatches}`)
}

main().catch(console.error)