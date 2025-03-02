
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Equipment } from '@shared/schema';
import { MainNav } from '@/components/main-nav';
import { EquipmentForm } from '@/components/equipment-form';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

export default function EquipmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch equipment data
  const { 
    data: equipment, 
    isLoading, 
    isError, 
    error 
  } = useQuery<Equipment>({
    queryKey: [`/api/equipment/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/equipment/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch equipment');
      }
      return response.json();
    }
  });

  // Update equipment mutation
  const updateEquipment = useMutation({
    mutationFn: async (formData: FormData) => {
      setIsSubmitting(true);
      const response = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update equipment');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('equipment.updateSuccess', 'Equipment Updated'),
        description: t('equipment.updateSuccessDesc', 'Your equipment has been updated successfully.'),
      });
      navigate(`/equipment/${id}`);
      setIsSubmitting(false);
    },
    onError: (error) => {
      console.error('Error updating equipment:', error);
      toast({
        variant: "destructive",
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('equipment.updateError', 'Failed to update equipment'),
      });
      setIsSubmitting(false);
    }
  });

  const handleSubmit = async (formData: FormData) => {
    await updateEquipment.mutateAsync(formData);
  };

  if (isLoading) {
    return (
      <div>
        <MainNav />
        <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('common.loading', 'Loading...')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <MainNav />
        <div className="container mx-auto py-8">
          <div className="bg-destructive/10 p-4 rounded-md text-destructive text-center">
            <p>{error instanceof Error ? error.message : t('common.unknownError', 'An unknown error occurred')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MainNav />
      <div className="container mx-auto py-8">
        <EquipmentForm 
          equipment={equipment} 
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
