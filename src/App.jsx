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
  if (PLACE_CORE.some(k_
