import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from "@/components/ui/navigation-menu";
import { motion } from "framer-motion";
import { TractorIcon, MenuIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const NavItems = () => (
    <>
      <NavigationMenuItem>
        <Link href="/">
          <NavigationMenuLink className="cursor-pointer">Home</NavigationMenuLink>
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link href="/equipment">
          <NavigationMenuLink className="cursor-pointer">Equipment</NavigationMenuLink>
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link href="/about">
          <NavigationMenuLink className="cursor-pointer">About</NavigationMenuLink>
        </Link>
      </NavigationMenuItem>
    </>
  );

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center space-x-2 cursor-pointer">
            <TractorIcon className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">FarmRent</span>
          </div>
        </Link>

        {isMobile ? (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <MenuIcon className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <nav className="flex flex-col space-y-4 mt-8">
                <NavItems />
              </nav>
            </SheetContent>
          </Sheet>
        ) : (
          <NavigationMenu>
            <NavigationMenuList className="space-x-4">
              <NavItems />
            </NavigationMenuList>
          </NavigationMenu>
        )}

        <div className="flex items-center space-x-4">
          <Button variant="outline">Sign In</Button>
          <Button>Sign Up</Button>
        </div>
      </div>
    </motion.header>
  );
}