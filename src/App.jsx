import React, { useCallback, useState } from 'react'
import Map from './components/Map.jsx'
import SearchBox from './components/SearchBox.jsx'
import WikiPanel from './components/WikiPanel.jsx'

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
  const url = `${SUMMARY_API}/${encodeURIComponent(title)}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

function looksLikePlace(summary, placeName) {
  if (!summary || summary.type === 'disambiguation') return false
  const nameMatch = summary.title?.toLowerCase() === (placeName || '').toLowerCase()
  const desc = (summary.description || '').toLowerCase()
  const placeHints = [
    'city', 'town', 'village', 'municipality',
    'capital', 'country', 'state', 'province',
    'county', 'district', 'metropolitan'
  ]
  const hintMatch = placeHints.some(h => desc.includes(h))
  return nameMatch || hintMatch
}

function parseCountryLike(formattedAddress) {
  // naive: take last comma-separated segment as country/large region
  if (!formattedAddress) return ''
  const parts = formattedAddress.split(',').map(s => s.trim())
  return parts[parts.length - 1] || ''
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

async function geoSearch(lat, lng, radiusM = 20000, limit = 20) {
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

async function resolvePrimary(placeName, formattedAddress) {
  // 1) Try exact title first
  const direct = await fetchSummary(placeName)
  if (looksLikePlace(direct, placeName)) return direct

  // 2) Try search with a country/region hint
  const hint = parseCountryLike(formattedAddress)
  const queries = [
    `${placeName} ${hint}`.trim(),
    placeName
  ]

  for (const q of queries) {
    const titles = await searchTitles(q, 10)
    for (const t of titles) {
      const s = await fetchSummary(t)
      if (looksLikePlace(s, placeName)) return s
    }
  }

  // 3) Give up (caller will fall back to geosearch)
  return null
}

async function fetchTopWikipediaItems(p) {
  const { lat, lng } = p.location
  const placeName = p.name || ''
  const formattedAddress = p.address || ''
  const maxTotal = 5

  // Find "primary" (the actual city/town/country page)
  let primary = await resolvePrimary(placeName, formattedAddress)

  // Nearby pages
  const nearby = await geoSearch(lat, lng, 20000, 30) // 20km radius
  const titles = nearby.map(n => n.title)

  // Ensure primary exists; if not, pick the nearest as a fallback
  if (!primary) {
    if (titles.length > 0) {
      primary = await fetchSummary(titles[0])
    }
  }

  // Build the rest of the list: take distinct titles excluding primary
  const seen = new Set()
  const items = []

  if (primary) {
    seen.add(primary.title)
    items.push(primary)
  }

  for (const t of titles) {
    if (items.length >= maxTotal) break
    if (seen.has(t)) continue
    const s = await fetchSummary(t)
    if (!s || s.type === 'disambiguation') continue
    seen.add(t)
    items.push(s)
  }

  // If we still have fewer than 5, pad with search titles about the place name
  if (items.length < maxTotal) {
    const extras = await searchTitles(`${placeName} ${parseCountryLike(formattedAddress)}`, 10)
    for (const t of extras) {
      if (items.length >= maxTotal) break
      if (seen.has(t)) continue
      const s = await fetchSummary(t)
      if (!s || s.type === 'disambiguation') continue
      seen.add(t)
      items.push(s)
    }
  }

  return items.slice(0, maxTotal)
}
