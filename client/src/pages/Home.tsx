import { motion } from "framer-motion";
import { ArrowRight, Tractor, Clock, DollarSign, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative py-20 bg-primary/10">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Your Trusted Partner in Farm Equipment Rentals
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Access quality farming equipment without the hefty investment. 
              Rent what you need, when you need it.
            </p>
            <Link href="/equipment">
              <Button size="lg" className="group">
                Browse Equipment
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Choose FarmRental?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Tractor,
                title: "Quality Equipment",
                description: "Well-maintained machinery from trusted manufacturers"
              },
              {
                icon: Clock,
                title: "Flexible Rentals",
                description: "Daily, weekly, and monthly rental options available"
              },
              {
                icon: Shield,
                title: "Full Support",
                description: "24/7 technical support and maintenance assistance"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center p-6 rounded-lg bg-card"
              >
                <feature.icon className="mx-auto h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
