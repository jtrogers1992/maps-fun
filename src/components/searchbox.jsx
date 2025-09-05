import React, { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

export default function SearchBox({ onSelect }) {
  const inputRef = useRef(null)
  const autoRef = useRef(null)

  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      libraries: ['places'],
    })

    let isMounted = true
    loader.load().then((google) => {
      if (!isMounted) return
      autoRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ['geometry', 'name', 'formatted_address', 'place_id'],
      })
      autoRef.current.addListener('place_changed', () => {
        const place = autoRef.current.getPlace()
        if (!place?.geometry?.location) return
        const loc = place.geometry.location
        onSelect?.({
          name: place.name,
          address: place.formatted_address,
          placeId: place.place_id,
          location: { lat: loc.lat(), lng: loc.lng() },
        })
      })
    })

    return () => { isMounted = false }
  }, [onSelect])

  return (
    <input
      ref={inputRef}
      placeholder="Search a place…"
      aria-label="Search a place"
      className="search-input"
    />
  )
}
