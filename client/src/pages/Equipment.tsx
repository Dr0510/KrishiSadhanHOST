import { useQuery } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import EquipmentCard from "@/components/EquipmentCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data: equipment, isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const filteredEquipment = equipment?.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                         item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || item.category === category;
    return matchesSearch && matchesCategory;
  });

  const categories = equipment ? 
    ["all", ...new Set(equipment.map(item => item.category))] : 
    ["all"];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Available Equipment</h1>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <Input
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
        
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="md:max-w-xs">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEquipment?.map(item => (
            <EquipmentCard key={item.id} equipment={item} />
          ))}
        </div>
      )}
    </div>
  );
}
