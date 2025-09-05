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

// Positive filter: only accept pages that clearly describe places/admin areas.
function isPlaceSummary(summary) {
  if (!summary || summary.type === 'disambiguation') return false
  const d = (summary.description || '').toLowerCase()
  const placeHints = [
    'city','town','village','municipality','capital','country','state','province','county',
    'district','borough','metropolitan','census-designated place','neighborhood','suburb',
    'civil parish','commune','region','township'
  ]
  return placeHints.some(h => d.includes(h))
}

// Build strong title candidates like "Greer, South Carolina" first.
function titleCandidatesFromAdmin(p) {
  const city = (p.admin?.city || p.name || '').trim()
  const stateLong = (p.admin?.state || '').trim()
  const stateCode = (p.admin?.stateCode || '').trim()
  const country = (p.admin?.country || '').trim()
  const candidates = new Set()

  if (city && stateLong) {
    candidates.add(`${city}, ${stateLong}`)
    candidates.add(`${city} (${stateLong})`) // some pages use parentheses
  }
  if (city && stateCode) {
    candidates.add(`${city}, ${stateCode}`)
  }
  if (city && country) {
    candidates.add(`${city}, ${country}`)
  }
  // Raw display name as a last resort
  if (p.name) candidates.add(p.name)

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

async function geoSearchTitles(lat, lng, radiusM = 20000, limit = 30) {
  const url = new URL(WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'geosearch')
  url.searchParams.set('gscoord', `${lat}|${lng}`)
  url.searchParams.set('gsradius', String(radiusM))
  url.searchParams.set('gslimit', String(limit))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const data = await fetchJSON(url)
  return (data?.query?.geosearch || []).map(g => g.title)
}

async function resolvePrimary(p) {
  // Try exact, strong candidates first
  for (const t of titleCandidatesFromAdmin(p)) {
    const s = await fetchSummary(t)
    if (isPlaceSummary(s)) return s
  }
  // Then try search constrained by city/state/country words
  const terms = [
    `${p.admin?.city || p.name} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim(),
    `${p.name} city`,
  ]
  for (const q of terms) {
    const titles = await searchTitles(q, 10)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (isPlaceSummary(s)) return s
    }
  }
  // Finally, nearest geosearch page that is a place
  if (p.location) {
    const titles = await geoSearchTitles(p.location.lat, p.location.lng, 15000, 20)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (isPlaceSummary(s)) return s
    }
  }
  return null
}

async function fetchAdminEnclosureSummaries(p) {
  // Try to include county, state/province, and country pages (place-only).
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

  // County pages are usually "X County, Y"
  if (county && (stateLong || stateCode)) {
    await tryAdd(`${county}, ${stateLong || stateCode}`)
  }
  // State/province page
  if (stateLong) await tryAdd(stateLong)
  // Country page
  if (country) await tryAdd(country)

  return out
}

async function fetchTopWikipediaItems(p) {
  const maxTotal = 5
  const seen = new Set()
  const items = []

  // 1) Primary (the exact city/town/country page)
  const primary = await resolvePrimary(p)
  if (primary) {
    items.push(primary)
    seen.add(primary.title)
  }

  // 2) Enclosing admin areas (county, state, country) — filtered to place pages only
  for (const s of await fetchAdminEnclosureSummaries(p)) {
    if (items.length >= maxTotal) break
    if (seen.has(s.title)) continue
    items.push(s); seen.add(s.title)
  }

  // 3) Nearby place pages via geosearch (filter to place-only)
  if (p.location && items.length < maxTotal) {
    const titles = await geoSearchTitles(p.location.lat, p.location.lng, 20000, 40)
    for (const t of titles) {
      if (items.length >= maxTotal) break
      if (seen.has(t)) continue
      const s = await fetchSummary(t)
      if (!isPlaceSummary(s)) continue
      items.push(s); seen.add(t)
    }
  }

  // 4) As a final fallback, keyword search constrained to the place terms, still filtered
  if (items.length < maxTotal) {
    const q = `${p.admin?.city || p.name} ${p.admin?.state || ''} ${p.admin?.country || ''}`.trim()
    const titles = await searchTitles(q, 15)
    for (const t of titles) {
      if (items.length >= maxTotal) break
      if (seen.has(t)) continue
      const s = await fetchSummary(t)
      if (!isPlaceSummary(s)) continue
      items.push(s); seen.add(t)
    }
  }

  return items.slice(0, maxTotal)
}
