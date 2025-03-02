import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Equipment } from '@shared/schema';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, Navigation2, List, Map, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import L from 'leaflet';

interface MapViewProps {
  equipment?: Equipment[];
  center?: [number, number];
  zoom?: number;
  onMarkerClick?: (equipment: Equipment) => void;
  onLocationSelect?: (location: string) => void;
}

// Initialize city coordinates
const cityCoordinates: Record<string, [number, number]> = {
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
  'chh. sambhajinagar': [19.8762, 75.3433],
  'nagpur': [21.1458, 79.0882],
  'nashik': [19.9975, 73.7898],
  'barshi': [18.2333, 75.6833],
};

function MapEventHandler({ onLocationSelect }: { onLocationSelect?: (location: string) => void }) {
  useMapEvents({
    click: (e) => {
      const nearest = findNearestCity(e.latlng.lat, e.latlng.lng);
      if (nearest && onLocationSelect) {
        onLocationSelect(nearest);
      }
    }
  });
  return null;
}

const findNearestCity = (lat: number, lng: number): string | null => {
  let nearest = null;
  let minDistance = Infinity;

  Object.entries(cityCoordinates).forEach(([city, [cityLat, cityLng]]) => {
    const distance = Math.sqrt(
      Math.pow(lat - cityLat, 2) + Math.pow(lng - cityLng, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = city;
    }
  });

  return nearest;
};

export function MapView({
  equipment = [],
  center = [20.5937, 78.9629], // Center of India
  zoom = 5,
  onMarkerClick,
  onLocationSelect
}: MapViewProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLocating, setIsLocating] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [mapKey, setMapKey] = useState(0);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [isViewChanging, setIsViewChanging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  
  // Force map refresh when equipment data changes
  useEffect(() => {
    // Reset map key to force a refresh when equipment changes
    if (viewMode === 'map') {
      console.log("Equipment data changed, refreshing map markers", equipment.length);
      setMapKey(prev => prev + 1);
      setIsMapLoading(true);
      
      // Clear and rebuild markers cache on data change
      markersRef.current = {};
      
      // Log equipment locations for debugging
      equipment.forEach(item => {
        if (item.location) {
          console.log(`Equipment ${item.id}: ${item.name} - Location: ${item.location}, Coordinates: ${item.latitudeCoord},${item.longitudeCoord}`);
        }
      });
    }
  }, [equipment, viewMode]);
  
  // Add a specialized effect for checking location and coordinate changes
  useEffect(() => {
    // Create a "fingerprint" of equipment locations that includes both city locations and coordinates
    const locationFingerprint = equipment.map(item => 
      `${item.id}-${item.location}-${item.latitudeCoord}-${item.longitudeCoord}`
    ).join('|');
    
    // Force map refresh when any equipment's location or coordinates change
    if (viewMode === 'map') {
      console.log("Checking equipment location changes");
      setMapKey(prev => prev + 1);
      setIsMapLoading(true);
    }
  }, [equipment.map(item => `${item.id}-${item.location}-${item.latitudeCoord}-${item.longitudeCoord}`).join('|'), viewMode]);

  const createCustomIcon = useCallback((dailyRate: number) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div class="w-8 h-8 bg-primary rounded-full border-2 border-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform">
          <span class="text-white text-xs font-bold">₹${new Intl.NumberFormat('hi-IN').format(dailyRate)}</span>
        </div>
      `
    });
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const { offsetWidth, offsetHeight } = containerRef.current;
      if (offsetWidth === 0 || offsetHeight === 0) {
        console.warn('Map container has zero dimensions');
      }
    }
  }, []);

  const handleLocationClick = useCallback(async () => {
    if (!navigator.geolocation) {
      toast({
        title: t('map.locationError'),
        description: t('map.locationAccessDenied'),
        variant: "destructive"
      });
      return;
    }

    setIsLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;
      const nearest = findNearestCity(latitude, longitude);

      if (nearest && onLocationSelect) {
        onLocationSelect(nearest);
        toast({
          title: t('map.locationFound'),
          description: t('map.locationUpdated')
        });
      }
    } catch (error) {
      toast({
        title: t('map.locationError'),
        description: t('map.locationAccessDenied'),
        variant: "destructive"
      });
    } finally {
      setIsLocating(false);
    }
  }, [t, toast, onLocationSelect]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">{t('equipment.availableEquipment')}</h2>
        <div className="flex gap-2">
          {viewMode === 'map' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Clear all markers/locations
                if (onLocationSelect) {
                  onLocationSelect("");
                }
                setMapKey(k => k + 1);
                setIsMapLoading(true);
              }}
              className="flex items-center gap-2 hover:bg-primary/10 transition-all duration-300"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t('map.clear', 'Clear')}</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsViewChanging(true);
              setViewMode(prev => prev === 'map' ? 'list' : 'map');
              setMapKey(k => k + 1);
              setTimeout(() => setIsViewChanging(false), 500);
            }}
            className="flex items-center gap-2 hover:bg-secondary/10 transition-all duration-300"
          >
            {viewMode === 'map' ? (
              <>
                <List className="h-4 w-4" />
                <span>{t('map.listView')}</span>
              </>
            ) : (
              <>
                <Map className="h-4 w-4" />
                <span>{t('map.mapView')}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {isViewChanging ? (
        <div className="h-[600px] w-full flex items-center justify-center bg-card rounded-lg border">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">{t('common.loading')}</span>
        </div>
      ) : viewMode === 'map' ? (
        <div ref={containerRef} className="h-[600px] w-full relative bg-card rounded-lg overflow-hidden border">
          {isMapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">{t('map.loading')}</span>
            </div>
          )}
          <MapContainer
            key={mapKey}
            center={center}
            zoom={zoom}
            className="w-full h-full"
            whenReady={() => setIsMapLoading(false)}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap contributors'
            />
            <MapEventHandler onLocationSelect={onLocationSelect} />
            {equipment
              .filter(item => item.location)
              .map(item => {
                // First check if item has direct latitude/longitude
                let markerPosition: [number, number] | null = null;
                
                if (item.latitudeCoord && item.longitudeCoord) {
                  const lat = parseFloat(item.latitudeCoord);
                  const lng = parseFloat(item.longitudeCoord);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    markerPosition = [lat, lng];
                    console.log(`Using database coordinates for ${item.name}:`, markerPosition);
                  }
                }
                
                // If no coordinates, fall back to city map
                if (!markerPosition) {
                  // Clean and normalize location name before lookup
                  const locationName = item.location!.toLowerCase().trim();
                  
                  // Try direct match first
                  markerPosition = cityCoordinates[locationName];
                  
                  // If not found, try alternate lookups (partial matches)
                  if (!markerPosition) {
                    // Look for substring matches
                    for (const [city, coords] of Object.entries(cityCoordinates)) {
                      if (locationName.includes(city) || city.includes(locationName)) {
                        markerPosition = coords;
                        console.log(`Found partial location match for ${locationName}: using ${city} coordinates`);
                        break;
                      }
                    }
                  }
                  
                  if (markerPosition) {
                    console.log(`Using map coordinates for ${item.name}:`, markerPosition);
                  }
                }

                // If still no coordinates, use default position for India
                if (!markerPosition) {
                  markerPosition = [20.5937, 78.9629]; // Center of India as fallback
                  console.log(`Using default coordinates for ${item.name} at ${item.location}`);
                }

                return (
                  <Marker
                    key={item.id}
                    position={markerPosition}
                    icon={createCustomIcon(item.dailyRate)}
                    eventHandlers={{
                      click: () => onMarkerClick?.(item)
                    }}
                  >
                    <Popup>
                      <div className="p-3">
                        <h3 className="font-bold text-lg">{item.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {item.description}
                        </p>
                        <p className="text-sm font-semibold mt-2">
                          ₹{item.dailyRate}/day
                        </p>
                        <div className="mt-2">
                          <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                            item.availability
                              ? 'text-green-700 bg-green-100'
                              : 'text-red-700 bg-red-100'
                          }`}>
                            {item.availability ? t('equipment.available') : t('equipment.unavailable')}
                          </span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 right-4 z-[400] bg-white/90 shadow-lg hover:bg-white"
            onClick={handleLocationClick}
            disabled={isLocating}
          >
            {isLocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item, index) => (
            <Card 
              key={item.id} 
              className="p-4 equipment-card shadow-custom animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="aspect-video rounded-md overflow-hidden mb-4 relative">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                />
                <div className="absolute top-2 right-2">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    item.availability
                      ? 'text-green-700 bg-green-100'
                      : 'text-red-700 bg-red-100'
                  } ${item.availability ? 'animate-pulse-soft' : ''}`}>
                    {item.availability ? t('equipment.available') : t('equipment.unavailable')}
                  </span>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {item.description}
              </p>
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-primary text-lg">₹{new Intl.NumberFormat('hi-IN').format(item.dailyRate)}/day</span>
              </div>
              <Button
                className="w-full mt-2 transition-all duration-300 bg-primary hover:bg-primary/90"
                onClick={() => onMarkerClick?.(item)}
              >
                {t('equipment.viewDetails')}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}