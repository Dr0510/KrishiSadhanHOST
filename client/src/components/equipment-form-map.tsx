
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationMapProps {
  initialLocation?: { lat: number; lng: number } | null;
  onLocationSelect: (lat: number, lng: number) => void;
}

// Fix Leaflet icon issue
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = defaultIcon;

function LocationPicker({ onLocationSelect }: { onLocationSelect: (latLng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
}

export default function EquipmentFormMap({ initialLocation, onLocationSelect }: LocationMapProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(initialLocation || null);
  const [isLocating, setIsLocating] = useState(false);
  
  // Center the map on India if no initial location
  const defaultCenter: [number, number] = [20.5937, 78.9629];
  const mapRef = useRef<L.Map | null>(null);

  const handleMapClick = (latLng: L.LatLng) => {
    const newLocation = { lat: latLng.lat, lng: latLng.lng };
    setMarker(newLocation);
    onLocationSelect(newLocation.lat, newLocation.lng);
    
    // Try to find nearest city for user reference
    fetchNearestLocation(newLocation.lat, newLocation.lng)
      .then(locationName => {
        if (locationName) {
          toast({
            title: t('equipment.locationSelected', 'Location Selected'),
            description: t('equipment.nearCity', 'Near: {{city}}', { city: locationName }),
          });
        }
      });
  };

  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          setMarker(newLocation);
          onLocationSelect(newLocation.lat, newLocation.lng);
          
          if (mapRef.current) {
            mapRef.current.flyTo([newLocation.lat, newLocation.lng], 13);
          }
          
          setIsLocating(false);
          
          fetchNearestLocation(newLocation.lat, newLocation.lng)
            .then(locationName => {
              if (locationName) {
                toast({
                  title: t('equipment.locationDetected', 'Location Detected'),
                  description: t('equipment.nearCity', 'Near: {{city}}', { city: locationName }),
                });
              }
            });
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast({
            variant: "destructive",
            title: t('common.error', 'Error'),
            description: t('equipment.locationError', 'Could not detect your location. Please select manually.'),
          });
          setIsLocating(false);
        }
      );
    } else {
      toast({
        variant: "destructive",
        title: t('common.error', 'Error'),
        description: t('equipment.browserLocationNotSupported', 'Geolocation is not supported by your browser.'),
      });
      setIsLocating(false);
    }
  };

  // Helper function to find nearest city/location name
  const fetchNearestLocation = async (lat: number, lng: number): Promise<string | null> => {
    try {
      // This is a simple implementation using predefined city coordinates
      // In a production app, you might want to use a reverse geocoding API
      const cityCoordinates = {
        'pune': [18.5204, 73.8567],
        'mumbai': [19.0760, 72.8777],
        'delhi': [28.6139, 77.2090],
        'bangalore': [12.9716, 77.5946],
        'hyderabad': [17.3850, 78.4867],
        'chennai': [13.0827, 80.2707],
        'kolkata': [22.5726, 88.3639],
        'ahmedabad': [23.0225, 72.5714],
        'latur': [18.4088, 76.5604],
        'nilanga': [18.1177, 76.7506],
        'aurangabad': [19.8762, 75.3433],
        'nagpur': [21.1458, 79.0882],
        'nashik': [19.9975, 73.7898],
        'barshi': [18.2333, 75.6833],
      };
      
      let nearestCity = null;
      let shortestDistance = Infinity;
      
      Object.entries(cityCoordinates).forEach(([city, [cityLat, cityLng]]) => {
        const distance = Math.sqrt(
          Math.pow(lat - cityLat, 2) + Math.pow(lng - cityLng, 2)
        );
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearestCity = city;
        }
      });
      
      return nearestCity ? nearestCity.charAt(0).toUpperCase() + nearestCity.slice(1) : null;
    } catch (error) {
      console.error('Error finding nearest location:', error);
      return null;
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">{t('equipment.selectLocation', 'Select Equipment Location')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('equipment.locationInstructions', 'Click on the map to select a location or use your current location.')}
          </p>
          <Button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="mb-4"
          >
            {isLocating ? t('common.detecting', 'Detecting...') : t('equipment.useCurrentLocation', 'Use My Current Location')}
          </Button>
        </div>
        
        <div className="h-[400px] relative border rounded-md overflow-hidden">
          <MapContainer
            center={initialLocation ? [initialLocation.lat, initialLocation.lng] : defaultCenter}
            zoom={initialLocation ? 13 : 5}
            style={{ height: '100%', width: '100%' }}
            whenCreated={(map) => {
              mapRef.current = map;
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationPicker onLocationSelect={handleMapClick} />
            {marker && (
              <Marker position={[marker.lat, marker.lng]} />
            )}
          </MapContainer>
        </div>
        
        {marker && (
          <div className="mt-4 text-sm">
            <p className="font-semibold">{t('equipment.selectedCoordinates', 'Selected Coordinates')}:</p>
            <p>
              {t('common.latitude', 'Latitude')}: {marker.lat.toFixed(6)}, {' '}
              {t('common.longitude', 'Longitude')}: {marker.lng.toFixed(6)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
