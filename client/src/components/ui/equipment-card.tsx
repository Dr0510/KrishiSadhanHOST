import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Equipment } from "@shared/schema";
import { useLocation } from "wouter";

interface EquipmentCardProps {
  equipment: Equipment;
}

export function EquipmentCard({ equipment }: EquipmentCardProps) {
  const [, setLocation] = useLocation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className="overflow-hidden">
        <div className="aspect-[16/9] relative">
          <img
            src={equipment.imageUrl}
            alt={equipment.name}
            className="object-cover w-full h-full"
          />
          {!equipment.available && (
            <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-md text-sm">
              Not Available
            </div>
          )}
        </div>
        <CardHeader>
          <CardTitle className="text-xl text-primary">{equipment.name}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {equipment.category}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 line-clamp-2">
            {equipment.description}
          </p>
          <p className="mt-4 text-lg font-semibold">
            ${equipment.dailyRate}/day
          </p>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            disabled={!equipment.available}
            onClick={() => setLocation(`/equipment/${equipment.id}`)}
          >
            {equipment.available ? "Rent Now" : "Currently Unavailable"}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}