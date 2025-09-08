import React, { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

export default function Map(props) {
  // Safely handle the case where props might be undefined
  const place = props ? props.place : null;
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const googleRef = useRef(null)
  const mapObjRef = useRef(null)

  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      libraries: ['places'],
    })

    let isMounted = true
    loader.load().then((google) => {
      if (!isMounted) return
      googleRef.current = google
      mapObjRef.current = new google.maps.Map(mapRef.current, {
        center: { lat: 41.8781, lng: -87.6298 }, // Chicago default
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
      })
    }).catch(err => console.error('Maps loader error:', err))

    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (!place || !googleRef.current || !mapObjRef.current || !place.location) return
    const { lat, lng } = place.location
    if (!markerRef.current) {
      markerRef.current = new googleRef.current.maps.Marker({
        map: mapObjRef.current,
        position: { lat, lng },
      })
    } else {
      markerRef.current.setPosition({ lat, lng })
    }
    mapObjRef.current.panTo({ lat, lng })
    mapObjRef.current.setZoom(14)
  }, [place])

  return <div id="map" ref={mapRef} role="region" aria-label="Map" />
}
