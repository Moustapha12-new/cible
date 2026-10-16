import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import puppeteer from 'puppeteer'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Function to delay for a specified number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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

async function scrapeHelloWork() {
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

  // Keywords to search for
  const keywords = [
    'génie électrique',
    'électrotechnique',
    'bureau d\'études électriques',
    'HTA',
    'BT',
    'CFO',
    'CFA',
    'dimensionnement',
    'énergie renouvelable',
    'photovoltaïque',
    'stockage d\'énergie',
    'performance énergétique',
    'automatisation industrielle'
  ]

  // We'll search on HelloWork
  const baseUrl = 'https://www.hellowork.com'
  const searchPath = '/fr-fr/emploi/recherche.html'

  let offerCount = 0

  // Launch puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()
  // Set user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')

  for (const keyword of keywords) {
    console.log(`\nSearching for keyword: ${keyword}`)
    // Construct the search URL
    // Parameters: lc=FR (country), ll=Paris (location), t=stage (contract type), k=keyword
    const url = `${baseUrl}${searchPath}?lc=FR&ll=Paris&t=stage&k=${encodeURIComponent(keyword)}`
    console.log(`  URL: ${url}`)

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      // Wait for job listings to appear
      // We'll try to wait for a selector that is common for job cards
      // Let's try to wait for any element with a href containing "/offre/"
      await page.waitForSelector('a[href*="/offre/"]', { timeout: 10000 })
      // Now extract the job cards
      // We'll get all offer links and then go up to find the card
      const jobData = await page.evaluate(() => {
        const offers = []
        // Find all links that point to an offer
        const linkElements = document.querySelectorAll('a[href*="/offre/"]')
        linkElements.forEach(linkElement => {
          // Try to find the job card container
          // We'll go up until we find an element that likely contains the job data
          let card = linkElement.parentElement
          // Go up up to 5 times
          for (let i = 0; i < 5; i++) {
            if (!card) break
            // Check if this element looks like a job card: it should have some text and maybe a company
            // We'll just use the card as is and extract text from it
            card = card.parentElement
          }
          // If we didn't find a card, we'll use the linkElement's parent as the card
          if (!card) {
            card = linkElement.parentElement
          }
          // Extract text from the card
          const cardText = card.innerText
          // Extract title from the link text or from a heading inside the card
          let title = linkElement.innerText.trim()
          // If the title is too short, look for a heading inside the card
          if (title.length < 5) {
            const heading = card.querySelector('h1, h2, h3, h4, h5, h6')
            if (heading) {
              title = heading.innerText.trim()
            }
          }
          // Extract company: look for an element that might contain the company name
          let company = ''
          // Common selectors for company name
          const companySelectors = [
            '.company',
            '.employer',
            '.job-company',
            '[data-cy="jobCompany"]',
            '.jtl-company'
          ]
          for (const selector of companySelectors) {
            const el = card.querySelector(selector)
            if (el) {
              company = el.innerText.trim()
              break
            }
          }
          // If still not found, look for any element that contains the word "entreprise" or "société"
          if (!company) {
            const allText = card.innerText
            // Simple heuristic: look for a line that might be the company
            // We'll skip for now
          }
          // Extract location
          let location = ''
          const locationSelectors = [
            '.location',
            '.job-location',
            '[data-cy="jobLocation"]',
            '.jtl-location'
          ]
          for (const selector of locationSelectors) {
            const el = card.querySelector(selector)
            if (el) {
              location = el.innerText.trim()
              break
            }
          }
          // Extract contract type and duration from the card text
          const lowerCardText = cardText.toLowerCase()
          // Check if it's an internship
          const isInternship = lowerCardText.includes('stage') || lowerCardText.includes('intern') || lowerCardText.includes('alternance') || lowerCardText.includes('apprentissage')
          // Extract duration
          let durationInMonths = null
          const moisMatch = lowerCardText.match(/(\d+)\s*mois/)
          if (moisMatch) {
            durationInMonths = parseInt(moisMatch[1])
          } else {
            const semainesMatch = lowerCardText.match(/(\d+)\s*semaines/)
            if (semainesMatch) {
              const weeks = parseInt(semainesMatch[1])
              durationInMonths = weeks * 12 / 52
            } else if (lowerCardText.includes('an') || lowerCardText.includes('year')) {
              durationInMonths = 12
            }
          }
          // Extract domain: we'll check if the text matches our target domains
          const targetKeywords = [
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
          let domainMatches = false
          for (const keyword of targetKeywords) {
            if (lowerCardText.includes(keyword.toLowerCase())) {
              domainMatches = true
              break
            }
          }
          const domain = domainMatches ? 'Pertinent' : 'Non spécifié'
          // Only add if we have a title and it's an internship
          if (title && isInternship) {
            offers.push({
              title,
              company,
              location,
              domain,
              isInternship,
              durationInMonths,
              cardText: cardText.substring(0, 200) // For debugging
            })
          }
        })
        return offers
      })

      console.log(`  Found ${jobData.length} potential job cards`)

      // Process each job
      for (const job of jobData) {
        const { title, company, location, domain, isInternship, durationInMonths, cardText } = job
        // Generate an ID for the offer
        // We need a unique identifier; we can use a hash of the title, company, and URL
        // But we don't have the URL here. We'll use the title and company.
        const crypto = require('crypto')
        const hash = crypto.createHash('md5').update(`${title}-${company}-${keyword}`).digest('hex')
        const offerId = generateOfferId(`hellowork-${hash}`, '')

        // Check if we already have this offer in the database (by id for this user)
        const { data: existing, error: checkError } = await supabase
          .from('cible_catalog_offers')
          .select('id')
          .eq('user_id', userId)
          .eq('id', offerId)
          .single()

        if (checkError && checkError.code !== 'PGRST116') {
          console.error(`    Error checking for existing offer:`, checkError.message)
          continue
        }
        if (existing) {
          // Offer already exists, skip
          console.log(`    - Offer already exists: ${title}`)
          continue
        }

        // Prepare the offer record
        const offerRecord = {
          user_id: userId,
          id: offerId,
          title: title,
          company: company,
          location_text: location,
          domain_text: domain,
          search_text: `${title} ${company} ${location} ${domain}`,
          source_types: ['hellowork'],
          version: 1,
          source_payload: { source: 'hellowork', keyword },
          qualification: null,
          application_id: null,
          dossier_id: null,
          archived: false,
          first_detected_at: new Date().toISOString(),
          last_detected_at: new Date().toISOString(),
          published_at: new Date().toISOString()
        }

        // Insert the offer into the database
        const { data, error } = await supabase
          .from('cible_catalog_offers')
          .insert([offerRecord])

        if (error) {
          console.error(`    Error inserting offer:`, error.message)
        } else {
          console.log(`    ✓ Inserted offer: ${title}`)
          offerCount++
        }
      }

    } catch (error) {
      console.error(`  Error processing keyword ${keyword}:`, error.message)
    }

    // Delay between keywords to be respectful
    await sleep(3000)
  }

  await browser.close()
  console.log(`\nFinished processing. Inserted ${offerCount} new offers from HelloWork.`)
}

scrapeHelloWork().catch(console.error)