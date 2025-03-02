import { useState, useEffect } from "react";
import { Equipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface Review {
  rating: number;
  // Add other review properties as needed
}

interface EquipmentComparisonProps {
  equipmentIds: number[];
  onRemove: (id: number) => void;
}

export function EquipmentComparison({ equipmentIds, onRemove }: EquipmentComparisonProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: equipmentList, isLoading } = useQuery<Equipment[]>({
    queryKey: ['/api/equipment', 'comparison', equipmentIds],
    queryFn: async () => {
      if (equipmentIds.length === 0) return [];

      const responses = await Promise.all(
        equipmentIds.map(id =>
          fetch(`/api/equipment/${id}`, { credentials: 'include' })
            .then(res => res.json())
        )
      );
      return responses;
    },
    enabled: equipmentIds.length > 0
  });

  // Fetch reviews for each equipment
  const { data: reviewsMap } = useQuery<Record<number, Review[]>>({
    queryKey: ['/api/equipment/reviews', equipmentIds],
    queryFn: async () => {
      if (equipmentIds.length === 0) return {};

      const reviewsResponses = await Promise.all(
        equipmentIds.map(id =>
          fetch(`/api/equipment/${id}/reviews`, { credentials: 'include' })
            .then(res => res.json())
        )
      );

      return equipmentIds.reduce((acc, id, index) => {
        acc[id] = reviewsResponses[index] || [];
        return acc;
      }, {} as Record<number, Review[]>);
    },
    enabled: equipmentIds.length > 0
  });

  const getAverageRating = (equipmentId: number) => {
    const reviews = reviewsMap?.[equipmentId] || [];
    if (reviews.length === 0) return 0;
    return reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipmentIds.map((_, index) => (
            <Card key={index} className="w-full">
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full mb-4" />
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!equipmentList || equipmentList.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">
            {t('comparison.noEquipment')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipmentList?.map((equipment) => (
          <Card key={equipment.id} className={`relative ${!equipment.availability ? 'opacity-75' : ''}`}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10"
              onClick={() => onRemove(equipment.id)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="relative w-full h-48">
              <img
                src={equipment.imageUrl || "/placeholder-image.jpg"}
                alt={equipment.name}
                className="w-full h-full object-cover rounded-t-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes('placeholder-image.jpg')) {
                    target.src = "/placeholder-image.jpg";
                  }
                }}
              />
            </div>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-2">{equipment.name}</h3>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(getAverageRating(equipment.id))
                          ? "text-yellow-400 fill-current"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  ({reviewsMap?.[equipment.id]?.length || 0})
                </span>
              </div>
              <Badge
                variant={equipment.availability ? "success" : "destructive"}
                className="mb-2"
              >
                {equipment.availability
                  ? t('equipment.available')
                  : t('equipment.unavailable')}
              </Badge>
              <p className="text-xl font-semibold mb-4">
                ₹{equipment.dailyRate}{t('equipment.dailyRate')}
              </p>
              <Button
                className="w-full"
                variant={equipment.availability ? "default" : "secondary"}
                disabled={!equipment.availability}
                onClick={() => setLocation(`/equipment/${equipment.id}`)}
              >
                {equipment.availability
                  ? t('equipment.viewDetails')
                  : t('equipment.unavailable')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('comparison.feature')}</TableHead>
            {equipmentList.map((equipment) => (
              <TableHead key={equipment.id}>{equipment.name}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">
              {t('equipment.category')}
            </TableCell>
            {equipmentList.map((equipment) => (
              <TableCell key={equipment.id}>{equipment.category}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">
              {t('equipment.location')}
            </TableCell>
            {equipmentList.map((equipment) => (
              <TableCell key={equipment.id}>{equipment.location}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">
              {t('equipment.dailyRate')}
            </TableCell>
            {equipmentList.map((equipment) => (
              <TableCell key={equipment.id}>₹{equipment.dailyRate}</TableCell>
            ))}
          </TableRow>
          {Object.keys(equipmentList[0]?.specs || {}).map((spec) => (
            <TableRow key={spec}>
              <TableCell className="font-medium">
                {t(`equipment.specs.${spec}`, spec)}
              </TableCell>
              {equipmentList.map((equipment) => (
                <TableCell key={equipment.id}>
                  {equipment.specs?.[spec] || '-'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}