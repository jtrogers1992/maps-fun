import React, { useCallback, useState } from 'react'
import Map from './components/Map.jsx'
import SearchBox from './components/searchbox.jsx'
import WikiPanel from './components/wikipanel.jsx'

export default function App() {
  const [place, setPlace] = useState(null)
  const [wiki, setWiki] = useState({ status: 'idle', items: [] })

  const onPlaceSelected = useCallback(async (p) => {
    setPlace(p)
    setWiki({ status: 'loading', items: [] })
    try {
      const items = await fetchTopWikipediaItems(p)
      setWiki({ status: 'ready', items })
    } catch (e) {
      console.error(e)
      setWiki({ status: 'error', items: [] })
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

/** Labels for POIs and interesting place types (title/description heuristics) */
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
  const t = (summary?.title || '').toLowerCase()
  const d = (summary?.description || '').toLowerCase()

  for (const rule of BADGE_RULES) {
    if (rule.keys.some(k => t.includes(k) || d.includes(k))) return rule.badge
  }
  if (d.includes('county')) return 'County'
  if (d.includes('state') || d.includes('province')) return 'State/Province'
  if (d.includes('country')) return 'Country'
  if (PLACE_CORE.some(k => d.includes(k))) return 'Place'
  return null
}

function isAdmin(summary) {
  const badge = detectBadge(summary)
  return ADMIN_BADGES.includes(badge || '')
}

function isPlaceOrPOI(summary) {
  if (!summary || summary.type === 'disambiguation') return false
  const badge = detectBadge(summary)
  // Accept places + POIs, but NOT biographies/companies/etc; admin allowed only as last-resort
  return !!badge && !/actor|actress|company|band|singer|politician|software|film|novel|surname/i.test(summary.description || '')
}

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

async function resolvePrimary(p) {
  // Prefer the city/town/country page, not admin units
  const good = (s) => s && !isAdmin(s) && (detectBadge(s) === 'Place' || detectBadge(s) === 'Country' || detectBadge(s) === 'State/Province')
  for (const t of titleCandidatesFromAdmin(p)) {
    const s = await fetchSummary(t)
    if (good(s)) return s
  }
  const terms = [
    `${p.admin?.city || p.name} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim(),
    `${p.name} city`,
  ]
  for (const q of terms) {
    const titles = await searchTitles(q, 10)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (good(s)) return s
    }
  }
  if (p.location) {
    const near = await geoSearch(p.location.lat, p.location.lng, 20000, 20)
    for (const n of near) {
      const s = await fetchSummary(n.title)
      if (good(s)) return s
    }
  }
  return null
}

/** Higher score = more interesting + closer. Admins are excluded from ranking. */
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

async function fetchAdminEnclosureSummaries(p) {
  const out = []
  const tryAdd = async (title) => {
    if (!title) return
    const s = await fetchSummary(title)
    if (s && isAdmin(s)) out.push(s)
  }
  const county = p.admin?.county
  const stateLong = p.admin?.state
  const stateCode = p.admin?.stateCode
  const country = p.admin?.country

  if (county && (stateLong || stateCode)) await tryAdd(`${county}, ${stateLong || stateCode}`)
  if (stateLong) await tryAdd(stateLong)
  if (country) await tryAdd(country)
  return out
}

async function fetchTopWikipediaItems(p) {
  const maxTotal = 5
  const seen = new Set()
  const items = []

  // 1) Primary (city/town/country)
  const primary = await resolvePrimary(p)
  if (primary) {
    primary._badge = detectBadge(primary) || 'Place'
    items.push(primary); seen.add(primary.title)
  }

  // 2) Nearby interesting POIs (exclude admin entirely here)
  let ranked = []
  if (p.location) {
    const near = await geoSearch(p.location.lat, p.location.lng, 35000, 80)
    for (const n of near) {
      if (seen.has(n.title)) continue
      const s = await fetchSummary(n.title)
      if (!isPlaceOrPOI(s) || isAdmin(s)) continue
      const badge = detectBadge(s) || 'Place'
      const distKm = (n.dist ?? 0) / 1000
      // ignore things too far to feel related
      if (distKm > 35) continue
      s._badge = badge
      s._distKm = distKm
      ranked.push({ s, score: scoreItem(badge, distKm) })
      if (ranked.length >= 50) break
    }
    ranked.sort((a, b) => b.score - a.score)
  }

  for (const r of ranked) {
    if (items.length >= maxTotal) break
    if (seen.has(r.s.title)) continue
    items.push(r.s); seen.add(r.s.title)
  }

  // 3) If still short, keyword hunts for POIs (still excluding admin)
  if (items.length < maxTotal) {
    const city = p.admin?.city || p.name || ''
    const state = p.admin?.state || ''
    const country = p.admin?.country || ''
    const topics = ['museum','park','historic district','university','airport','stadium','lake','dam','waterfall','bridge','mill','theater','zoo','trail']
    for (const topic of topics) {
      const titles = await searchTitles(`${city} ${state} ${country} ${topic}`, 6)
      for (const t of titles) {
        if (items.length >= maxTotal) break
        if (seen.has(t)) continue
        const s = await fetchSummary(t)
        if (!isPlaceOrPOI(s) || isAdmin(s)) continue
        s._badge = detectBadge(s) || 'Place'
        items.push(s); seen.add(s.title)
      }
      if (items.length >= maxTotal) break
    }
  }

  // 4) Absolute last resort: add admin enclosures (county/state/country) to fill to 5
  if (items.length < maxTotal) {
    for (const s of await fetchAdminEnclosureSummaries(p)) {
      if (items.length >= maxTotal) break
      if (seen.has(s.title)) continue
      s._badge = detectBadge(s) || 'Place'
      items.push(s); seen.add(s.title)
    }
  }

  return items.slice(0, maxTotal)
}
