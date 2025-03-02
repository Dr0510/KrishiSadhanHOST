import { Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-muted mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">FarmRental</h3>
            <p className="text-muted-foreground">
              Your trusted partner in agricultural equipment rentals. Making farming easier and more accessible.
            </p>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4">Contact Us</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>contact@farmrental.com</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>123 Farm Road, Rural County</span>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4">Hours</h3>
            <div className="space-y-2">
              <p>Monday - Friday: 8am - 6pm</p>
              <p>Saturday: 9am - 4pm</p>
              <p>Sunday: Closed</p>
            </div>
          </div>
        </div>
        
        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} FarmRental. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
