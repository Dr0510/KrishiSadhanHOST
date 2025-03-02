import { Link } from "wouter";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Navbar() {
  const isMobile = useIsMobile();

  const NavLinks = () => (
    <>
      <Link href="/">
        <a className="text-foreground hover:text-primary transition-colors">Home</a>
      </Link>
      <Link href="/equipment">
        <a className="text-foreground hover:text-primary transition-colors">Equipment</a>
      </Link>
      <Link href="/about">
        <a className="text-foreground hover:text-primary transition-colors">About</a>
      </Link>
      <Link href="/contact">
        <a className="text-foreground hover:text-primary transition-colors">Contact</a>
      </Link>
    </>
  );

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/">
          <a className="font-bold text-xl text-primary">FarmRental</a>
        </Link>

        {isMobile ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex flex-col space-y-4 mt-8">
                <NavLinks />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="flex items-center space-x-8">
            <NavLinks />
          </div>
        )}
      </div>
    </nav>
  );
}