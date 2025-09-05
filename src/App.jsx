import React, { useCallback, useState } from 'react'
import Map from './components/Map.jsx'
import SearchBox from './components/searchbox.jsx'
import WikiPanel from './components/wikipanel.jsx'

export default function App() {
  const [place, setPlace] = useState(null)
  const [wiki, setWiki] = useState({ status: 'idle', pool: [] })

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
  const res = await fetch(`${SUMMARY_API}/${encodeURIComponent(title)}`)
  if (!res.ok) return null
  return res.json()
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

// Explicitly exclude non-place “meta” pages (offices, elections, lists, agencies, etc.)
const NON_PLACE_BLOCK = new RegExp(
  [
    '\\bmayor\\b','\\bgovernor\\b','\\bminister\\b','\\bpresident\\b','\\bprime minister\\b',
    '\\bcity council\\b','\\bcounty council\\b','\\bboard of\\b','\\bcommission\\b',
    '\\bdepartment\\b','\\bagency\\b','\\bauthority\\b','\\badministration\\b',
    '\\belection\\b','\\breferendum\\b','\\bby-election\\b',
    '^list of\\b','\\bindex of\\b','\\boutline of\\b','\\btimeline of\\b',
    '\\bschool district\\b','\\bpolice department\\b','\\bfire department\\b'
  ].join('|'),
  'i'
)

// Does a title look like a place name?
function titleLooksLikePlace(title = '') {
  const t = title.trim()
  if (/, [A-Z][a-zA-Z(). -]+$/.test(t)) return true          // "City, State/Country"
  if (/\([A-Z][a-zA-Z(). -]+\)$/.test(t)) return true        // "City (State/Country)"
  if (/^(city|town|village|municipality) of /i.test(t)) return true // "City of X"
  return /^[A-Z][a-zA-Z'. -]+$/.test(t)                      // single-name major places
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
function isPlaceOrPOI(summary) {
  if (!summary || summary.type === 'disambiguation') return false
  const title = (summary.title || '')
  const desc  = (summary.description || '')
  if (/(actor|actress|company|band|singer|politician|software|film|novel|surname)/i.test(desc)) return false
  if (NON_PLACE_BLOCK.test(title) || NON_PLACE_BLOCK.test(desc)) return false
  return !!detectBadge(summary)
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

// --- Primary resolver (city/town/country) — more forgiving on titles/coords
async function resolvePrimary(p) {
  const origin = p.location

  const accept = async (s) => {
    if (!s || isAdmin(s)) return false
    if (/^mayor of\b/i.test(s.title)) return false

    const badge = detectBadge(s)
    if (!(badge === 'Place' || badge === 'Country' || badge === 'State/Province')) return false

    // If we can compute distance, require it to be sane.
    // If we can't (missing coords), DON'T reject on that alone.
    const km = await kmFromOrigin(s, origin)
    return !Number.isFinite(km) || km <= 150
  }

  // 0) Super-robust pass: raw base names (handles "Chicago" vs "Chicago, Illinois")
  const baseNames = new Set([
    (p.admin?.city || '').trim(),
    (p.name || '').trim(),
  ])
  for (const n of [...baseNames]) {
    if (n && n.includes(',')) baseNames.add(n.split(',')[0].trim())
  }
  for (const t of baseNames) {
    if (!t) continue
    const s = await fetchSummary(t)
    if (await accept(s)) return s
  }

  // 1) Strong formatted candidates ("City, State", "City (State)", "City, Country", "City of X")
  for (const t of titleCandidatesFromAdmin(p)) {
    const s = await fetchSummary(t)
    if (await accept(s)) return s
  }

  // 2) Targeted searches
  const terms = [
    `${p.admin?.city || p.name} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim(),
    `${p.name} city`,
    `${p.name} municipality`,
  ]
  for (const q of terms) {
    const titles = await searchTitles(q, 12)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (await accept(s)) return s
    }
  }

  // 3) Proximate fallback from GeoSearch
  if (origin) {
    const near = await geoSearch(origin.lat, origin.lng, 25000, 25)
    for (const n of near) {
      const s = await fetchSummary(n.title)
      if (await accept(s)) return s
    }
  }

  return null
}

// --- Scoring ---
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
  const prox = Math.max(0, 6 - (distKm ?? 999)) // + up to ~6 if very close
  return base + prox
}

// --- Build the POOL (primary + lots of POIs; admins only as last resort)
async function buildWikipediaPool(p) {
  const origin = p.location
  const pool = []
  const seen = new Set()

  // 1) Primary (explicitly flagged)
  const primary = await resolvePrimary(p)
  if (primary) {
    const km = await kmFromOrigin(primary, origin)
    primary._badge = detectBadge(primary) || 'Place'
    if (Number.isFinite(km)) primary._distKm = km
    primary._isPrimary = true
    pool.push(primary); seen.add(primary.title)
  }

  // 2) Ranked nearby POIs (exclude admin)
  const ranked = []
  if (origin) {
    const near = await geoSearch(origin.lat, origin.lng, 35000, 100)
    for (const n of near) {
      if (seen.has(n.title)) continue
      const s = await fetchSummary(n.title)
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
        const s = await fetchSummary(t)
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
      const s = await fetchSummary(title)
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

  return pool.slice(0, 51)
}
