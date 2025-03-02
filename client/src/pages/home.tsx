import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { TractorIcon, LeafIcon, ClockIcon, DollarSignIcon } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-[url('https://images.unsplash.com/photo-1625246333195-78d9c38ad449')] bg-cover bg-center">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative container mx-auto px-4 py-24 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Professional Farm Equipment Rentals
            </h1>
            <p className="text-lg text-gray-200 mb-8">
              Access top-quality farming equipment when you need it. Competitive rates and flexible rental periods.
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/equipment")}
              className="bg-primary hover:bg-primary/90"
            >
              Browse Equipment
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose Us</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <TractorIcon className="h-8 w-8" />,
                title: "Quality Equipment",
                description: "Well-maintained machinery from trusted manufacturers"
              },
              {
                icon: <ClockIcon className="h-8 w-8" />,
                title: "Flexible Rental Periods",
                description: "Daily, weekly, and monthly rental options available"
              },
              {
                icon: <DollarSignIcon className="h-8 w-8" />,
                title: "Competitive Pricing",
                description: "Transparent pricing with no hidden fees"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="bg-background p-6 rounded-lg shadow-sm"
              >
                <div className="text-primary mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <LeafIcon className="h-12 w-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Browse our extensive collection of farm equipment and find the perfect machinery for your needs.
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/equipment")}
              className="bg-primary hover:bg-primary/90"
            >
              View Equipment Catalog
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}