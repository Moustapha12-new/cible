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

// Function to generate a safe ID for the offer
const generateOfferId = (source, identifier) => {
  // Use source and identifier to create an ID
  const base = `${source}-${identifier}`
  // Ensure it's within 500 characters
  return base.substring(0, Math.min(base.length, 500))
}

async function testCompany(companyName, website) {
  console.log(`\nTesting company: ${companyName} (${website})`)
  let html
  try {
    html = await fetchHTML(website)
    await sleep(1000)
  } catch (error) {
    console.log(`  Failed to fetch ${website}: ${error.message}`)
    return
  }

  const $ = load(html)

  // Look for JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]')
  console.log(`  Found ${jsonLdScripts.length} JSON-LD scripts`)
  jsonLdScripts.each((_, script) => {
    const content = $(script).html()
    try {
      const data = JSON.parse(content)
      // Check if it's a JobPosting
      if (data["@type"] === "JobPosting" || (Array.isArray(data["@type"]) && data["@type"].includes("JobPosting"))) {
        console.log(`    Found JobPosting JSON-LD:`)
        console.log(`      Title: ${data.title}`)
        console.log(`      Company: ${data.hiringOrganization?.name}`)
        console.log(`      Location: ${data.jobLocation?.address?.addressLocality}`)
        console.log(`      DatePosted: ${data.datePosted}`)
        console.log(`      EmploymentType: ${data.employmentType}`)
        console.log(`      Description: ${data.description?.substring(0, 100)}`)
      } else if (data["@type"] === "ItemList") {
        // Might be a list of job postings
        if (data.itemListElement) {
          console.log(`    Found ItemList with ${data.itemListElement.length} items`)
          data.itemListElement.forEach((item, index) => {
            if (item["@type"] === "JobPosting") {
              console.log(`      Item ${index}:`)
              console.log(`        Title: ${item.title}`)
              console.log(`        Company: ${item.hiringOrganization?.name}`)
            }
          })
        }
      }
    } catch (e) {
      // Not JSON, ignore
    }
  })

  // Also look for internship keywords in the text
  const bodyText = getText($('body'))
  if (isInternshipRelated(bodyText)) {
    console.log(`  Body contains internship-related keywords`)
  }
  // Check domain matching
  const domainMatches = matchesTargetDomain(bodyText)
  console.log(`  Domain matches target: ${domainMatches}`)
}

async function main() {
  // Get the first user from the database (we'll use this user for storing offers)
  const { data: usersData, error: usersError } = await supabase
    .from('cible_user_data')
    .select('user_id')
    .limit(1)

  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }

  if (!usersData || usersData.length === 0) {
    console.error('No users found in the database')
    return
  }

  const userId = usersData[0].user_id
  console.log(`Using user ID: ${userId}`)

  // Fetch all companies from the database
  const { data: companiesData, error: companiesError } = await supabase
    .from('cible_decouvertes_entreprises')
    .select('*')

  if (companiesError) {
    console.error('Error fetching companies:', companiesError)
    return
  }

  console.log(`Found ${companiesData.length} companies`)

  // Test a few companies that have a website
  const testCompanies = companiesData.filter(c => c.website).slice(0, 5)
  for (const company of testCompanies) {
    await testCompany(company.name, company.website)
    await sleep(2000)
  }
}

main().catch(console.error)