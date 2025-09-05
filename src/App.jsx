import React, { useCallback, useState } from 'react'
import Map from './components/Map.jsx'
import SearchBox from './components/searchbox.jsx'
import WikiPanel from './components/wikipanel.jsx'

export default function App() {
  const [place, setPlace] = useState(null)
  const [wiki, setWiki] = useState({ status: 'idle' })

  const onPlaceSelected = useCallback(async (p) => {
    setPlace(p)
    setWiki({ status: 'loading' })
    try {
      const { lat, lng } = p.location
      const page = await fetchNearestWikipedia(lat, lng)
      if (!page) return setWiki({ status: 'empty' })
      const summary = await fetchWikipediaSummary(page.title)
      setWiki({ status: 'ready', data: summary })
    } catch (e) {
      console.error(e)
      setWiki({ status: 'error' })
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

async function fetchNearestWikipedia(lat, lng) {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'geosearch')
  url.searchParams.set('gscoord', `${lat}|${lng}`)
  url.searchParams.set('gsradius', '10000')
  url.searchParams.set('gslimit', '1')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  const res = await fetch(url.toString())
  const data = await res.json()
  return (data?.query?.geosearch && data.query.geosearch[0]) || null
}

async function fetchWikipediaSummary(title) {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`
  )
  if (!res.ok) return null
  return res.json()
}
