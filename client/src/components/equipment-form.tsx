import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import EquipmentFormMap from './equipment-form-map';
import { Equipment } from '@shared/schema';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';

// Equipment form schema
const equipmentFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.string().min(1, 'Category is required'),
  dailyRate: z.number().min(1, 'Daily rate must be at least 1'),
  location: z.string().min(1, 'Location is required'),
  image: z.any().optional(),
  features: z.array(z.string()).optional(),
  specs: z.record(z.string(), z.string()).optional(),
  latitudeCoord: z.number().optional(),
  longitudeCoord: z.number().optional(),
});

type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

interface EquipmentFormProps {
  equipment?: Equipment;
  onSubmit: (data: FormData) => Promise<void>;
  isSubmitting?: boolean;
}

const categories = [
  'Tractors & Harvesters',
  'Combine Harvesters',
  'Seeding Equipment',
  'Ploughs & Tillers',
  'Spraying Equipment',
  'Cultivators',
  'Threshers',
  'Irrigation',
  'Combine Equipment',
  'Rotavators',
];

export function EquipmentForm({ equipment, onSubmit, isSubmitting = false }: EquipmentFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(equipment?.imageUrl || null);
  const [featureInput, setFeatureInput] = useState('');
  const [features, setFeatures] = useState<string[]>(equipment?.features || []);
  const [specs, setSpecs] = useState<Record<string, string>>(equipment?.specs || {});
  const [specKey, setSpecKey] = useState('');
  const [specValue, setSpecValue] = useState('');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(
    equipment?.latitudeCoord && equipment?.longitudeCoord
      ? { lat: parseFloat(equipment.latitudeCoord), lng: parseFloat(equipment.longitudeCoord) }
      : null
  );

  // Initialize the form
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: equipment?.name || '',
      description: equipment?.description || '',
      category: equipment?.category || '',
      dailyRate: equipment?.dailyRate || 0,
      location: equipment?.location || '',
      features: equipment?.features || [],
      specs: equipment?.specs || {},
      latitudeCoord: equipment?.latitudeCoord ? parseFloat(equipment.latitudeCoord) : undefined,
      longitudeCoord: equipment?.longitudeCoord ? parseFloat(equipment.longitudeCoord) : undefined,
    },
  });

  // Handle image change
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle feature input
  const handleAddFeature = () => {
    if (featureInput.trim() && !features.includes(featureInput.trim())) {
      setFeatures([...features, featureInput.trim()]);
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feature: string) => {
    setFeatures(features.filter(f => f !== feature));
  };

  // Handle spec input
  const handleAddSpec = () => {
    if (specKey.trim() && specValue.trim()) {
      setSpecs({
        ...specs,
        [specKey.trim()]: specValue.trim()
      });
      setSpecKey('');
      setSpecValue('');
    }
  };

  const handleRemoveSpec = (key: string) => {
    const newSpecs = { ...specs };
    delete newSpecs[key];
    setSpecs(newSpecs);
  };

  // Handle map location selection
  const handleLocationSelect = (lat: number, lng: number) => {
    console.log('Location coordinates selected:', lat, lng);
    form.setValue('latitudeCoord', lat);
    form.setValue('longitudeCoord', lng);
    setCoordinates({lat, lng});
  };

  // Listen for location changes from the map component
  useEffect(() => {
    const handleLocationEvent = (event: any) => {
      if (event.detail) {
        console.log('Location selected event:', event.detail);
        if (event.detail.locationName) {
          form.setValue('location', event.detail.locationName);
        }
        if (event.detail.coordinates) {
          form.setValue('latitudeCoord', event.detail.coordinates.lat);
          form.setValue('longitudeCoord', event.detail.coordinates.lng);
          setCoordinates(event.detail.coordinates);
        }
      }
    };
    window.addEventListener('locationSelected', handleLocationEvent);
    return () => window.removeEventListener('locationSelected', handleLocationEvent);
  }, [form]);

  // Handle form submission
  const handleSubmit = async (values: EquipmentFormValues) => {
    const formData = new FormData();

    // Add basic fields
    formData.append('name', values.name);
    formData.append('description', values.description);
    formData.append('category', values.category);
    formData.append('dailyRate', values.dailyRate.toString());
    formData.append('location', values.location);

    // Add image if available
    const imageInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (imageInput?.files?.[0]) {
      formData.append('image', imageInput.files[0]);
    }

    // Add features
    formData.append('features', JSON.stringify(features));

    // Add specs
    formData.append('specs', JSON.stringify(specs));

    // Add coordinates if available
    if (coordinates) {
      formData.append('latitudeCoord', coordinates.lat.toString());
      formData.append('longitudeCoord', coordinates.lng.toString());
    } else if (values.location) {
        // Try to get coordinates from the city map if user entered a location but didn't select on map
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

        const locationKey = values.location.toLowerCase().trim();
        const coordinates = cityCoordinates[locationKey];

        if (coordinates) {
          formData.append('latitudeCoord', coordinates[0].toString());
          formData.append('longitudeCoord', coordinates[1].toString());
          console.log('Adding coordinates for location from city map:', locationKey, coordinates);
        }
      }


    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        variant: "destructive",
        title: t('common.error', 'Error'),
        description: t('equipment.submissionError', 'Failed to submit equipment data.'),
      });
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>
          {equipment ? t('equipment.edit', 'Edit Equipment') : t('equipment.add', 'Add New Equipment')}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('equipment.name', 'Equipment Name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('equipment.namePlaceholder', 'Enter equipment name')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('equipment.category', 'Category')}</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('equipment.selectCategory', 'Select a category')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map(category => (
                          <SelectItem key={category} value={category}>
                            {t(`categories.${category.toLowerCase().replace(/[^a-z0-9]/g, '')}`, category)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dailyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('equipment.dailyRate', 'Daily Rate (₹)')}</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1000" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('equipment.location', 'Location')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('equipment.locationPlaceholder', 'Enter city or location')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('equipment.description', 'Description')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t('equipment.descriptionPlaceholder', 'Describe the equipment, its capabilities, and condition')} 
                      {...field} 
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image Upload */}
            <div>
              <FormLabel>{t('equipment.image', 'Equipment Image')}</FormLabel>
              <div className="mt-2">
                <Input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageChange} 
                />
              </div>

              {imagePreview && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">{t('equipment.preview', 'Preview:')}</p>
                  <div className="w-full max-w-md h-48 rounded-md overflow-hidden">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}
            </div>

            {/* Features */}
            <div>
              <FormLabel>{t('equipment.features', 'Features')}</FormLabel>
              <div className="flex space-x-2 mt-2">
                <Input 
                  placeholder={t('equipment.featurePlaceholder', 'Add a feature (e.g., "GPS Equipped")')}
                  value={featureInput}
                  onChange={(e) => setFeatureInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFeature())}
                />
                <Button type="button" onClick={handleAddFeature}>
                  {t('common.add', 'Add')}
                </Button>
              </div>

              {features.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {features.map(feature => (
                    <Badge key={feature} className="flex items-center space-x-1">
                      <span>{feature}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveFeature(feature)}
                        className="h-4 w-4 rounded-full hover:bg-primary-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Specifications */}
            <div>
              <FormLabel>{t('equipment.specs', 'Specifications')}</FormLabel>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                <Input 
                  placeholder={t('equipment.specKeyPlaceholder', 'Spec name (e.g., "Engine")')}
                  value={specKey}
                  onChange={(e) => setSpecKey(e.target.value)}
                />
                <Input 
                  placeholder={t('equipment.specValuePlaceholder', 'Value (e.g., "V8 Diesel")')}
                  value={specValue}
                  onChange={(e) => setSpecValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpec())}
                />
                <Button type="button" onClick={handleAddSpec}>
                  {t('common.add', 'Add')}
                </Button>
              </div>

              {Object.keys(specs).length > 0 && (
                <div className="mt-4">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-sm p-2 bg-muted">{t('equipment.specName', 'Specification')}</th>
                        <th className="text-left text-sm p-2 bg-muted">{t('equipment.specValue', 'Value')}</th>
                        <th className="text-right text-sm p-2 bg-muted">{t('common.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(specs).map(([key, value]) => (
                        <tr key={key} className="border-b">
                          <td className="p-2">{key}</td>
                          <td className="p-2">{value}</td>
                          <td className="p-2 text-right">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleRemoveSpec(key)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Map for Location Selection */}
            <div>
              <FormLabel>{t('equipment.mapLocation', 'Map Location')}</FormLabel>
              <FormDescription>
                {t('equipment.mapLocationDesc', 'Select the exact location on the map where the equipment is available')}
              </FormDescription>

              <div className="mt-2">
                <EquipmentFormMap 
                  initialLocation={coordinates}
                  onLocationSelect={handleLocationSelect}
                />
              </div>

              {coordinates && (
                <p className="text-sm text-muted-foreground mt-2">
                  {t('equipment.coordinatesSelected', 'Coordinates selected')}: {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                </p>
              )}
            </div>

            <CardFooter className="flex justify-end gap-2 px-0">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common.submitting', 'Submitting...') : (
                  equipment ? t('common.update', 'Update') : t('common.create', 'Create')
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}