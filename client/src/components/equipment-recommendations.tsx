import { useQuery } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface EquipmentRecommendationsProps {
  userId: number;
}

export function EquipmentRecommendations({ userId }: EquipmentRecommendationsProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: recommendations, isLoading } = useQuery<{
    equipment: Equipment;
    score: number;
    reason: string;
  }[]>({
    queryKey: ['/api/recommendations', userId],
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            {t('recommendations.empty', 'No recommendations available yet. Start browsing equipment to get personalized suggestions!')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">
        {t('recommendations.title', 'Recommended for You')}
      </h2>
      <ScrollArea className="w-full whitespace-nowrap rounded-md border">
        <div className="flex w-max space-x-4 p-4">
          {recommendations.map(({ equipment, score, reason }) => (
            <Card 
              key={equipment.id} 
              className="w-[300px] flex-none"
            >
              <div className="relative">
                <img
                  src={equipment.imageUrl}
                  alt={equipment.name}
                  className="w-full h-48 object-cover rounded-t-lg"
                />
                <Badge 
                  className="absolute top-2 right-2" 
                  variant="secondary"
                >
                  {Math.round(score)}% {t('recommendations.match', 'Match')}
                </Badge>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold truncate">{equipment.name}</h3>
                <p className="text-sm text-muted-foreground mb-2">{reason}</p>
                <p className="text-lg font-semibold mb-4">
                  ₹{equipment.dailyRate}/day
                </p>
                <Button 
                  className="w-full"
                  onClick={() => setLocation(`/equipment/${equipment.id}`)}
                >
                  {t('equipment.viewDetails', 'View Details')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
