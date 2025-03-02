import { motion } from "framer-motion";
import { Calendar, DollarSign } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Equipment } from "@shared/schema";
import { Link } from "wouter";

interface EquipmentCardProps {
  equipment: Equipment;
}

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden">
        <div className="aspect-video relative">
          <img 
            src={equipment.imageUrl} 
            alt={equipment.name}
            className="object-cover w-full h-full"
          />
          {!equipment.available && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Badge variant="destructive" className="text-lg">
                Currently Unavailable
              </Badge>
            </div>
          )}
        </div>
        
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">{equipment.name}</h3>
              <p className="text-muted-foreground">{equipment.category}</p>
            </div>
            <div className="flex items-center text-primary">
              <DollarSign className="h-4 w-4" />
              <span className="font-semibold">{equipment.dailyRate}/day</span>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            {equipment.description}
          </p>
        </CardContent>
        
        <CardFooter className="p-6 pt-0">
          <Link href={`/rent/${equipment.id}`}>
            <Button 
              className="w-full"
              disabled={!equipment.available}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Rent Now
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
