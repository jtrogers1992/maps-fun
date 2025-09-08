import * as React from 'react'
const { useEffect, useRef } = React
import { Loader } from '@googlemaps/js-api-loader'

export default function SearchBox(props) {
  // Defensive check for props
  const onSelect = props?.onSelect || (() => {});
  const hostRef = useRef(null)
  const elRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    const loader = new Loader({ apiKey, libraries: ['places'] })

    const handleSelect = async (ev) => {
      try {
        console.log('Place selection event received:', ev);
        let placeObj = null;

        // Newer event shape: gmp-placeselect -> ev.detail.place
        if (ev?.detail?.place) {
          console.log('Using ev.detail.place');
          placeObj = ev.detail.place;
        }
        // Older/alternate: gmp-select -> ev.detail.placePrediction.toPlace()
        else if (ev?.detail?.placePrediction?.toPlace) {
          console.log('Using ev.detail.placePrediction.toPlace()');
          placeObj = await ev.detail.placePrediction.toPlace();
        }
        // Some browsers bubble placePrediction at top-level
        else if (ev?.placePrediction?.toPlace) {
          console.log('Using ev.placePrediction.toPlace()');
          placeObj = await ev.placePrediction.toPlace();
        }

        if (!placeObj) {
          console.error('No place object found in event');
          return;
        }

        console.log('Place object before fetching fields:', placeObj);
        
        try {
          await placeObj.fetchFields({
            fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'types'],
          });
        } catch (fetchError) {
          console.error('Error fetching place fields:', fetchError);
          return;
        }
        
        console.log('Place object after fetching fields:', placeObj);

        // Safely extract address components
        const addressComponents = placeObj.addressComponents || [];
        const ac = {};
        
        try {
          // More defensive approach to building address components
          for (const component of addressComponents) {
            if (component && component.types && component.types.length > 0) {
              ac[component.types[0]] = { 
                short: component.shortText || '', 
                long: component.longText || '' 
              };
            }
          }
        } catch (acError) {
          console.error('Error processing address components:', acError);
        }

        const admin = {
          city: ac.locality?.long || ac.postal_town?.long || ac.sublocality?.long || '',
          county: ac.administrative_area_level_2?.long || '',
          state: ac.administrative_area_level_1?.long || '',
          stateCode: ac.administrative_area_level_1?.short || '',
          country: ac.country?.long || '',
          countryCode: ac.country?.short || '',
        };

        console.log('Admin object:', admin);
        
        const loc = placeObj.location;
        console.log('Location object:', loc);
        
        // Only proceed if we have a valid location
        if (loc && typeof loc.lat === 'function' && typeof loc.lng === 'function') {
          const lat = loc.lat();
          const lng = loc.lng();
          
          // Validate lat/lng values
          if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            console.error('Invalid lat/lng values:', lat, lng);
            return;
          }
          
          const placeData = {
            name: placeObj.displayName || '',
            address: placeObj.formattedAddress || '',
            location: { lat, lng },
            admin,
            types: placeObj.types || [],
          };
          
          console.log('Calling onSelect with place data:', placeData);
          onSelect?.(placeData);
        } else {
          console.error('Place has no valid location data');
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
