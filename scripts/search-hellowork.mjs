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

// Function to delay for a specified number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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

  for (const keyword of keywords) {
    console.log(`\nSearching for keyword: ${keyword}`)
    // Construct the search URL
    // Parameters: lc=FR (country), ll=Paris (location), t=stage (contract type), k=keyword
    // We'll also set the distance to 50km? Not sure.
    const url = `${baseUrl}${searchPath}?lc=FR&ll=Paris&t=stage&k=${encodeURIComponent(keyword)}`
    console.log(`  URL: ${url}`)

    let html
    try {
      html = await fetchHTML(url)
      await sleep(2000) // Be respectful
    } catch (error) {
      console.log(`  Failed to fetch search results: ${error.message}`)
      continue
    }

    const $ = load(html)

    // HelloWork job listings are in elements with class "jtl-row" or similar.
    // Let's inspect the structure: we look for elements that contain job data.
    // We'll look for each job card.
    const jobCards = $('li.w2ui-job, article.c-jobListing, div.js-result, div.result') // These are guesses
    // If none, we'll try a more generic approach: look for elements with a data-href or class containing job
    let cards = []
    if (jobCards.length > 0) {
      cards = jobCards
    } else {
      // Fallback: look for elements that have a link to an offer
      cards = $('a[href*="/offre/"]').parent() // Get parent of each offer link
    }

    console.log(`  Found ${cards.length} potential job cards`)

    cards.each((_, cardElement) => {
      const $card = $(cardElement)
      // Extract the link to the offer
      const linkElement = $card.find('a[href*="/offre/"]').first()
      const href = linkElement.attr('href')
      if (!href) return
      let offerUrl
      try {
        offerUrl = new URL(href, baseUrl).href
      } catch (e) {
        return
      }

      // Extract title
      let title = ''
      const titleElement = $card.find('h2, h3, .js-jobTitle, .title').first()
      if (titleElement.length > 0) {
        title = getText(titleElement)
      } else {
        // Fallback to the link text
        title = getText(linkElement)
      }

      // Extract company
      let company = ''
      const companyElement = $card.find('.js-employerName, .company, .employer').first()
      if (companyElement.length > 0) {
        company = getText(companyElement)
      }

      // Extract location
      let location = ''
      const locationElement = $card.find('.js-jobLocation, .location').first()
      if (locationElement.length > 0) {
        location = getText(locationElement)
      }

      // Extract contract type and duration from the card text
      const cardText = getText($card)
      const lowerCardText = cardText.toLowerCase()

      // Check if it's an internship
      const isInternship = isInternshipRelated(cardText) || isInternshipRelated(title)
      if (!isInternship) {
        return
      }

      // Extract duration
      let durationInMonths = extractDurationInMonths(cardText)
      let durationText = ''
      if (durationInMonths !== null) {
        durationText = `${durationInMonths} mois`
      } else {
        // Try to find any mention of duration
        const durationMatch = lowerCardText.match(/(\d+)\s*(mois|semaines|année|années|months?|weeks?|years?)/)
        if (durationMatch) {
          durationText = durationMatch[0]
        }
      }

      // Extract domain: we'll check if the text matches our target domains
      const domainMatches = matchesTargetDomain(cardText) || matchesTargetDomain(title)
      let domain = domainMatches ? 'Pertinent' : 'Non spécifié'

      // Now we have a potential offer, we need to check if it's a valid internship offer
      // We'll consider it valid if:
      //   - It is internship-related
      //   - The domain matches our target domains (or we couldn't determine but we'll still consider it)
      //   - We have a title and an offer URL
      if (isInternship && (domainMatches || domain === 'Non spécifié') && title && offerUrl) {
        // Generate an ID for the offer
        // Try to extract an ID from the URL (e.g., the numeric part)
        const urlIdMatch = offerUrl.match(/\/offre\/(\d+)/)
        let identifier = ''
        if (urlIdMatch) {
          identifier = urlIdMatch[1]
        } else {
          // Fallback to a hash of the title, company, and URL
          const crypto = require('crypto')
          const hash = crypto.createHash('md5').update(`${title}-${company}-${offerUrl}`).digest('hex')
          identifier = hash
        }
        const offerId = generateOfferId(`hellowork-${identifier}`, '')

        // Check if we already have this offer in the database (by id for this user)
        supabase
          .from('cible_catalog_offers')
          .select('id')
          .eq('user_id', userId)
          .eq('id', offerId)
          .single()
          .then(({ data: existing, error: checkError }) => {
            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
              console.error(`    Error checking for existing offer:`, checkError.message)
              return
            }
            if (existing) {
              // Offer already exists, skip
              console.log(`    - Offer already exists: ${title}`)
              return
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
              // We'll set the source_payload to something minimal
              source_payload: { source: 'hellowork', url: offerUrl },
              // We'll try to extract a qualification if possible, but we'll leave it as null for now
              qualification: null,
              application_id: null,
              dossier_id: null,
              archived: false,
              first_detected_at: new Date().toISOString(),
              last_detected_at: new Date().toISOString(),
              published_at: new Date().toISOString() // We don't have the published date, so we use now
            }

            // Insert the offer into the database
            supabase
              .from('cible_catalog_offers')
              .insert([offerRecord])
              .then(({ data, error }) => {
                if (error) {
                  console.error(`    Error inserting offer:`, error.message)
                } else {
                  console.log(`    ✓ Inserted offer: ${title}`)
                  offerCount++
                }
              })
              .catch((err) => {
                console.error(`    Exception inserting offer:`, err.message)
              })
          })
      }
    })

    // Delay between keywords to be respectful
    await sleep(3000)
  }

  console.log(`\nFinished processing. Inserted ${offerCount} new offers from HelloWork.`)
}

main().catch(console.error)