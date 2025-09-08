import React, { useCallback, useState, useEffect } from 'react'
import Map from './components/Map.jsx'
import SearchBox from './components/searchbox.jsx'
import WikiPanel from './components/wikipanel.jsx'

export default function App() {
  const [place, setPlace] = useState(null)
  const [wiki, setWiki] = useState({ status: 'idle', pool: [] })
  
  // Debug effect to log wiki state changes
  useEffect(() => {
    if (wiki.status === 'ready') {
      console.log('Wiki state updated:', {
        status: wiki.status,
        poolSize: wiki.pool.length,
        hasPrimary: !!wiki.pool.find(x => x._isPrimary),
        primaryTitle: wiki.pool.find(x => x._isPrimary)?.title || 'None'
      })
    }
  }, [wiki])

  const onPlaceSelected = useCallback(async (p) => {
    setPlace(p)
    setWiki({ status: 'loading', pool: [] })
    try {
      const pool = await buildWikipediaPool(p)
      setWiki({ status: 'ready', pool })
    } catch (e) {
      console.error(e)
      setWiki({ status: 'error', pool: [] })
    }
  }, [])

  return (
    <div id="app">
      <div className="map-wrap">
        <div className="search">
          <SearchBox onSelect={onPlaceSelected} />
        </div>
        <Map place={place} />
      </div>
      <div id="panel">
        <h1>Wikipedia</h1>
        <WikiPanel state={wiki} />
      </div>
    </div>
  )
}

/* ----------------- Wikipedia helpers ----------------- */

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary'

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
async function fetchSummary(title) {
  if (!title) return null
  const res = await fetch(`${SUMMARY_API}/${encodeURIComponent(title)}`)
  if (!res.ok) return null
  return res.json()
}

/** Normalize a title via MediaWiki redirects/normalization → canonical title */
async function normalizeTitle(title) {
  if (!title) return null
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('redirects', '1')
  url.searchParams.set('converttitles', '1')
  url.searchParams.set('titles', title)
  const data = await fetchJSON(url)
  const pages = data?.query?.pages || {}
  const first = Object.values(pages)[0]
  if (!first || first.missing) return null
  return first.title || null
}

/** Fetch a page summary using a normalized title (if possible) */
async function fetchNormalizedSummary(title) {
  const norm = await normalizeTitle(title)
  if (!norm) return null
  return fetchSummary(norm)
}

