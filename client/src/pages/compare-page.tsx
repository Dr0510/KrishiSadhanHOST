import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { EquipmentComparison } from "@/components/equipment-comparison";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MainNav } from "@/components/main-nav";

export default function ComparePage() {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: equipment, isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    enabled: true,
  });

  const filteredEquipment = equipment?.filter(
    (item) =>
      !selectedIds.includes(item.id) &&
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddToComparison = (equipmentId: number) => {
    if (selectedIds.length < 3) {
      setSelectedIds([...selectedIds, equipmentId]);
      setIsDialogOpen(false);
    }
  };

  const handleRemoveFromComparison = (equipmentId: number) => {
    setSelectedIds(selectedIds.filter((id) => id !== equipmentId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <MainNav />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">
            {t('comparison.title', 'Compare Equipment')}
          </h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={selectedIds.length >= 3}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('comparison.add', 'Add to Compare')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>
                  {t('comparison.select', 'Select Equipment to Compare')}
                </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder={t('comparison.search', 'Search by name, category, or location...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
                <ScrollArea className="h-[400px]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredEquipment?.map((item) => (
                      <Card key={item.id} className="cursor-pointer hover:bg-accent">
                        <CardContent
                          className="p-4 flex items-center gap-4"
                          onClick={() => handleAddToComparison(item.id)}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div>
                            <h3 className="font-semibold">{item.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {item.category} • {item.location}
                            </p>
                            <p className="text-sm font-medium">
                              ₹{item.dailyRate}/day
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {selectedIds.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-4">
                {t('comparison.empty', 'No Equipment Selected')}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t('comparison.emptyDescription', 'Select up to 3 equipment items to compare their features and specifications side by side.')}
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('comparison.start', 'Start Comparing')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EquipmentComparison
            equipmentIds={selectedIds}
            onRemove={handleRemoveFromComparison}
          />
        )}
      </div>
    </div>
  );
}