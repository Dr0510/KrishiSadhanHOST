import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, XCircle, Map, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/main-nav";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EquipmentFilters, FilterParams } from "@/components/equipment-filters";
import { MapView } from "@/components/map-view";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";

export default function EquipmentListPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterParams>({
    search: "",
    category: "all",
    minPrice: 0,
    maxPrice: 100000,
    location: "",
    radius: 50,
  });
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [imageVersions, setImageVersions] = useState<Record<number, number>>({});

  const { data: equipment, isLoading, error, refetch } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    staleTime: 0,
    refetchOnMount: true
  });

  // Filter equipment based on all criteria
  const filteredEquipment = useMemo(() => {
    if (!equipment) return [];

    return equipment.filter((item) => {
      const matchesSearch =
        filters.search === "" ||
        item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.description.toLowerCase().includes(filters.search.toLowerCase());

      const matchesCategory =
        filters.category === "all" ||
        item.category.toLowerCase() === filters.category.toLowerCase();

      const matchesPrice =
        item.dailyRate >= filters.minPrice && item.dailyRate <= filters.maxPrice;

      const matchesLocation =
        filters.location === "" ||
        item.location.toLowerCase() === filters.location.toLowerCase();

      const matchesSeason = !filters.season || 
        (item.seasonalAvailability && item.seasonalAvailability[filters.season]);

      return matchesSearch && matchesCategory && matchesPrice && matchesLocation && matchesSeason;
    });
  }, [equipment, filters]);

  // Handle location selection from map
  const handleLocationSelect = (location: string) => {
    setFilters(prev => ({
      ...prev,
      location: location.charAt(0).toUpperCase() + location.slice(1)
    }));

    toast({
      title: t('filters.locationUpdated'),
      description: t('filters.locationFilterApplied', { location: location.charAt(0).toUpperCase() + location.slice(1) })
    });
  };

  // Handle marker click in map view
  const handleMarkerClick = (equipment: Equipment) => {
    if (equipment.id) {
      window.location.href = `/equipment/${equipment.id}`;
    }
  };

  // Reset image versions when equipment changes
  useEffect(() => {
    if (equipment) {
      const versions: Record<number, number> = {};
      equipment.forEach(item => {
        versions[item.id] = 0;
      });
      setImageVersions(versions);
    }
  }, [equipment]);

  // Image refresh handler
  const refreshImage = (equipmentId: number) => {
    setImageVersions(prev => ({
      ...prev,
      [equipmentId]: (prev[equipmentId] || 0) + 1
    }));
  };

  if (isLoading) {
    return (
      <div>
        <MainNav />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <MainNav />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("common.loadError")}</AlertDescription>
          </Alert>
          <Button onClick={() => refetch()} variant="outline" className="mt-4">
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MainNav />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">
            {t("equipment.availableEquipment")}
          </h1>
          <ToggleGroup type="single" value={viewMode} onValueChange={(value: "list" | "map") => setViewMode(value)}>
            <ToggleGroupItem value="list" aria-label={t("view.list")}>
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label={t("view.map")}>
              <Map className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3">
            <EquipmentFilters
              onFilterChange={setFilters}
              maxPrice={Math.max(...(equipment?.map(item => item.dailyRate) || [100000]))}
              isLoading={isLoading}
            />
          </div>

          <div className="col-span-12 lg:col-span-9">
            {viewMode === "map" ? (
              <MapView 
                equipment={filteredEquipment}
                onMarkerClick={handleMarkerClick}
                onLocationSelect={handleLocationSelect}
              />
            ) : (
              filteredEquipment && filteredEquipment.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEquipment.map((item) => (
                    <Card key={item.id} className={`relative ${!item.availability ? "opacity-75" : ""}`}>
                      <Badge
                        variant={item.availability ? "success" : "destructive"}
                        className="absolute top-2 right-2 z-10"
                      >
                        {item.availability ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {t("equipment.available")}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-1" />
                            {t("equipment.unavailable")}
                          </>
                        )}
                      </Badge>
                      <div className="relative w-full h-48">
                        <img
                          src={`${item.imageUrl || "/placeholder-image.jpg"}?v=${imageVersions[item.id] || 0}`}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (!target.src.includes('placeholder-image.jpg')) {
                              target.src = "/placeholder-image.jpg";
                              refreshImage(item.id);
                            }
                          }}
                        />
                      </div>
                      <CardContent className="p-4">
                        <h2 className="text-xl font-semibold mb-2">{item.name}</h2>
                        <p className="text-muted-foreground mb-4">
                          {item.description.slice(0, 100)}...
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-medium">
                            ₹{item.dailyRate.toLocaleString('en-IN')} {t("equipment.perDay")}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {item.location}
                          </span>
                        </div>
                      </CardContent>
                      <CardFooter className="p-4 pt-0">
                        <Button
                          asChild
                          className="w-full"
                          variant={item.availability ? "default" : "secondary"}
                          disabled={!item.availability}
                        >
                          <Link to={`/equipment/${item.id}`}>
                            {item.availability
                              ? t("equipment.viewDetails")
                              : t("equipment.unavailable")}
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {t("equipment.noEquipment")}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}