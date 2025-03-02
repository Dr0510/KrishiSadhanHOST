import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/main-nav";
import { Footer } from "@/components/footer";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  Shield,
  IndianRupee,
  ShieldCheck,
  HeadphonesIcon,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function HomePage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    data: equipment,
    isLoading,
    error,
  } = useQuery<Equipment[]>({
    queryKey: ['/api/equipment'],
    // Removed the filter from here since we want to show all equipment
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-500">
          <XCircle className="h-12 w-12 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-center">
            {t('common.error')}
          </h2>
          <p className="text-center">
            {error instanceof Error ? error.message : t('common.loadError')}
          </p>
        </div>
      </div>
    );
  }

  const allEquipment = equipment || [];

  return (
    <div>
      <MainNav />
      <main>
        {/* Hero Section - remains unchanged */}
        <section className="py-20 bg-[#66BB6A] text-white">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">
              {t('home.hero.title')}
            </h1>
            <p className="text-xl mb-8">
              {t('home.hero.subtitle')}
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="bg-[#FFE57F] hover:bg-[#FFD740] text-black"
            >
              <Link href="/equipment">{t('common.getStarted')}</Link>
            </Button>
          </div>
        </section>

        {/* Popular Equipment Section */}
        <section className="py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center text-[#5D4037] mb-12">
              {t('equipment.popularSection')}
            </h2>
            {allEquipment.length > 0 ? (
              <div className="grid md:grid-cols-3 gap-8">
                {allEquipment.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className={`bg-white rounded-lg shadow-md overflow-hidden ${
                      !item.availability ? 'opacity-75' : ''
                    }`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-semibold">{item.name}</h3>
                        <Badge variant={item.availability ? "success" : "destructive"}>
                          {item.availability ? (
                            <CheckCircle className="w-4 h-4 mr-1" />
                          ) : (
                            <XCircle className="w-4 h-4 mr-1" />
                          )}
                          {t(item.availability ? 'equipment.available' : 'equipment.unavailable')}
                        </Badge>
                      </div>
                      <p className="text-gray-600 mb-4">{item.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-[#66BB6A] font-bold">
                          ₹{new Intl.NumberFormat('hi-IN').format(item.dailyRate)} {t('equipment.perDay')}
                        </span>
                        <Button
                          asChild
                          variant={item.availability ? "default" : "secondary"}
                          className={`${item.availability ? "bg-[#66BB6A] hover:bg-[#558B2F]" : ""}`}
                          disabled={!item.availability}
                        >
                          <Link href={`/equipment/${item.id}`}>
                            {t(item.availability ? 'equipment.viewDetails' : 'equipment.unavailable')}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {t('equipment.noEquipment')}
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/auth">
                    {t('common.signUpNow')}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Why Choose Us Section */}
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center text-[#5D4037] mb-4">
              {t('home.whyChooseUs.title')}
            </h2>
            <p className="text-center text-gray-600 mb-12">
              {t('home.whyChooseUs.subtitle')}
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <div className="text-[#66BB6A] mb-4">
                  <IndianRupee className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {t('home.whyChooseUs.affordablePrices')}
                </h3>
                <p className="text-gray-600">
                  {t('home.whyChooseUs.affordablePricesDesc')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <div className="text-[#66BB6A] mb-4">
                  <ShieldCheck className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {t('home.whyChooseUs.verifiedEquipment')}
                </h3>
                <p className="text-gray-600">
                  {t('home.whyChooseUs.verifiedEquipmentDesc')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <div className="text-[#66BB6A] mb-4">
                  <HeadphonesIcon className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {t('home.whyChooseUs.support')}
                </h3>
                <p className="text-gray-600">
                  {t('home.whyChooseUs.supportDesc')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center text-[#5D4037] mb-12">
              {t('home.testimonials.title')}
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  id: 1,
                  village: t('locations.paithan'),
                  image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&h=500&fit=crop",
                },
                {
                  id: 2,
                  village: t('locations.vaijapur'),
                  image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&h=500&fit=crop",
                },
                {
                  id: 3,
                  village: t('locations.phulambri'),
                  image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&h=500&fit=crop",
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg shadow-md p-6"
                >
                  <img
                    src={item.image}
                    alt={t('home.testimonials.farmIn', { village: item.village })}
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                  <p className="text-gray-600 mb-4">
                    {t('home.testimonials.quote')}
                  </p>
                  <div className="flex items-center">
                    <img
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.village}`}
                      alt={t('home.testimonials.farmerFrom', { village: item.village })}
                      className="w-12 h-12 rounded-full mr-4"
                    />
                    <div>
                      <h4 className="font-semibold">
                        {t('home.testimonials.farmer')}
                      </h4>
                      <p className="text-gray-500">{item.village}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action Section */}
        <section className="py-16 bg-[#66BB6A] text-white text-center">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold mb-4">
              {t('home.cta.title')}
            </h2>
            <p className="text-xl mb-8">
              {t('home.cta.subtitle')}
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="bg-[#FFE57F] hover:bg-[#FFD740] text-black"
            >
              <Link href="/auth">{t('common.signUpNow')}</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}