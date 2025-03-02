import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Equipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Star, CheckCircle, XCircle, ImagePlus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { enUS, hi } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { VoiceAssistant } from "@/components/voice-assistant";
import { useRoute, Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { CalendarHeatmap } from "@/components/ui/calendar-heatmap";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

// Define the Review interface for this component
interface ReviewType {
  id: number;
  rating: number;
  comment: string;
  createdAt: string;
  userId: number;
  equipmentId: number;
}

export default function EquipmentPage() {
  const [, params] = useRoute("/equipment/:id");
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [imageKey, setImageKey] = useState(0); // Add this for forced re-render
  const [isImageRefreshing, setIsImageRefreshing] = useState(false);

  // Reset dates when dialog closes
  useEffect(() => {
    if (!isDialogOpen) {
      setStartDate(undefined);
      setEndDate(undefined);
      setDialogKey((prev) => prev + 1);
    }
  }, [isDialogOpen]);

  // Fetch equipment details
  const {
    data: equipment,
    isLoading,
    error,
    refetch,
  } = useQuery<Equipment>({
    queryKey: [`/api/equipment/${params?.id}`],
    enabled: !!params?.id,
    staleTime: 30000,
    refetchOnMount: true,
  });

  // Fetch reviews for this equipment
  const { data: reviews } = useQuery<ReviewType[]>({
    queryKey: [`/api/equipment/${params?.id}/reviews`],
    enabled: !!params?.id,
  });

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async () => {
      if (!equipment || !startDate || !endDate) {
        throw new Error(t("booking.missingInfo"));
      }

      // Validate date range
      if (startDate > endDate) {
        throw new Error(t("booking.invalidDateRange"));
      }

      try {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            equipmentId: equipment.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            status: "pending",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || t("booking.failed"));
        }

        return response.json();
      } catch (error) {
        console.error("Booking error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      setIsDialogOpen(false);
      setStartDate(undefined);
      setEndDate(undefined);

      if (data.booking && data.booking.id) {
        setLocation(`/booking/${data.booking.id}`);
        toast({
          title: t("common.success"),
          description: t("booking.success"),
        });
      } else {
        toast({
          title: t("common.error"),
          description: t("booking.idMissing"),
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Loading state
  if (isLoading || !params?.id) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-500">
          <XCircle className="h-12 w-12 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">{t("common.error")}</h2>
          <p>
            {error instanceof Error ? error.message : t("common.loadError")}
          </p>
        </div>
      </div>
    );
  }

  if (!equipment) {
    return <div>{t("equipment.notFound")}</div>;
  }

  const canEdit = user?.id === equipment.ownerId;

  const handleDateSelect = (
    newStartDate: Date | undefined,
    newEndDate: Date | undefined,
  ) => {
    // If clearing selection
    if (!newStartDate) {
      setStartDate(undefined);
      setEndDate(undefined);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Single date selected
    if (!newEndDate) {
      if (newStartDate < today) {
        toast({
          title: t("common.error"),
          description: t("booking.pastDateError"),
          variant: "destructive",
        });
        return;
      }
      setStartDate(newStartDate);
      setEndDate(undefined);
      return;
    }

    // Both dates selected
    if (newStartDate < today || newEndDate < today) {
      toast({
        title: t("common.error"),
        description: t("booking.pastDateError"),
        variant: "destructive",
      });
      return;
    }

    if (newStartDate > newEndDate) {
      toast({
        title: t("common.error"),
        description: t("booking.invalidDateRange"),
        variant: "destructive",
      });
      return;
    }

    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };

  // Calculate average rating
  const averageRating =
    reviews && reviews.length > 0
      ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length
      : 0;

  const handleVoiceCommand = (command: string) => {
    if (!equipment || canEdit) return;

    console.log("Received voice command:", command);

    const normalizedCommand = command.toLowerCase().trim();
    console.log("Normalized command:", normalizedCommand);

    if (normalizedCommand === "book now") {
      setIsDialogOpen(true);
      speak(t("voice.bookingStarted"));
    } else if (normalizedCommand === "close") {
      setIsDialogOpen(false);
      speak(t("voice.dialogClosed"));
    } else if (normalizedCommand === "confirm booking") {
      if (startDate && endDate) {
        createBookingMutation.mutate();
        speak(t("voice.bookingConfirmed"));
      } else {
        speak(t("voice.selectDatesFirst"));
      }
    } else {
      console.log("Unknown command:", normalizedCommand);
      speak(t("voice.unknownCommand"));
    }
  };

  const speak = (message: string) => {
    const utterance = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(utterance);
    console.log("Speaking:", message);
  };

  // Function to handle manual image refresh
  const handleImageRefresh = async () => {
    if (!equipment?.imageUrl) return;

    setIsImageRefreshing(true);
    try {
      // Force browser to refetch the image
      setImageKey((prev) => prev + 1);

      // Refetch equipment data
      await refetch();

      toast({
        title: t("common.success", "Success"),
        description: t("equipment.imageRefreshed", "Image refreshed successfully"),
      });
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: t("equipment.refreshError", "Failed to refresh image"),
        variant: "destructive",
      });
    } finally {
      setIsImageRefreshing(false);
    }
  };


  // Format number with locale
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date with locale
  const formatLocalDate = (date: Date) => {
    return format(date, "PPP", {
      locale: i18n.language === "hi" ? hi : enUS, // Default to English for Marathi
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="relative w-full h-[400px] rounded-lg overflow-hidden bg-gray-100">
          {equipment.imageUrl ? (
            <div className="relative w-full h-full">
              <img
                key={`${equipment.imageUrl}-${imageKey}`}
                src={`${equipment.imageUrl}?v=${imageKey}`}
                alt={equipment.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes('placeholder-image.jpg')) {
                    target.src = "/placeholder-image.jpg";
                    target.classList.add('image-load-failed');
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 bg-white/80 hover:bg-white"
                onClick={handleImageRefresh}
                disabled={isImageRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isImageRefreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <ImagePlus className="h-12 w-12 text-gray-400" />
              <p className="text-gray-500 mt-2">{t('equipment.noImage')}</p>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex justify-between items-start w-full">
                <div>
                  <h1 className="text-3xl font-bold">{equipment.name}</h1>
                  <div className="flex items-center gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          reviews &&
                          reviews.length > 0 &&
                          star <= Math.round(averageRating)
                            ? "text-yellow-400 fill-current"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {reviews && reviews.length > 0 ? (
                      <span>
                        ({reviews.length}{" "}
                        {t("reviews.count", { count: reviews.length })})
                      </span>
                    ) : (
                      t("reviews.none")
                    )}
                  </span>
                </div>
                <Badge
                  variant={equipment.availability ? "success" : "destructive"}
                  className={`text-base py-1.5 px-4 ${!equipment.availability ? 'shadow-md bg-red-600 hover:bg-red-700' : ''}`}
                >
                  {equipment.availability ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      {t('equipment.available')}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 mr-2" />
                      {t('equipment.unavailable')}
                    </>
                  )}
                </Badge>
              </div>
              {canEdit && (
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">
                    {t('common.edit')}
                  </Button>
                </Link>
              )}
              {!canEdit && equipment.availability && <VoiceAssistant onCommand={handleVoiceCommand} />}
            </div>
            <p className="text-muted-foreground mb-6">
              {equipment.description}
            </p>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">{t('equipment.dailyRate')}</span>
                <span className="text-lg">
                  {formatCurrency(equipment.dailyRate)} {t('equipment.perDay')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">{t('equipment.location')}</span>
                <span>{equipment.location}</span>
              </div>
            </div>

            {!canEdit && equipment.availability && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="w-full mt-6"
                    aria-label={t('equipment.rentNow')}
                  >
                    {t('equipment.rentNow')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] flex flex-col max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{t('booking.selectDates')}</DialogTitle>
                    <DialogDescription>
                      {t('booking.selectDatesDescription')}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto">
                    <div className="py-4">
                      <CalendarHeatmap
                        key={`${equipment.id}-${dialogKey}`}
                        equipmentId={equipment.id}
                        startDate={startDate}
                        endDate={endDate}
                        dailyRate={equipment.dailyRate}
                        onSelect={handleDateSelect}
                        className="rounded-md border"
                        onConfirm={() => {
                          if (startDate && endDate) {
                            createBookingMutation.mutate();
                          }
                        }}
                        isConfirming={createBookingMutation.isPending}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {!canEdit && !equipment.availability && (
              <div className="mt-6 space-y-4 flex flex-col items-center">
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 w-full max-w-md mx-auto">
                  <p className="text-red-600 text-center font-medium">
                    {t('equipment.unavailable')}
                  </p>
                  <p className="text-red-500 text-sm text-center mt-2">
                    {t('equipment.checkBackLater')}
                  </p>
                </div>
                <Button
                  className="w-full bg-red-100 hover:bg-red-200 text-red-600 border border-red-200"
                  disabled
                  aria-label={t('equipment.unavailable')}
                >
                  {t('equipment.unavailable')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold">{t("reviews.title")}</h2>
        {reviews && reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < review.rating
                            ? "text-yellow-400 fill-current"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {formatLocalDate(new Date(review.createdAt))}
                  </p>
                  <p>{review.comment}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("reviews.none")}</p>
        )}
      </div>
    </div>
  );
}