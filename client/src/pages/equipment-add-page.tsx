
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { MainNav } from '@/components/main-nav';
import { EquipmentForm } from '@/components/equipment-form';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function EquipmentAddPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create equipment mutation
  const createEquipment = useMutation({
    mutationFn: async (formData: FormData) => {
      setIsSubmitting(true);
      const response = await fetch('/api/equipment', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create equipment');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('equipment.createSuccess', 'Equipment Created'),
        description: t('equipment.createSuccessDesc', 'Your equipment has been created successfully.'),
      });
      navigate(`/equipment/${data.equipment.id}`);
      setIsSubmitting(false);
    },
    onError: (error) => {
      console.error('Error creating equipment:', error);
      toast({
        variant: "destructive",
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('equipment.createError', 'Failed to create equipment'),
      });
      setIsSubmitting(false);
    }
  });

  const handleSubmit = async (formData: FormData) => {
    await createEquipment.mutateAsync(formData);
  };

  return (
    <div>
      <MainNav />
      <div className="container mx-auto py-8">
        <EquipmentForm 
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
