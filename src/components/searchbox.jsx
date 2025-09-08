import { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

export default function SearchBox(props) {
  // Safely handle the case where props might be undefined
  const onSelect = props ? props.onSelect : () => {};
  const hostRef = useRef(null)
  const elRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    const loader = new Loader({ apiKey, libraries: ['places'] })

    const handleSelect = async (ev) => {
      try {
        let placeObj = null

        // Newer event shape: gmp-placeselect -> ev.detail.place
        if (ev?.detail?.place) {
          placeObj = ev.detail.place
        }
        // Older/alternate: gmp-select -> ev.detail.placePrediction.toPlace()
        else if (ev?.detail?.placePrediction?.toPlace) {
          placeObj = ev.detail.placePrediction.toPlace()
        }
        // Some browsers bubble placePrediction at top-level
        else if (ev?.placePrediction?.toPlace) {
          placeObj = ev.placePrediction.toPlace()
        }

        if (!placeObj) return

        await placeObj.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'types'],
        })

        const ac = Object.fromEntries(
          (placeObj.addressComponents || []).map(c => [c.types?.[0], { short: c.shortText, long: c.longText }])
        )

        const admin = {
          city: ac.locality?.long || ac.postal_town?.long || ac.sublocality?.long || '',
          county: ac.administrative_area_level_2?.long || '',
          state: ac.administrative_area_level_1?.long || '',
          stateCode: ac.administrative_area_level_1?.short || '',
          country: ac.country?.long || '',
          countryCode: ac.country?.short || '',
        }

        const loc = placeObj.location
        
        // Only proceed if we have a valid location
        if (loc) {
          onSelect?.({
            name: placeObj.displayName,
            address: placeObj.formattedAddress,
            location: { lat: loc.lat(), lng: loc.lng() },
            admin,
            types: placeObj.types || [],
          })
        } else {
          console.error('Place has no location data')
        }
      } catch (err) {
        console.error('Place selection error:', err)
      }
    }

    loader.load().then(async (google) => {
      if (!isMounted || !hostRef.current) return
      await google.maps.importLibrary('places')

      const el = new google.maps.places.PlaceAutocompleteElement()
      el.className = 'search-input'
      hostRef.current.appendChild(el)
      elRef.current = el

      // Listen to BOTH events for maximum compatibility
      el.addEventListener('gmp-placeselect', handleSelect)
      el.addEventListener('gmp-select', handleSelect)
    }).catch(err => console.error('Maps loader error:', err))

    return () => {
      isMounted = false
      if (elRef.current) {
        elRef.current.removeEventListener('gmp-placeselect', handleSelect)
        elRef.current.removeEventListener('gmp-select', handleSelect)
      }
      if (elRef.current && hostRef.current?.contains(elRef.current)) {
        hostRef.current.removeChild(elRef.current)
      }
      elRef.current = null
    }
  }, [onSelect])

  return <div ref={hostRef} className="search" aria-label="Search a place" />
}
