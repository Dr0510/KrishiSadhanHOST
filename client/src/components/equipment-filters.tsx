import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from "react-i18next";
import { X, RotateCcw, Search, MapPin, Tag, IndianRupee, Calendar, Ruler } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export interface FilterParams {
  search: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  location: string;
  radius?: number;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  specifications?: Record<string, any>;
}

interface EquipmentFiltersProps {
  onFilterChange: (filters: FilterParams) => void;
  maxPrice: number;
  isLoading?: boolean;
}

// Updated equipment categories with descriptive names and proper typing
const EQUIPMENT_CATEGORIES = [
  { id: "tractor", label: "Tractors & Harvesters" },
  { id: "harvester", label: "Combine Harvesters" },
  { id: "seeder", label: "Seeding Equipment" },
  { id: "irrigation", label: "Irrigation Systems" },
  { id: "plough", label: "Ploughs & Tillers" },
  { id: "sprayer", label: "Spraying Equipment" },
  { id: "cultivator", label: "Cultivators" },
  { id: "thresher", label: "Threshers" },
  { id: "combine", label: "Combine Equipment" },
  { id: "rotavator", label: "Rotavators" }
] as const;

const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' }
] as const;

export function EquipmentFilters({ onFilterChange, maxPrice, isLoading = false }: EquipmentFiltersProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterParams>(() => {
    const savedFilters = localStorage.getItem('equipmentFilters');
    return savedFilters ? JSON.parse(savedFilters) : {
      search: "",
      category: "all",
      minPrice: 0,
      maxPrice: Number.MAX_SAFE_INTEGER,
      location: "",
      radius: 50,
      season: undefined,
      specifications: {}
    };
  });

  // Initialize price range with proper validation and more precise steps
  const [priceRange, setPriceRange] = useState<[number, number]>(() => {
    const min = Math.max(0, filters.minPrice || 0);
    const max = Math.min(filters.maxPrice || maxPrice, maxPrice);
    return [min, max];
  });

  // Update price range when maxPrice changes with smooth transition
  useEffect(() => {
    setPriceRange(prev => {
      const [min, max] = prev;
      return [
        Math.min(min, maxPrice),
        Math.min(max, maxPrice)
      ];
    });
  }, [maxPrice]);

  useEffect(() => {
    localStorage.setItem('equipmentFilters', JSON.stringify(filters));
  }, [filters]);

  const handleFilterChange = (newFilters: Partial<FilterParams>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  // Enhanced price range change handler with debouncing
  const handlePriceRangeChange = (values: number[]) => {
    const [min, max] = values;
    // Ensure min is not greater than max
    const validMin = Math.min(min, max);
    const validMax = Math.max(min, max);

    setPriceRange([validMin, validMax]);
    handleFilterChange({
      minPrice: validMin,
      maxPrice: validMax
    });
  };

  const resetFilters = () => {
    const defaultFilters = {
      search: "",
      category: "all",
      minPrice: 0,
      maxPrice: maxPrice,
      location: "",
      radius: 50,
      season: undefined,
      specifications: {}
    };
    setFilters(defaultFilters);
    setPriceRange([0, maxPrice]);
    onFilterChange(defaultFilters);
    localStorage.removeItem('equipmentFilters');
  };

  // Improved step calculation for smoother slider movement
  const calculateStep = () => {
    if (maxPrice <= 100) return 1;
    if (maxPrice <= 1000) return 5;
    if (maxPrice <= 10000) return 50;
    return Math.max(50, Math.floor(maxPrice / 400)); // More granular steps
  };

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('filters.title', 'Search & Filters')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('filters.reset', 'Reset Filters')}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Search input */}
        <Card>
          <CardContent className="p-4">
            <Label className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4" />
              {t('filters.search', 'Search Equipment')}
            </Label>
            <div className="relative">
              <Input
                placeholder={t('filters.searchPlaceholder', 'Search by name or description...')}
                value={filters.search}
                onChange={(e) => handleFilterChange({ search: e.target.value })}
                className="pr-8"
              />
              {filters.search && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => handleFilterChange({ search: "" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category filter */}
        <Card>
          <CardContent className="p-4">
            <Label className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4" />
              {t('filters.category', 'Equipment Category')}
            </Label>
            <Select
              value={filters.category}
              onValueChange={(value) => handleFilterChange({ category: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('filters.allCategories', 'All Categories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('filters.allCategories', 'All Categories')}
                </SelectItem>
                {EQUIPMENT_CATEGORIES.map(({ id, label }) => (
                  <SelectItem key={id} value={id}>
                    {t(`categories.${id}`, label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Price range filter with improved UI */}
        <Card>
          <CardContent className="p-4">
            <Label className="flex items-center gap-2 mb-2">
              <IndianRupee className="h-4 w-4" />
              {t('filters.priceRange', 'Price Range (per day)')}
            </Label>
            <div className="pt-6 px-2"> {/* Added padding for better touch targets */}
              <Slider
                value={[priceRange[1] === Number.MAX_SAFE_INTEGER ? maxPrice : priceRange[1]]}
                min={0}
                max={maxPrice}
                step={calculateStep()}
                onValueChange={([value]) => handlePriceRangeChange([0, value])}
                className="mb-2"
              />
              <div className="flex justify-between text-sm text-muted-foreground mt-4">
                <span>{formatPrice(0)}</span>
                <span>Maximum: {formatPrice(priceRange[1] === Number.MAX_SAFE_INTEGER ? maxPrice : priceRange[1])}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location and Radius filter */}
        <Card>
          <CardContent className="p-4">
            <Label className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4" />
              {t('filters.location', 'Location')}
            </Label>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  placeholder={t('filters.locationPlaceholder', 'Enter location...')}
                  value={filters.location}
                  onChange={(e) => handleFilterChange({ location: e.target.value })}
                  className="pr-8"
                />
                {filters.location && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => handleFilterChange({ location: "" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  {t('filters.radius', 'Search Radius (km)')}
                </Label>
                <Slider
                  value={[filters.radius || 50]}
                  min={1}
                  max={200}
                  step={1}
                  onValueChange={([value]) => handleFilterChange({ radius: value })}
                  className="mb-2"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>1 km</span>
                  <span>{filters.radius} km</span>
                  <span>200 km</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seasonal Availability */}
        <Card>
          <CardContent className="p-4">
            <Label className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4" />
              {t('filters.seasonal', 'Seasonal Availability')}
            </Label>
            <div className="grid grid-cols-2 gap-4">
              {SEASONS.map(({ id, label }) => (
                <div key={id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`season-${id}`}
                    checked={filters.season === id}
                    onCheckedChange={(checked) =>
                      handleFilterChange({ season: checked ? id : undefined })
                    }
                  />
                  <label
                    htmlFor={`season-${id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t(`seasons.${id}`, label)}
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}