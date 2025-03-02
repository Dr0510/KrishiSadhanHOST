import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Menu,
  Search,
  ShoppingCart,
  Tractor,
  User,
  Plus,
  Loader2,
  ChevronDown,
  ImagePlus,
  ScrollText,
  Scale,
  ArrowLeft
} from "lucide-react";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { UpdateProfile } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional(),
  imageUrl: z.string().optional(),
});

const equipmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  dailyRate: z.coerce.number().min(1, "Daily rate must be at least ₹1"),
  location: z.string().min(1, "Location is required"),
  imageUrl: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type EquipmentFormData = z.infer<typeof equipmentSchema>;

const categories = [
  { id: "tractors", label: "Tractors" },
  { id: "harvesters", label: "Harvesters" },
  { id: "irrigation", label: "Irrigation" },
  { id: "seeders", label: "Seeders" },
  { id: "sprayers", label: "Sprayers" },
];

export function MainNav() {
  const { user, logoutMutation } = useAuth();
  const { t } = useTranslation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPostEquipmentOpen, setIsPostEquipmentOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState(0);
  const [avatarKey, setAvatarKey] = useState(Date.now());

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfile) => {
      const res = await apiRequest("/api/user/profile", "PATCH", data);
      if (!res.ok) {
        throw new Error("Failed to update profile");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: t('profile.updateSuccess', 'Profile Updated'),
        description: t('profile.updateSuccessDesc', 'Your profile has been updated successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (user) {
      console.log('User data changed, updating avatar key');
      setAvatarKey(Date.now() + Math.random());
    }
  }, [user]);

  useEffect(() => {
    if (user?.imageUrl) {
      console.log('Image URL changed, forcing avatar update');
      setAvatarKey(Date.now() + Math.random());
    }
  }, [user?.imageUrl]);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      contact: user?.contact || "",
      imageUrl: user?.imageUrl || "",
    },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        name: user.name || "",
        contact: user.contact || "",
        imageUrl: user.imageUrl || "",
      });
    }
  }, [user, profileForm]);

  async function onProfileSubmit(data: ProfileFormData) {
    try {
      await updateProfileMutation.mutateAsync(data);
      setIsProfileOpen(false);
      setAvatarKey(Date.now() + Math.random());
      toast({
        title: t('profile.updateSuccess', 'Profile Updated'),
        description: t('profile.updateSuccessDesc', 'Your profile has been updated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.errorOccurred', 'An error occurred while updating your profile'),
        variant: "destructive",
      });
    }
  }

  async function onEquipmentSubmit(data: EquipmentFormData) {
    try {
      setIsSubmitting(true);
      const formData = new FormData();

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch('/api/equipment', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to post equipment');
      }

      setIsPostEquipmentOpen(false);
      toast({
        title: t('equipment.createSuccess', 'Equipment Posted'),
        description: t('equipment.createSuccessDesc', 'Your equipment has been posted successfully'),
      });

      equipmentForm.reset({
        name: "",
        category: "",
        description: "",
        dailyRate: 0,
        location: "",
        imageUrl: "",
      });
      setLocation('/dashboard');

    } catch (error) {
      console.error('Equipment submission error:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('equipment.createError', 'Failed to post equipment. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/equipment?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsPostEquipmentOpen(open);
    if (!open) {
      equipmentForm.reset({
        name: "",
        category: "",
        description: "",
        dailyRate: 0,
        location: "",
        imageUrl: "",
      });
    }
  };
  const equipmentForm = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: "",
      category: "",
      description: "",
      dailyRate: 0,
      location: "",
      imageUrl: "",
    },
  });

  // Handle logout function
  const handleLogout = async () => {
    console.log('Initiating logout process');
    try {
      await logoutMutation.mutateAsync();
      console.log('Logout successful, redirecting to auth page');
      setLocation('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('auth.logoutError', 'Failed to logout. Please try again.'),
        variant: "destructive"
      });
    }
  };

  return (
    <nav className="border-b bg-green-50/80 sticky top-0 z-50 backdrop-blur-sm shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label={t('nav.menu', 'Menu')}>
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px]">
              <SheetHeader>
                <SheetTitle>{t('nav.menu', 'Menu')}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 py-4">
                <Link href="/equipment" className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent">
                  <Tractor className="h-5 w-5" />
                  {t('nav.equipment', 'Equipment')}
                </Link>
                <Link href="/compare" className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent">
                  <Scale className="h-5 w-5" />
                  {t('nav.compare', 'Compare Equipment')}
                </Link>
                <Link href="/dashboard" className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent">
                  <ShoppingCart className="h-5 w-5" />
                  {t('nav.bookings', 'Bookings')}
                </Link>
                <Link href="/receipts" className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent">
                  <ScrollText className="h-5 w-5" />
                  {t('nav.receipts', 'Receipt History')}
                </Link>
                {user?.isAdmin && (
                  <Link href="/admin" className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent">
                    <User className="h-5 w-5" />
                    {t('nav.admin', 'Admin Dashboard')}
                  </Link>
                )}
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="w-full mt-2"
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('nav.logout', 'Logout')
                  )}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-green-700">
              <Tractor className="h-6 w-6" />
              {t('branding.name', 'AgriRent')}
            </Link>
            {location !== "/" && (
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/">
                    {t('nav.backToHome', 'Back to Home')}
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center px-8 gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1">
                  {t('nav.categories', 'Categories')}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {categories.map((category) => (
                  <DropdownMenuItem key={category.id} asChild>
                    <Link href={`/equipment?category=${category.id}`} className="w-full">
                      {t(`categories.${category.id}`, category.label)}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <form onSubmit={handleSearch} className="flex-1 mx-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t('search.placeholder', 'Search farming equipment...')}
                  className="w-full pl-10 pr-4"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={t('search.label', 'Search equipment')}
                />
              </div>
            </form>

            <Button variant="ghost" asChild>
              <Link href="/compare" className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                {t('nav.compare', 'Compare')}
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />

            <Link href="/dashboard">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('nav.bookings', 'Your Bookings')}
              >
                <ShoppingCart className="h-5 w-5" />
              </Button>
            </Link>

            <Link href="/receipts">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('nav.receipts', 'Receipt History')}
              >
                <ScrollText className="h-5 w-5" />
              </Button>
            </Link>

            <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 rounded-full navbar-avatar"
                  aria-label={t('profile.manage', 'Manage Profile')}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      className="navbar-avatar"
                      key={`avatar-${avatarKey}`}
                      src={user?.imageUrl ? `${user.imageUrl}?v=${avatarKey}` : '/default-avatar.png'}
                      alt={user?.name}
                    />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('profile.edit', 'Edit Profile')}</DialogTitle>
                  <DialogDescription>
                    {t('profile.editDesc', 'Update your profile information below.')}
                  </DialogDescription>
                </DialogHeader>
                <Form {...profileForm}>
                  <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                    <FormField
                      control={profileForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('profile.name', 'Name')}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="contact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('profile.contact', 'Contact')}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('profile.image', 'Profile Image')}</FormLabel>
                          <FormControl>
                            <div className="flex flex-col gap-4">
                              {(field.value || previewImage) && (
                                <div className="relative w-32 h-32 mx-auto">
                                  <img
                                    key={`profile-preview-${avatarKey}`}
                                    src={previewImage || `${field.value}?v=${avatarKey}`}
                                    alt="Profile preview"
                                    className="w-full h-full object-cover rounded-full"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-4">
                                <Input
                                  type="file"
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      console.log('File selected, creating preview');
                                      const preview = URL.createObjectURL(file);
                                      setPreviewImage(preview);

                                      const formData = new FormData();
                                      formData.append('image', file);
                                      try {
                                        console.log('Uploading profile image');
                                        const res = await fetch('/api/user/profile/image', {
                                          method: 'POST',
                                          credentials: 'include',
                                          body: formData
                                        });
                                        if (!res.ok) {
                                          throw new Error('Failed to upload profile image');
                                        }
                                        const data = await res.json();
                                        console.log('Profile image uploaded successfully');
                                        field.onChange(data.imageUrl);
                                        setAvatarKey(Date.now() + Math.random());
                                        setPreviewImage(null);

                                        await updateProfileMutation.mutateAsync({
                                          ...profileForm.getValues(),
                                          imageUrl: data.imageUrl
                                        });

                                        toast({
                                          title: t('common.success', 'Success'),
                                          description: t('profile.imageUploadSuccess', 'Profile image uploaded successfully'),
                                        });
                                      } catch (error) {
                                        console.error('Profile image upload error:', error);
                                        setPreviewImage(null);
                                        toast({
                                          title: t('common.error', 'Error'),
                                          description: t('profile.imageUploadError', 'Failed to upload profile image'),
                                          variant: "destructive",
                                        });
                                      }
                                    }
                                  }}
                                />
                                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('profile.save', 'Save Changes')}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="hidden sm:flex"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('nav.logout', 'Logout')
              )}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}