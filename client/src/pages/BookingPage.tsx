import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Equipment } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Star, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from "@/hooks/use-auth";
import { PaymentGateway } from "@/components/payment-gateway";
import { ReviewForm } from "@/components/review-form";
import { useState } from "react";
import { CalendarHeatmap } from "@/components/ui/calendar-heatmap";

interface BookingDetails {
  id: number;
  equipmentId: number;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: string;
  razorpayOrderId?: string;
  user?: {
    name?: string;
    email?: string;
    phone?: string;
  }
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const queryClient = useQueryClient();

  const { data: booking, isLoading: isLoadingBooking } = useQuery<BookingDetails>({
    queryKey: [`/api/bookings/${id}`],
    enabled: !!id && !!user,
    retry: 3,
  });

  const { data: equipment, isLoading: isLoadingEquipment } = useQuery<Equipment>({
    queryKey: [`/api/equipment/${booking?.equipmentId}`],
    enabled: !!booking?.equipmentId,
    retry: 3,
  });

  const handleDateSelect = (start: Date | undefined, end: Date | undefined) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleReviewSuccess = () => {
    setShowRatingDialog(false);
    queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/equipment/${booking?.equipmentId}`] });
  };

  if (isLoadingBooking || isLoadingEquipment) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!booking || !equipment) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-2xl font-bold mb-4">
              {t('booking.notFound')}
            </h1>
            <p className="text-muted-foreground mb-4">
              {t('booking.noAccess')}
            </p>
            <Button onClick={() => setLocation('/dashboard')}>
              {t('common.returnToDashboard')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="container mx-auto">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-2xl font-bold mb-4">
              {t('booking.details')} #{booking?.id}
            </h1>

            {equipment && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">
                  {t('equipment.details', 'Equipment Details')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <img
                      src={equipment.imageUrl}
                      alt={equipment.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">{equipment.name}</h3>
                    <p className="text-muted-foreground mt-2">{equipment.description}</p>
                    <p className="mt-2">
                      <span className="font-medium">{t('equipment.category')}:</span>{' '}
                      {equipment.category}
                    </p>
                    <p>
                      <span className="font-medium">{t('equipment.location')}:</span>{' '}
                      {equipment.location}
                    </p>
                    <p>
                      <span className="font-medium">{t('equipment.dailyRate')}:</span>{' '}
                      ₹{equipment.dailyRate}/day
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <CalendarHeatmap
                equipmentId={equipment?.id || 0}
                startDate={startDate}
                endDate={endDate}
                dailyRate={equipment?.dailyRate || 0}
                onSelect={handleDateSelect}
                onConfirm={() => {
                  console.log('Booking confirmed:', { startDate, endDate });
                }}
              />
            </div>

            <div className="space-y-4">
              {booking && (
                <>
                  <p>
                    <span className="font-semibold">{t('booking.dates')}:</span>{' '}
                    {format(new Date(booking.startDate), 'PP')} - {format(new Date(booking.endDate), 'PP')}
                  </p>
                  <p>
                    <span className="font-semibold">{t('booking.totalPrice')}:</span>{' '}
                    {t('common.price', { price: booking.totalPrice })}
                  </p>
                  <p>
                    <span className="font-semibold">{t('booking.status')}:</span>{' '}
                    <span className="capitalize">{t(`booking.status.${booking.status}`)}</span>
                  </p>

                  {booking.status === 'paid' && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        console.log('Download receipt clicked for booking:', booking.id);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t('booking.downloadReceipt', 'Download Receipt')}
                    </Button>
                  )}

                  {booking.status === 'awaiting_payment' && booking.razorpayOrderId && (
                    <PaymentGateway
                      bookingId={booking.id}
                      totalPrice={booking.totalPrice}
                      razorpayOrderId={booking.razorpayOrderId}
                      userData={booking.user || {}}
                      onSuccess={() => setShowRatingDialog(true)}
                      onError={(error: Error) => {
                        toast({
                          title: t('payment.error'),
                          description: error.message,
                          variant: "destructive",
                        });
                      }}
                    />
                  )}

                  {booking.status === 'paid' && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setShowRatingDialog(true)}
                    >
                      <Star className="w-4 h-4 mr-2" />
                      {t('review.rateBooking')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {equipment && (
        <ReviewForm
          equipmentId={equipment.id}
          isOpen={showRatingDialog}
          onOpenChange={setShowRatingDialog}
          onSubmitSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}