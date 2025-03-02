import { Separator } from "@/components/ui/separator";
import { TractorIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-background border-t mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2">
              <TractorIcon className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">FarmRent</span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Your trusted partner for farm equipment rentals. Making farming easier and more accessible.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/equipment" className="hover:text-primary">Equipment</a></li>
              <li><a href="/about" className="hover:text-primary">About Us</a></li>
              <li><a href="/contact" className="hover:text-primary">Contact</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Equipment Categories</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/equipment?category=tractors" className="hover:text-primary">Tractors</a></li>
              <li><a href="/equipment?category=harvesters" className="hover:text-primary">Harvesters</a></li>
              <li><a href="/equipment?category=implements" className="hover:text-primary">Implements</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Contact Info</h3>
            <ul className="space-y-2 text-sm">
              <li>Email: contact@farmrent.com</li>
              <li>Phone: (555) 123-4567</li>
              <li>Hours: Mon-Fri 8am-6pm</li>
            </ul>
          </div>
        </div>
        
        <Separator className="my-8" />
        
        <div className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} FarmRent. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
