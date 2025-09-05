import React, { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

export default function SearchBox({ onSelect }) {
  const hostRef = useRef(null)
  const elRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    const loader = new Loader({ apiKey, libraries: ['places'] })

    loader.load().then(async (google) => {
      if (!isMounted || !hostRef.current) return
      await google.maps.importLibrary('places')

      const el = new google.maps.places.PlaceAutocompleteElement()
      el.className = 'search-input'
      hostRef.current.appendChild(el)
      elRef.current = el

      el.addEventListener('gmp-select', async ({ placePrediction }) => {
        const place = placePrediction.toPlace()
        // Request richer fields so we can form exact titles like "Greer, South Carolina"
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'types'],
        })

        const ac = Object.fromEntries(
          (place.addressComponents || []).map(c => [c.types?.[0], { short: c.shortText, long: c.longText }])
        )

        const admin = {
          city: ac.locality?.long || ac.postal_town?.long || ac.sublocality?.long || '',
          county: ac.administrative_area_level_2?.long || '',
          state: ac.administrative_area_level_1?.long || '',
          stateCode: ac.administrative_area_level_1?.short || '',
          country: ac.country?.long || '',
          countryCode: ac.country?.short || '',
        }

        const loc = place.location
        onSelect?.({
          name: place.displayName,
          address: place.formattedAddress,
          location: loc ? { lat: loc.lat(), lng: loc.lng() } : null,
          admin,
          types: place.types || [],
        })
      })
    }).catch(err => console.error('Maps loader error:', err))

    return () => {
      isMounted = false
      if (elRef.current && hostRef.current?.contains(elRef.current)) {
        hostRef.current.removeChild(elRef.current)
      }
      elRef.current = null
    }
  }, [onSelect])

  return <div ref={hostRef} className="search" aria-label="Search a place" />
}
