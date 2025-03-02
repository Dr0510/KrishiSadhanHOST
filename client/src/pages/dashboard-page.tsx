import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Booking, Equipment, insertEquipmentSchema, type InsertEquipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Star, Download } from "lucide-react";
import { format } from "date-fns";
import { MainNav } from "@/components/main-nav";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { PaymentGateway } from "@/components/payment-gateway";
import { ReviewForm } from "@/components/review-form";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [ratingBooking, setRatingBooking] = useState<Booking | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState<number | null>(null);

  const { data: myEquipment, isLoading: isLoadingEquipment, error: equipmentError } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment", "owned"],
    queryFn: async () => {
      const res = await fetch("/api/equipment?owned=true", {
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch equipment");
      }
      return res.json();
    },
    enabled: !!user,
    staleTime: 30000,
    retry: 1,
  });

  if (equipmentError) {
    return (
      <div className="flex items-center justify-center min-h-screen text-destructive">
        <p>Error loading equipment: {equipmentError instanceof Error ? equipmentError.message : 'Unknown error'}</p>
      </div>
    );
  }

  const { data: bookings, isLoading: isLoadingBookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings", user?.id],
    queryFn: async () => {
      console.log('Fetching bookings for user:', user?.id);
      const res = await fetch(`/api/bookings?userId=${user?.id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        console.error('Error fetching bookings:', error);
        throw new Error(error.message || "Failed to fetch bookings");
      }
      const data = await res.json();
      console.log('Received bookings:', data);
      return data;
    },
    enabled: !!user
  });

  const form = useForm<InsertEquipment>({
    resolver: zodResolver(insertEquipmentSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      dailyRate: 0,
      location: "",
      imageUrl: "",
      ownerId: user?.id || 0,
      specs: {},
    },
  });

  useEffect(() => {
    const shouldOpenDialog = window.localStorage.getItem('openAddEquipment');
    if (shouldOpenDialog === 'true') {
      setIsDialogOpen(true);
      window.localStorage.removeItem('openAddEquipment');
    }

    if (editingEquipment) {
      form.reset({
        name: editingEquipment.name,
        description: editingEquipment.description,
        category: editingEquipment.category,
        dailyRate: editingEquipment.dailyRate,
        location: editingEquipment.location,
        imageUrl: editingEquipment.imageUrl,
        ownerId: editingEquipment.ownerId,
        specs: editingEquipment.specs || {},
      });
    } else {
      form.reset({
        name: "",
        description: "",
        category: "",
        dailyRate: 0,
        location: "",
        imageUrl: "",
        ownerId: user?.id || 0,
        specs: {},
      });
    }
  }, [editingEquipment, form, user?.id]);

  const createEquipmentMutation = useMutation({
    mutationFn: async (data: InsertEquipment) => {
      try {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (key === 'specs') {
            formData.append(key, JSON.stringify(value));
          } else if (key === 'dailyRate') {
            formData.append(key, String(value ?? 0));
          } else {
            formData.append(key, value?.toString() ?? '');
          }
        });

        const imageInput = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (imageInput?.files?.[0]) {
          formData.append("image", imageInput.files[0]);
        }

        const res = await fetch("/api/equipment", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to create equipment');
        }

        return res.json();
      } catch (error) {
        console.error('Equipment creation error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: t('equipment.createSuccess', "Equipment listed successfully"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: async (data: InsertEquipment & { id: number }) => {
      const { id, ...updateData } = data;
      try {
        const formData = new FormData();
        Object.entries(updateData).forEach(([key, value]) => {
          if (key === 'specs') {
            formData.append(key, JSON.stringify(value));
          } else if (key === 'dailyRate') {
            formData.append(key, String(value ?? 0));
          } else {
            formData.append(key, value?.toString() ?? '');
          }
        });

        const imageInput = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (imageInput?.files?.[0]) {
          formData.append("image", imageInput.files[0]);
        }

        const res = await fetch(`/api/equipment/${id}`, {
          method: "PATCH",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to update equipment');
        }

        return res.json();
      } catch (error) {
        console.error('Equipment update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setIsDialogOpen(false);
      setEditingEquipment(null);
      form.reset();
      toast({
        title: "Success",
        description: t('equipment.updateSuccess', "Equipment updated successfully"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/equipment/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete equipment');
      }
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/equipment", "owned"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}`] });

      toast({
        title: "Success",
        description: t('equipment.deleteSuccess', "Equipment deleted successfully"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (reviewData: { userId: number, equipmentId: number, rating: number, comment: string }) => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reviewData),
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.details || 'Failed to submit review');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/equipment'] });
      setShowRatingDialog(false);
      setRatingBooking(null);
      toast({
        title: t('review.success', 'Review submitted'),
        description: t('review.thankYou', 'Thank you for your feedback!')
      });
    },
    onError: (error: Error) => {
      console.error('Review submission error:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  async function onSubmit(data: InsertEquipment) {
    if (editingEquipment) {
      updateEquipmentMutation.mutate({ ...data, id: editingEquipment.id });
    } else {
      createEquipmentMutation.mutate(data);
    }
  }

  if (isLoadingBookings || isLoadingEquipment) {
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
          <h1 className="text-4xl font-bold">{t('dashboard.title')}</h1>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-green-600">
                {t('dashboard.welcomePrefix', 'Welcome')} {user?.name}!
              </span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <span className="text-sm text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </span>
          </div>
        </div>

        <div className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">
              {t('dashboard.myEquipment')}
            </h2>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingEquipment(null);
                form.reset();
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('dashboard.addEquipment')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingEquipment ? t('dashboard.editEquipment') : t('dashboard.addEquipment')}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {editingEquipment
                      ? t('equipment.editDescription')
                      : t('equipment.addDescription')}
                  </p>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('equipment.name')}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('equipment.description')}</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('equipment.category')}</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t('equipment.selectCategory')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="tractors">{t('categories.tractors')}</SelectItem>
                              <SelectItem value="harvesters">{t('categories.harvesters')}</SelectItem>
                              <SelectItem value="irrigation">{t('categories.irrigation')}</SelectItem>
                              <SelectItem value="seeders">{t('categories.seeders')}</SelectItem>
                              <SelectItem value="sprayers">{t('categories.sprayers')}</SelectItem>
                              <SelectItem value="plows">{t('categories.plows')}</SelectItem>
                              <SelectItem value="cultivators">{t('categories.cultivators')}</SelectItem>
                              <SelectItem value="fertilizer">{t('categories.fertilizer')}</SelectItem>
                              <SelectItem value="other">{t('categories.other')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dailyRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('equipment.dailyRate')}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('equipment.location')}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div>
                      <FormLabel>{t('equipment.image')}</FormLabel>
                      <Input
                        type="file"
                        accept="image/*"
                        className="mt-1"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createEquipmentMutation.isPending || updateEquipmentMutation.isPending}
                    >
                      {(createEquipmentMutation.isPending || updateEquipmentMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingEquipment ? t('equipment.update') : t('equipment.create')}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {myEquipment?.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground mb-4">
                {t('dashboard.noEquipment')}
              </p>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('dashboard.addFirstEquipment')}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myEquipment?.map((equipment) => (
                <Card key={equipment.id}>
                  <img
                    src={equipment.imageUrl}
                    alt={equipment.name}
                    className="w-full h-48 object-cover"
                  />
                  <CardContent className="p-6">
                    <h3 className="text-xl font-semibold mb-2">{equipment.name}</h3>
                    <p className="text-muted-foreground mb-4">
                      {equipment.description.slice(0, 100)}...
                    </p>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium">
                        ₹{equipment.dailyRate} {t('equipment.perDay')}
                      </span>
                      <div className="space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingEquipment(equipment);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          {t('dashboard.actions.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(t('equipment.confirmDelete'))) {
                              deleteEquipmentMutation.mutate(equipment.id);
                            }
                          }}
                        >
                          {t('dashboard.actions.delete')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">{t('dashboard.yourBookings')}</h2>
          {bookings?.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-medium mb-2">
                      {t('dashboard.booking')} #{booking.id}
                    </h3>
                    <p className="text-muted-foreground">
                      {format(new Date(booking.startDate), "PP")} -
                      {format(new Date(booking.endDate), "PP")}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary">
                      {t(`dashboard.status.${booking.status.toLowerCase()}`)}
                    </span>
                    <p className="mt-2 font-medium">
                      {t('dashboard.totalPrice')}: ₹{booking.totalPrice.toLocaleString()}
                    </p>
                    {booking.status === 'awaiting_payment' && booking.razorpayOrderId && (
                      <PaymentGateway
                        bookingId={booking.id}
                        totalPrice={booking.totalPrice}
                        razorpayOrderId={booking.razorpayOrderId}
                        userData={{
                          name: user?.name ?? undefined,
                          email: user?.contact ?? undefined,
                          phone: user?.contact ?? undefined,
                        }}
                        onSuccess={() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
                        }}
                        onError={(error) => {
                          console.error('Payment failed:', error);
                          toast({
                            title: t('payment.failed', "Payment Failed"),
                            description: error.message,
                            variant: "destructive",
                          });
                        }}
                      />
                    )}
                    {booking.status === 'paid' && (
                      <div className="space-y-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingReceipt === booking.id}
                          onClick={() => {
                            setDownloadingReceipt(booking.id);
                            // Get the receipt for this booking
                            fetch(`/api/bookings/${booking.id}/receipt`, {
                              credentials: 'include'
                            })
                              .then(res => {
                                if (!res.ok) {
                                  throw new Error('Receipt not found');
                                }
                                return res.json();
                              })
                              .then(receipt => {
                                if (receipt && receipt.id) {
                                  // Trigger download in a new window
                                  window.open(`/api/receipts/${receipt.id}/download`, '_blank');
                                } else {
                                  throw new Error('Receipt data is invalid');
                                }
                              })
                              .catch(error => {
                                console.error('Error downloading receipt:', error);
                                toast({
                                  title: t('receipt.error', 'Error'),
                                  description: t(
                                    'receipt.downloadFailed',
                                    'Failed to download receipt. Please try again.'
                                  ),
                                  variant: "destructive",
                                });
                              })
                              .finally(() => {
                                setDownloadingReceipt(null);
                              });
                          }}
                        >
                          {downloadingReceipt === booking.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          {downloadingReceipt === booking.id
                            ? t('receipt.downloading', 'Downloading...')
                            : t('booking.downloadReceipt', 'Download Receipt')}
                        </Button>
                        {!booking.isRated && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2"
                            onClick={() => {
                              setRatingBooking(booking);
                              setShowRatingDialog(true);
                            }}
                          >
                            <Star className="w-4 h-4 mr-2" />
                            {t('review.rateBooking')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {ratingBooking && (
        <ReviewForm
          equipmentId={ratingBooking.equipmentId}
          isOpen={showRatingDialog}
          onOpenChange={(open) => {
            setShowRatingDialog(open);
            if (!open) setRatingBooking(null);
          }}
          onSubmitSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
          }}
        />
      )}
    </div>
  );
}