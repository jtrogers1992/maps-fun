import * as React from 'react'
const { useEffect, useRef } = React
import { Loader } from '@googlemaps/js-api-loader'

export default function Map(props) {
  // Defensive check for props
  const place = props?.place || null;
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const googleRef = useRef(null)
  const mapObjRef = useRef(null)

  useEffect(() => {
    try {
      // Check if API key is available
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('Google Maps API key is missing');
        return;
      }
      
      const loader = new Loader({
        apiKey,
        libraries: ['places'],
      });

      let isMounted = true;
      loader.load().then((google) => {
        if (!isMounted) return;
        try {
          googleRef.current = google;
          if (!mapRef.current) {
            console.error('Map reference is not available');
            return;
          }
          mapObjRef.current = new google.maps.Map(mapRef.current, {
            center: { lat: 41.8781, lng: -87.6298 }, // Chicago default
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
          });
        } catch (innerErr) {
          console.error('Error initializing map:', innerErr);
        }
      }).catch(err => console.error('Maps loader error:', err));
    } catch (outerErr) {
      console.error('Unexpected error in Map component:', outerErr);
    }

    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    try {
      // Comprehensive checks
      if (!place) {
        console.log('No place data available');
        return;
      }
      if (!googleRef.current) {
        console.log('Google Maps API not loaded yet');
        return;
      }
      if (!mapObjRef.current) {
        console.log('Map not initialized yet');
        return;
      }
      if (!place.location) {
        console.log('Place has no location data');
        return;
      }
      
      const { lat, lng } = place.location;
      
      // Validate lat/lng values
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.error('Invalid lat/lng values:', lat, lng);
        return;
      }
      
      if (!markerRef.current) {
        markerRef.current = new googleRef.current.maps.Marker({
          map: mapObjRef.current,
          position: { lat, lng },
        });
      } else {
        markerRef.current.setPosition({ lat, lng });
      }
      mapObjRef.current.setCenter({ lat, lng });
      mapObjRef.current.setZoom(14);
    } catch (err) {
      console.error('Error updating map marker:', err);
    }
  }, [place])

  return <div id="map" ref={mapRef} role="region" aria-label="Map" />
}
