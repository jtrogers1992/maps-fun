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

/** Label detection for “interesting” places/POIs */
const BADGE_RULES = [
  { badge: 'Historic district', keys: ['historic district','old town','downtown'] },
  { badge: 'Museum',            keys: ['museum','gallery'] },
  { badge: 'Park',              keys: ['national park','state park','park','botanical garden','garden','arboretum'] },
  { badge: 'University',        keys: ['university','college','institute'] },
  { badge: 'Airport',           keys: ['airport','airfield'] },
  { badge: 'Stadium',           keys: ['stadium','arena','ballpark'] },
  { badge: 'Bridge',            keys: ['bridge'] },
  { badge: 'River',             keys: ['river'] },
  { badge: 'Lake',              keys: ['lake'] },
  { badge: 'Zoo/Aquarium',      keys: ['zoo','aquarium'] },
  { badge: 'Theater',           keys: ['theatre','theater','opera house'] },
  { badge: 'Religious site',    keys: ['cathedral','church','temple','mosque','synagogue'] },
  { badge: 'Library',           keys: ['library'] },
  { badge: 'Fort/Castle',       keys: ['fort','castle'] },
  { badge: 'Monument',          keys: ['monument','memorial'] },
  { badge: 'Market',            keys: ['market'] },
  { badge: 'Neighborhood',      keys: ['neighborhood','borough','suburb','quarter','district'] },
]

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
  // Admin areas:
  if (d.includes('county')) return 'County'
  if (d.includes('state') || d.includes('province')) return 'State/Province'
  if (d.includes('country')) return 'Country'
  // Generic place:
  if (PLACE_CORE.some(k => d.includes(k))) return 'Place'
  return null
}

function isPlaceSummary(summary) {
  if (!summary || summary.type === 'disambiguation') return false
  // Accept if it’s a place/POI (physical location). Reject biographies/companies/etc by omission.
  return !!detectBadge(summary)
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

async function geoSearch(lat, lng, radiusM = 20000, limit = 40) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'geosearch')
  url.searchParams.set('gscoord', `${lat}|${lng}`)
  url.searchParams.set('gsradius', String(radiusM))
  url.searchParams.set('gslimit', String(limit))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  // returns [{title, dist, lat, lon}]
  return (data?.query?.geosearch || []).map(g => ({ title: g.title, dist: g.dist }))
}

async function resolvePrimary(p) {
  for (const t of titleCandidatesFromAdmin(p)) {
    const s = await fetchSummary(t)
    if (isPlaceSummary(s) && (detectBadge(s) === 'Place' || detectBadge(s) === 'Country' || detectBadge(s) === 'State/Province'))
      return s
  }
  const terms = [
    `${p.admin?.city || p.name} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim(),
    `${p.name} city`,
  ]
  for (const q of terms) {
    const titles = await searchTitles(q, 10)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (isPlaceSummary(s) && (detectBadge(s) === 'Place' || detectBadge(s) === 'Country' || detectBadge(s) === 'State/Province'))
        return s
    }
  }
  if (p.location) {
    const near = await geoSearch(p.location.lat, p.location.lng, 15000, 20)
    for (const n of near) {
      const s = await fetchSummary(n.title)
      if (isPlaceSummary(s) && (detectBadge(s) === 'Place' || detectBadge(s) === 'Country' || detectBadge(s) === 'State/Province'))
        return s
    }
  }
  return null
}

/** Higher score = more interesting + closer */
function scoreItem(badge, distKm) {
  const badgeWeights = new Map(Object.entries({
    'Historic district': 6,
    'Museum': 6,
    'Park': 5,
    'University': 5,
    'Airport': 4,
    'Stadium': 4,
    'Bridge': 4,
    'River': 3,
    'Lake': 3,
    'Zoo/Aquarium': 3,
    'Theater': 3,
    'Religious site': 3,
    'Library': 2,
    'Fort/Castle': 3,
    'Monument': 3,
    'Market': 3,
    'Neighborhood': 2,
    'District': 2,
    'Place': 1,
    'County': -1,
    'State/Province': -2,
    'Country': -3,
  }))
  const base = badgeWeights.get(badge || 'Place') ?? 0
  // proximity bonus: up to +5 within ~5 km, then taper
  const prox = Math.max(0, 5 - (distKm ?? 999))
  return base + prox
}

async function fetchAdminEnclosureSummaries(p) {
  const out = []

  const tryAdd = async (title) => {
    if (!title) return
    const s = await fetchSummary(title)
    if (isPlaceSummary(s)) out.push(s)
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

  // 2) Nearby interesting POIs (ranked)
  let ranked = []
  if (p.location) {
    const near = await geoSearch(p.location.lat, p.location.lng, 20000, 60)
    // Fetch summaries (limited) and score
    for (const n of near) {
      if (seen.has(n.title)) continue
      const s = await fetchSummary(n.title)
      if (!isPlaceSummary(s)) continue
      const badge = detectBadge(s) || 'Place'
      const distKm = (n.dist ?? 0) / 1000
      const score = scoreItem(badge, distKm)
      s._badge = badge
      s._distKm = distKm
      ranked.push({ s, score })
      // small safety to avoid too many fetches; we likely have enough variety
      if (ranked.length >= 40) break
    }
    ranked.sort((a, b) => b.score - a.score)
  }

  for (const r of ranked) {
    if (items.length >= maxTotal) break
    if (seen.has(r.s.title)) continue
    items.push(r.s); seen.add(r.s.title)
  }

  // 3) If still short, add enclosing admin areas (de-prioritized)
  if (items.length < maxTotal) {
    for (const s of await fetchAdminEnclosureSummaries(p)) {
      if (items.length >= maxTotal) break
      if (seen.has(s.title)) continue
      s._badge = detectBadge(s) || 'Place'
      items.push(s); seen.add(s.title)
    }
  }

  // 4) Final fallback: targeted keyword searches (still filtered)
  const need = maxTotal - items.length
  if (need > 0) {
    const city = p.admin?.city || p.name || ''
    const state = p.admin?.state || ''
    const country = p.admin?.country || ''
    const queries = [
      `${city} ${state} ${country} museum`,
      `${city} ${state} ${country} park`,
      `${city} ${state} ${country} historic district`,
      `${city} ${state} ${country} university`,
      `${city} ${state} ${country} airport`,
      `${city} ${state} ${country} stadium`,
    ]
    for (const q of queries) {
      const titles = await searchTitles(q, 5)
      for (const t of titles) {
        if (items.length >= maxTotal) break
        if (seen.has(t)) continue
        const s = await fetchSummary(t)
        if (!isPlaceSummary(s)) continue
        s._badge = detectBadge(s) || 'Place'
        items.push(s); seen.add(s.title)
      }
      if (items.length >= maxTotal) break
    }
  }

  return items.slice(0, maxTotal)
}
