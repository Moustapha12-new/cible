import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { load } from 'cheerio'
import { websiteHypothesis } from '../src/lib/discovery.ts'

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
      timeout: 10000
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
const generateOfferId = (companySir, title) => {
  // Create a slug from the title: lowercase, replace non-alphanumeric with hyphens, trim, limit length
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading and trailing hyphens
    .substring(0, 100) // Limit to 100 characters
  // Use a timestamp to ensure uniqueness
  const timestamp = Date.now()
  // Ensure the total length is within 500 characters
  const id = `${companySir}-${slug}-${timestamp}`
  return id.substring(0, 500) // Just in case, but it should be under 500
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

  // We'll process each company
  let offerCount = 0
  for (const company of companiesData) {
    console.log(`\nProcessing company: ${company.name} (${company.siren})`)

    let baseUrl = null
    // If we have a website in the database that is not null, use it
    if (company.website) {
      baseUrl = company.website
      console.log(`  Using website from database: ${baseUrl}`)
    } else {
      // Otherwise, try to hypothesize a domain
      const hypothesized = websiteHypothesis(company.name)
      if (hypothesized) {
        baseUrl = hypothesized
        console.log(`  Using hypothesized website: ${baseUrl}`)
      } else {
        console.log(`  Could not determine website for ${company.name}`)
        continue
      }
    }

    // Ensure the URL starts with http
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`
    }

    // Fetch the base URL to look for career page links
    let html
    try {
      html = await fetchHTML(baseUrl)
      await sleep(1000) // Be respectful
    } catch (error) {
      console.log(`  Failed to fetch base URL ${baseUrl}: ${error.message}`)
      // We'll still try to look for offers on the base page even if we failed to fetch? No, we need the HTML.
      continue
    }

    const $ = load(html)

    // Find career page links
    const careerLinks = new Set()
    $('a').each((_, element) => {
      const href = $(element).attr('href')
      const text = getText($(element))
      if (!href) return

      // Make the URL absolute
      let absoluteUrl
      try {
        absoluteUrl = new URL(href, baseUrl).href
      } catch (e) {
        // Invalid URL, skip
        return
      }

      const lowerHref = href.toLowerCase()
      const lowerText = text.toLowerCase()
      const careerKeywords = ['carriere', 'recrut', 'emploi', 'job', 'offres', 'stages', 'stage']

      if (careerKeywords.some(keyword => lowerHref.includes(keyword) || lowerText.includes(keyword))) {
        careerLinks.add(absoluteUrl)
      }
    })

    console.log(`  Found ${careerLinks.size} potential career page links`)

    // If we didn't find any career page links, we'll check the base URL for offers
    let pagesToCheck = []
    if (careerLinks.size > 0) {
      pagesToCheck = Array.from(careerLinks).slice(0, 3) // Limit to 3 pages
    } else {
      pagesToCheck = [baseUrl]
    }

    // Check each page for internship offers
    for (const pageUrl of pagesToCheck) {
      console.log(`    Checking page: ${pageUrl}`)
      let pageHtml
      try {
        pageHtml = await fetchHTML(pageUrl)
        await sleep(800) // Be respectful
      } catch (error) {
        console.log(`      Failed to fetch ${pageUrl}: ${error.message}`)
        continue
      }

      const $$ = load(pageHtml)

      // We'll look for elements that might contain job postings.
      // This is a heuristic: look for common job posting patterns.
      // We'll look for elements that contain internship-related keywords and then try to extract structured data.

      // We'll try to find headings or divs that contain the keywords and then look for nearby elements for details.
      const keywordElements = $$('*:contains("stage"), *:contains("intern"), *:contains("alternance"), *:contains("apprentissage")')
      const seenTitles = new Set()

      keywordElements.each((_, element) => {
        const titleText = getText($$(element))
        if (!titleText || seenTitles.has(titleText)) return
        seenTitles.add(titleText)

        // We'll try to get a container element that might hold the full job posting.
        // We'll go up a few levels to find a common parent.
        let container = $$(element)
        for (let i = 0; i < 5; i++) {
          container = container.parent()
          if (!container || container.length === 0) break
          // If the container has a lot of text, it might be a good candidate.
          // We'll break if we find a container that has a reasonable amount of text and some structure.
          // For simplicity, we'll just use the element itself and try to extract details from its siblings and parent.
        }

        // We'll look for the title, location, contract type, duration, and apply link within the container or nearby.
        // This is very simplistic and will likely need to be adjusted per site.
        // We'll just look for the following in the entire page text near the keyword.

        // We'll get a snippet of text around the element (e.g., 500 characters before and after)
        const fullText = $$(element).parent().text() // Just the parent text for simplicity
        const lowerFullText = fullText.toLowerCase()

        // Check if the text contains internship-related keywords (we already know it does from the selector)
        // Extract title: we'll use the element's text or look for a heading nearby
        let title = titleText
        // If the element is not a heading, look for a heading within the container
        const heading = $$(element).closest('h1, h2, h3, h4, h5, h6')
        if (heading.length > 0) {
          title = getText(heading)
        }

        // Extract location: look for words like "Paris", "Lyon", etc. or use the company's commune as fallback
        let location = company.commune // Fallback to company's commune
        // We could try to extract location from the text, but for simplicity we'll use the company's commune

        // Extract contract type: look for the keywords we already have
        let contractType = ''
        if (lowerFullText.includes('stage')) contractType = 'Stage'
        else if (lowerFullText.includes('intern')) contractType = 'Internship'
        else if (lowerFullText.includes('alternance')) contractType = 'Alternance'
        else if (lowerFullText.includes('apprentissage')) contractType = 'Apprentissage'

        // Extract duration: look for a pattern indicating duration
        let durationInMonths = extractDurationInMonths(fullText)
        let durationText = ''
        if (durationInMonths !== null) {
          durationText = `${durationInMonths} mois`
        } else {
          // Try to find any mention of duration
          const durationMatch = lowerFullText.match(/(\d+)\s*(mois|semaines|année|années|months?|weeks?|years?)/)
          if (durationMatch) {
            durationText = durationMatch[0]
          }
        }

        // Extract domain: we'll check if the text matches our target domains
        const domainMatches = matchesTargetDomain(fullText)
        let domain = domainMatches ? 'Pour vérifier' : 'Non spécifié'

        // Extract application link: look for a link that contains "postuler", "apply", "candidater"
        let applyLink = ''
        $$('a').each((_, linkElement) => {
          const linkHref = $$(linkElement).attr('href')
          const linkText = getText($$(linkElement)).toLowerCase()
          if (!linkHref) return
          try {
            const absoluteLinkHref = new URL(linkHref, pageUrl).href
            if (
              linkText.includes('postuler') ||
              linkText.includes('apply') ||
              linkText.includes('candidater') ||
              linkText.includes('envoyer') ||
              linkHref.includes('postuler') ||
              linkHref.includes('apply') ||
              linkHref.includes('candidater')
            ) {
              applyLink = absoluteLinkHref
              // We found one, break out of the each loop? We'll just set it and continue to find maybe a better one.
              // We'll break after setting the first one.
              return false // Break out of the each loop
            }
          } catch (e) {
            // Invalid URL, skip
          }
        })

        // If we didn't find an apply link, we might use the page URL as a fallback
        if (!applyLink) {
          applyLink = pageUrl
        }

        // Now we have a potential offer, we need to check if it's a valid internship offer
        const isInternship = isInternshipRelated(title) || isInternshipRelated(fullText)
        const isSixMonths = durationInMonths !== null && Math.abs(durationInMonths - 6) <= 2 // Allow +/- 2 months

        // We'll consider it a valid offer if:
        //   - It is internship-related
        //   - The domain matches our target domains (or we couldn't determine but we'll still consider it)
        //   - We have a title and an apply link
        if (isInternship && (domainMatches || domain === 'Non spécifié') && title && applyLink) {
          // Generate a safe ID for the offer
          const offerId = generateOfferId(company.siren, title)

          // Check if we already have this offer in the database (by id for this user)
          // We'll do a quick check to avoid duplicates
          supabase
            .from('cible_catalog_offers')
            .select('id')
            .eq('user_id', userId)
            .eq('id', offerId)
            .single()
            .then(({ data: existing, error: checkError }) => {
              if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
                console.error(`      Error checking for existing offer:`, checkError.message)
                return
              }
              if (existing) {
                // Offer already exists, skip
                console.log(`      - Offer already exists: ${title}`)
                return
              }

              // Prepare the offer record
              const offerRecord = {
                user_id: userId,
                id: offerId,
                title: title,
                company: company.name,
                location_text: location,
                domain_text: domain,
                search_text: `${title} ${company.name} ${location} ${domain}`,
                source_types: ['company_website'],
                version: 1,
                // We'll set the source_payload to something minimal
                source_payload: { source: 'company_website', pageUrl },
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
                    console.error(`      Error inserting offer:`, error.message)
                  } else {
                    console.log(`      ✓ Inserted offer: ${title}`)
                    offerCount++
                  }
                })
                .catch((err) => {
                  console.error(`      Exception inserting offer:`, err.message)
                })
            })
        }
      })

      // We'll also try to look for job listings in common structures like <div class="job">, etc.
      // But for now, we'll rely on the keyword approach.
    }

    // Delay between companies to be respectful
    await sleep(2000)
  }

  console.log(`\nFinished processing. Inserted ${offerCount} new offers.`)
}

main().catch(console.error)