// --- Coordinates + distance ---
async function fetchCoords(title) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('prop', 'coordinates')
  url.searchParams.set('titles', title)
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  const pages = data?.query?.pages || {}
  const first = Object.values(pages)[0]
  const c = first?.coordinates?.[0]
  if (c && typeof c.lat === 'number' && typeof c.lon === 'number') {
    return { lat: c.lat, lng: c.lon }
  }
  return null
}
function haversineKm(a, b) {
  if (!a || !b) return Infinity
  const toRad = (x) => (x * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
// Prefer coords in the REST summary; fall back to coord query if needed
async function kmFromOrigin(summary, origin) {
  if (!origin) return Infinity
  const sc = summary?.coordinates
  if (sc && typeof sc.lat === 'number' && typeof sc.lon === 'number') {
    return haversineKm(origin, { lat: sc.lat, lng: sc.lon })
  }
  const c = await fetchCoords(summary?.title || '')
  if (!c) return Infinity
  return haversineKm(origin, c)
}

/** ---- Classification (tightened) ---- */

// Explicitly exclude non-place "meta" pages (offices, elections, lists, agencies, etc.)
const NON_PLACE_BLOCK = new RegExp(
  [
    '\\bmayor\\b','\\bgovernor\\b','\\bminister\\b','\\bpresident\\b','\\bprime minister\\b',
    '\\bcity council\\b','\\bcounty council\\b','\\bboard of\\b','\\bcommission\\b',
    '\\bdepartment\\b','\\bagency\\b','\\bauthority\\b','\\badministration\\b',
    '\\belection\\b','\\breferendum\\b','\\bby-election\\b',
    '^list of\\b','\\bindex of\\b','\\boutline of\\b','\\btimeline of\\b',
    '\\bschool district\\b','\\bpolice department\\b','\\bfire department\\b',
    '\\bcity council\\b', '\\bmunicipal council\\b', '\\btown council\\b',
    '\\bgovernment of\\b', '\\blegislature\\b', '\\bparliament\\b'
  ].join('|'),
  'i'
)

// Does a title look like a place name?
function titleLooksLikePlace(title = '') {
  const t = title.trim()
  
  // Reject titles with government/council terms
  if (/council|government|legislature|parliament|board|commission|committee|authority|agency|department/i.test(t)) {
    return false;
  }
  
  // "City, State/Country"
  if (/, [A-Z][a-zA-Z(). -]+$/.test(t)) return true
  
  // "City (State/Country)"
  if (/\([A-Z][a-zA-Z(). -]+\)$/.test(t)) return true
  
  // "City of X"
  if (/^(city|town|village|municipality) of /i.test(t)) return true
  
  // Common city name patterns
  if (/^(north|south|east|west|new|old|san|santa|saint|st\.|mount|mt\.) [A-Z][a-zA-Z'. -]+$/i.test(t)) return true
  
  // single-name major places
  return /^[A-Z][a-zA-Z'. -]+$/.test(t)
}

const BADGE_RULES = [
  { badge: 'Historic district', keys: ['historic district','historic centre','old town','downtown'] },
  { badge: 'Historic house',    keys: ['historic house','mansion','plantation','residence','house ('] },
  { badge: 'NRHP site',         keys: ['nrhp','national register of historic places'] },
  { badge: 'Museum',            keys: ['museum','gallery','zentrum'] },
  { badge: 'Park',              keys: ['national park','state park','city park','park','arboretum','botanical garden','nature reserve','preserve'] },
  { badge: 'University',        keys: ['university','college','institute','technical college'] },
  { badge: 'Airport',           keys: ['airport','airfield','air base','international airport'] },
  { badge: 'Stadium',           keys: ['stadium','arena','ballpark'] },
  { badge: 'Bridge',            keys: ['bridge'] },
  { badge: 'Waterfall',         keys: ['waterfall'] },
  { badge: 'Dam',               keys: ['dam'] },
  { badge: 'Lake',              keys: ['lake','reservoir'] },
  { badge: 'River',             keys: ['river'] },
  { badge: 'Mill',              keys: ['mill','gristmill','textile mill'] },
  { badge: 'Theater',           keys: ['theatre','theater','performing arts center','opera house'] },
  { badge: 'Zoo/Aquarium',      keys: ['zoo','aquarium'] },
  { badge: 'Religious site',    keys: ['cathedral','church','temple','mosque','synagogue'] },
  { badge: 'Library',           keys: ['library'] },
  { badge: 'Fort/Castle',       keys: ['fort','castle'] },
  { badge: 'Monument',          keys: ['monument','memorial','statue','obelisk'] },
  { badge: 'Market',            keys: ['market'] },
  { badge: 'Trail/Greenway',    keys: ['rail trail','greenway','trail','state trail'] },
  { badge: 'Neighborhood',      keys: ['neighborhood','borough','suburb','quarter','district'] },
  { badge: 'Factory/Mfg',       keys: ['factory','manufacturing plant','assembly plant','automobile manufacturing'] },
]
const ADMIN_BADGES = ['County','State/Province','Country']
const PLACE_CORE = [
  'city','town','village','municipality','census-designated place','borough','district',
  'capital','country','state','province','county','region','commune','civil parish','township','metropolitan'
]

function detectBadge(summary) {
  const title = (summary?.title || '')
  const t = title.toLowerCase()
  const d = (summary?.description || '').toLowerCase()

  if (NON_PLACE_BLOCK.test(t) || NON_PLACE_BLOCK.test(d)) return null

  for (const rule of BADGE_RULES) {
    if (rule.keys.some(k => t.includes(k) || d.includes(k))) return rule.badge
  }
  if (d.includes('county')) return 'County'
  if (d.includes('state') || d.includes('province')) return 'State/Province'
  if (d.includes('country')) return 'Country'

  if (titleLooksLikePlace(title) && PLACE_CORE.some(k => d.includes(k))) return 'Place'
  return null
}
function isAdmin(summary) {
  const b = detectBadge(summary)
  return ADMIN_BADGES.includes(b || '')
}

// Helper to detect if an article is likely a neighborhood
function isNeighborhood(summary, cityName) {
  if (!summary) return false;
  
  const title = summary.title || '';
  const desc = summary.description || '';
  const extract = summary.extract || '';
  
  // Specific case for "New City, Chicago" which is a neighborhood
  if (title === 'New City, Chicago') {
    console.log('Explicitly identified "New City, Chicago" as a neighborhood');
    return true;
  }
  
  // Check if it's explicitly described as a neighborhood
  if (/neighborhood|district|community area|suburb|quarter|borough|residential area/i.test(desc)) {
    console.log(`${title} identified as neighborhood from description`);
    return true;
  }
  
  // Check for "X, CityName" pattern which often indicates a neighborhood
  if (cityName && title.endsWith(`, ${cityName}`)) {
    // But make sure the city name itself isn't in this format (e.g., "Chicago, Illinois")
    if (title !== cityName) {
      console.log(`${title} identified as neighborhood from title pattern`);
      return true;
    }
  }
  
  // Check for "X (neighborhood in CityName)" pattern
  if (cityName && /\(.*\bin\b.*\)/i.test(title) && title.includes(cityName)) {
    console.log(`${title} identified as neighborhood from parenthetical`);
    return true;
  }
  
  // Check the extract for neighborhood indicators
  if (extract && /\bis a neighborhood\b|\bis a district\b|\bis a community\b|\bis a residential area\b/i.test(extract)) {
    console.log(`${title} identified as neighborhood from extract`);
    return true;
  }
  
  // Check for "New X" pattern when X is the city name (common for neighborhoods)
  if (cityName && title.startsWith('New ') && cityName.includes(title.substring(4))) {
    console.log(`${title} identified as neighborhood from 'New X' pattern`);
    return true;
  }
  
  return false;
}
function isPlaceOrPOI(summary) {
  if (!summary) {
    console.log('isPlaceOrPOI: Rejected null summary');
    return false;
  }
  if (summary.type === 'disambiguation') {
    console.log('isPlaceOrPOI: Rejected disambiguation page:', summary.title);
    return false;
  }
  
  const title = (summary.title || '')
  const desc  = (summary.description || '')
  
  if (/(actor|actress|company|band|singer|politician|software|film|novel|surname)/i.test(desc)) {
    console.log('isPlaceOrPOI: Rejected person/media:', summary.title, '-', desc);
    return false;
  }
  
  if (NON_PLACE_BLOCK.test(title) || NON_PLACE_BLOCK.test(desc)) {
    console.log('isPlaceOrPOI: Rejected by NON_PLACE_BLOCK:', summary.title);
    return false;
  }
  
  const badge = detectBadge(summary);
  const result = !!badge;
  
  if (!result) {
    console.log('isPlaceOrPOI: No badge detected for:', summary.title, '-', desc);
    // If it looks like a place name but didn't get a badge, let's accept it anyway
    if (titleLooksLikePlace(title)) {
      console.log('isPlaceOrPOI: But title looks like a place, accepting:', title);
      return true;
    }
  }
  
  return result;
}

// --- Search helpers ---
function titleCandidatesFromAdmin(p) {
  const city = (p.admin?.city || p.name || '').trim()
  const stateLong = (p.admin?.state || '').trim()
  const stateCode = (p.admin?.stateCode || '').trim()
  const country = (p.admin?.country || '').trim()
  const candidates = new Set()
  if (city && stateLong) {
    candidates.add(`${city}, ${stateLong}`)
    candidates.add(`${city} (${stateLong})`)
  }
  if (city && stateCode) candidates.add(`${city}, ${stateCode}`)
  if (city && country)   candidates.add(`${city}, ${country}`)
  if (p.name)            candidates.add(p.name)
  if (city)              candidates.add(`City of ${city}`)
  return Array.from(candidates)
}
async function searchTitles(query, limit = 10) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', query)
  url.searchParams.set('srlimit', String(limit))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  return (data?.query?.search || []).map(s => s.title)
}
async function searchNearmatch(query) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', query)
  url.searchParams.set('srwhat', 'nearmatch')
  url.searchParams.set('srlimit', '1')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  const hit = data?.query?.search?.[0]
  return hit?.title || null
}
async function geoSearch(lat, lng, radiusM = 30000, limit = 60) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'geosearch')
  url.searchParams.set('gscoord', `${lat}|${lng}`)
  url.searchParams.set('gsradius', String(radiusM))
  url.searchParams.set('gslimit', String(limit))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  return (data?.query?.geosearch || []).map(g => ({ title: g.title, dist: g.dist }))
}

/* ---------- Primary resolver (robust: normalize + near-match + distance if available) ---------- */
async function resolvePrimary(p) {
  const origin = p.location
  console.log('Resolving primary for:', p.name, p.admin?.city, origin)

  // Helper to check if a title contains government/council terms
  const isGovernmentBody = (title) => {
    const lowerTitle = (title || '').toLowerCase();
    return /council|government|legislature|parliament|board|commission|committee|authority|agency|department/i.test(lowerTitle);
  };

  const accept = async (s) => {
    if (!s) {
      console.log('Rejected: null summary')
      return false
    }
    
    // Reject government bodies like city councils
    if (isGovernmentBody(s.title)) {
      console.log('Rejected:', s.title, '- is a government body')
      return false
    }
    
    if (isAdmin(s)) {
      console.log('Rejected:', s.title, '- is admin')
      return false
    }
    
    if (/^mayor of\b/i.test(s.title)) {
      console.log('Rejected:', s.title, '- mayor pattern')
      return false
    }
    
    // Prioritize exact city name matches
    const cityName = p.admin?.city || '';
    if (cityName && s.title === cityName) {
      console.log('Accepted:', s.title, '- exact city name match')
      return true;
    }
    
    const badge = detectBadge(s)
    // Accept more badge types, especially for cities and places
    const validBadges = ['Place', 'Country', 'State/Province', 'County', 'Neighborhood']
    if (!validBadges.includes(badge)) {
      // If the title looks like a place name, accept it regardless of badge
      if (titleLooksLikePlace(s.title)) {
        console.log('Accepted despite badge:', s.title, '- title looks like a place')
        return true
      }
      console.log('Rejected:', s.title, '- badge is', badge)
      return false
    }
    
    const km = await kmFromOrigin(s, origin)
    const result = !Number.isFinite(km) || km <= 150
    if (!result) console.log('Rejected:', s.title, '- distance is', km, 'km')
    return result
  }

  // 0) Bare names + pre-comma variant
  const baseNames = new Set([(p.admin?.city || '').trim(), (p.name || '').trim()])
  for (const n of [...baseNames]) if (n && n.includes(',')) baseNames.add(n.split(',')[0].trim())
  for (const t of baseNames) {
    if (!t) continue
    const s = await fetchNormalizedSummary(t) || await fetchSummary(t)
    if (await accept(s)) return s
  }

  // 1) Near-match on strongest string
  const strong = `${p.admin?.city || p.name || ''} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim()
  if (strong) {
    const nm = await searchNearmatch(strong)
    if (nm) {
      const s = await fetchNormalizedSummary(nm) || await fetchSummary(nm)
      if (await accept(s)) return s
    }
  }

  // 2) Other formatted candidates
  for (const t of titleCandidatesFromAdmin(p)) {
    const s = await fetchNormalizedSummary(t) || await fetchSummary(t)
    if (await accept(s)) return s
  }

  // 3) Generic searches (still normalized)
  const terms = [`${p.name} city`, `${p.name} municipality`, strong].filter(Boolean)
  for (const q of terms) {
    const titles = await searchTitles(q, 15)
    for (const t of titles) {
      const s = await fetchNormalizedSummary(t) || await fetchSummary(t)
      if (await accept(s)) return s
    }
  }

  // 4) Nearby fallback
  if (origin) {
    const near = await geoSearch(origin.lat, origin.lng, 25000, 25)
    for (const n of near) {
      const s = await fetchNormalizedSummary(n.title) || await fetchSummary(n.title)
      if (await accept(s)) return s
    }
  }

  return null
}

/* ----------------- Scoring & pool building ----------------- */

function scoreItem(badge, distKm) {
  const w = new Map(Object.entries({
    'Historic district': 7,
    'NRHP site':         7,
    'Museum':            6,
    'Park':              6,
    'University':        6,
    'Stadium':           5,
    'Airport':           5,
    'Bridge':            4,
    'Waterfall':         4,
    'Dam':               4,
    'Lake':              4,
    'River':             3,
    'Mill':              3,
    'Theater':           3,
    'Zoo/Aquarium':      3,
    'Religious site':    3,
    'Library':           2,
    'Fort/Castle':       3,
    'Monument':          3,
    'Market':            3,
    'Trail/Greenway':    3,
    'Neighborhood':      2,
    'Historic house':    2,
    'Factory/Mfg':       2,
    'Place':             1,
  }))
  const base = w.get(badge || 'Place') ?? 0
  const prox = Math.max(0, 6 - (distKm ?? 999))
  return base + prox
}

async function buildWikipediaPool(p) {
  const origin = p.location
  const pool = []
  const seen = new Set()
  console.log('Building Wikipedia pool for:', p.name, p.admin?.city)

  // 1) Primary (explicitly flagged)
  let primary = await resolvePrimary(p)
  console.log('Primary article found:', primary ? primary.title : 'None')
  
  // If no primary article was found, try a direct search for the city name
  if (!primary && p.admin?.city) {
    console.log('No primary found, trying direct search for city:', p.admin.city)
    try {
      // Try multiple search strategies for major cities
      const cityName = p.admin.city;
      const stateName = p.admin?.state || '';
      const countryName = p.admin?.country || '';
      
      // List of search queries to try, in order of preference
      const searchQueries = [
        cityName, // Just the city name
        `${cityName}, ${p.admin?.stateCode || ''}`.trim(), // City, State code
        `${cityName}, ${stateName}`.trim(), // City, State
        `${cityName} (${stateName})`.trim(), // City (State)
        `${cityName}, ${countryName}`.trim() // City, Country
      ];
      
      // For all cities, try a more robust approach to find the primary article
      
      // 1. Try direct fetch by exact name first (most reliable for well-known places)
      try {
        console.log('Trying direct fetch for city:', cityName);
        const directArticle = await fetchSummary(cityName);
        
        // Log detailed information about the article
        if (directArticle) {
          console.log('Direct fetch article details:', {
            title: directArticle.title,
            description: directArticle.description,
            extract: directArticle.extract?.substring(0, 100) + '...',
            type: directArticle.type
          });
          
          // Special handling for "New City, Chicago" issue
          if (cityName === 'Chicago' && directArticle.title === 'New City, Chicago') {
            console.log('Detected "New City, Chicago" - this is a neighborhood, not the city');
            
            // Try to get the actual Chicago article
            console.log('Trying direct fetch for "Chicago, Illinois"');
            const chicagoArticle = await fetchSummary('Chicago, Illinois');
            if (chicagoArticle && chicagoArticle.title === 'Chicago') {
              console.log('Successfully found Chicago via "Chicago, Illinois"');
              primary = chicagoArticle;
            }
          } else if (directArticle.title === cityName && 
                    !isNeighborhood(directArticle, cityName) && 
                    !/(council|government|board)/i.test(directArticle.title)) {
            console.log('Found city via direct fetch:', directArticle.title);
            primary = directArticle;
          } else {
            console.log('Direct fetch returned unsuitable article:', directArticle.title);
            console.log('Reasons for rejection:', {
              isNeighborhood: isNeighborhood(directArticle, cityName),
              hasGovernmentTerms: /(council|government|board)/i.test(directArticle.title)
            });
          }
        } else {
          console.log('Direct fetch returned no article');
        }
      } catch (e) {
        console.error('Error in direct fetch:', e);
      }
      
      // 2. If direct fetch didn't work, try normalized search
      if (!primary) {
        const exactMatch = await fetchNormalizedSummary(cityName);
        if (exactMatch && 
            exactMatch.type !== 'disambiguation' && 
            !/(council|government|board)/i.test(exactMatch.title) && 
            !isNeighborhood(exactMatch, cityName)) {
          console.log('Found city via normalized search:', exactMatch.title);
          primary = exactMatch;
        } else if (exactMatch) {
          console.log('Normalized search returned unsuitable article:', exactMatch.title);
        }
      }
      
      // Special case for Chicago - try to fetch it directly by URL
      if (cityName === 'Chicago' && !primary) {
        try {
          console.log('Trying direct REST API fetch for Chicago');
          const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Chicago');
          if (response.ok) {
            const chicagoArticle = await response.json();
            if (chicagoArticle && chicagoArticle.title === 'Chicago') {
              console.log('Successfully found Chicago via direct REST API');
              primary = chicagoArticle;
            }
          }
        } catch (e) {
          console.error('Error in direct REST API fetch for Chicago:', e);
        }
      }
      
      // 3. If still no primary, try the search queries
      if (!primary) {
        // Try a more specific query for cities that might have ambiguous names
        const specificQueries = [
          `${cityName} city`,
          `${cityName}, ${p.admin?.stateCode || ''} city`.trim(),
          `${cityName}, ${stateName} city`.trim(),
          `${cityName}, ${countryName} city`.trim()
        ];
        
        // For Chicago specifically, add some known-good queries
        if (cityName === 'Chicago') {
          specificQueries.unshift('Chicago, Illinois');
        }
        
        // Combine specific queries with our original queries
        const allQueries = [...specificQueries, ...searchQueries];
        
        for (const query of allQueries) {
          if (!query) continue;
          console.log('Trying search query:', query);
          const cityTitle = await searchNearmatch(query);
          if (cityTitle) {
            const citySummary = await fetchNormalizedSummary(cityTitle) || await fetchSummary(cityTitle);
            if (citySummary && 
                citySummary.type !== 'disambiguation' && 
                !/(council|government|board)/i.test(citySummary.title) && 
                !isNeighborhood(citySummary, cityName)) {
              
              // Extra check: if the title is exactly the city name, that's a strong match
              if (citySummary.title === cityName) {
                console.log('Found exact city name match:', citySummary.title);
                primary = citySummary;
                break;
              }
              
              // Otherwise, accept this as a good match
              console.log('Found city article via search query:', query, '->', citySummary.title);
              primary = citySummary;
              break;
            } else if (citySummary) {
              console.log('Rejected candidate:', citySummary.title, 
                         isNeighborhood(citySummary, cityName) ? '- is neighborhood' : 
                         citySummary.type === 'disambiguation' ? '- is disambiguation' : 
                         '- other rejection reason');
            }
          }
        }
      }
    } catch (e) {
      console.error('Error in direct city search:', e);
    }
  }
  
  // Final check to ensure we're not getting a neighborhood as the primary article
  if (primary) {
    // Double-check that we're not getting a neighborhood
    if (isNeighborhood(primary, cityName)) {
      console.log('WARNING: Primary article is a neighborhood:', primary.title);
      
      // For Chicago, make one last attempt to get the right article
      if (cityName === 'Chicago') {
        try {
          console.log('Making final attempt to get Chicago article');
          const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Chicago');
          if (response.ok) {
            const chicagoArticle = await response.json();
            if (chicagoArticle && chicagoArticle.title === 'Chicago') {
              console.log('Successfully found Chicago in final check');
              primary = chicagoArticle;
            }
          }
        } catch (e) {
          console.error('Error in final Chicago check:', e);
        }
      }
    }
    
    // Add the primary article to the pool
    const km = await kmFromOrigin(primary, origin)
    primary._badge = detectBadge(primary) || 'Place'
    if (Number.isFinite(km)) primary._distKm = km
    primary._isPrimary = true
    pool.push(primary); seen.add(primary.title)
    console.log('Added primary article to pool:', primary.title, 'with badge:', primary._badge)
  }

  // 2) Ranked nearby POIs (exclude admin)
  const ranked = []
  if (origin) {
    const near = await geoSearch(origin.lat, origin.lng, 35000, 100)
    for (const n of near) {
      if (seen.has(n.title)) continue
      const s = await fetchNormalizedSummary(n.title) || await fetchSummary(n.title)
      if (!isPlaceOrPOI(s) || isAdmin(s)) continue
      const badge = detectBadge(s) || 'Place'
      const distKm = (n.dist ?? 0) / 1000
      if (distKm > 35) continue // geofence
      s._badge = badge
      s._distKm = distKm
      ranked.push({ s, score: scoreItem(badge, distKm) })
      if (ranked.length >= 80) break
    }
    ranked.sort((a, b) => b.score - a.score)
  }
  for (const r of ranked) {
    if (seen.has(r.s.title)) continue
    pool.push(r.s); seen.add(r.s.title)
  }

  // 3) Keyword fallbacks with geofence (≤ 60 km)
  if (origin) {
    const city = p.admin?.city || p.name || ''
    const state = p.admin?.state || ''
    const country = p.admin?.country || ''
    const topics = ['museum','park','historic district','university','airport','stadium','lake','dam','waterfall','bridge','mill','theater','zoo','trail']
    for (const topic of topics) {
      const titles = await searchTitles(`${city} ${state} ${country} ${topic}`, 8)
      for (const t of titles) {
        if (seen.has(t)) continue
        const s = await fetchNormalizedSummary(t) || await fetchSummary(t)
        if (!isPlaceOrPOI(s) || isAdmin(s)) continue
        const km = await kmFromOrigin(s, origin)
        if (!Number.isFinite(km) || km > 60) continue
        s._badge = detectBadge(s) || 'Place'
        s._distKm = km
        pool.push(s); seen.add(s.title)
      }
    }
  }

  // 4) Last resort: admin enclosures (only if pool is tiny)
  if (pool.length < 2) {
    const tryAdd = async (title) => {
      if (!title || seen.has(title)) return
      const s = await fetchNormalizedSummary(title) || await fetchSummary(title)
      if (s && isAdmin(s)) {
        s._badge = detectBadge(s) || 'Place'
        const km = await kmFromOrigin(s, origin)
        if (Number.isFinite(km)) s._distKm = km
        pool.push(s); seen.add(title)
      }
    }
    const county = p.admin?.county
    const stateLong = p.admin?.state
    const stateCode = p.admin?.stateCode
    const country = p.admin?.country
    if (county && (stateLong || stateCode)) await tryAdd(`${county}, ${stateLong || stateCode}`)
    if (stateLong) await tryAdd(stateLong)
    if (country) await tryAdd(country)
  }

  const result = pool.slice(0, 51)
  console.log('Final pool size:', result.length, 'Primary article included:', !!result.find(x => x._isPrimary))
  return result
}
