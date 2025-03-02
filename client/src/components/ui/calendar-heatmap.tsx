import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, isValid, parseISO, startOfToday, isBefore, differenceInDays, addDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, CalendarDays } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

interface CalendarHeatmapProps {
  equipmentId: number;
  startDate?: Date;
  endDate?: Date;
  dailyRate: number;
  onSelect: (startDate: Date | undefined, endDate: Date | undefined) => void;
  className?: string;
  onConfirm?: () => void;
  isConfirming?: boolean;
}

export function CalendarHeatmap({
  equipmentId,
  startDate,
  endDate,
  dailyRate,
  onSelect,
  className,
  onConfirm,
  isConfirming = false,
}: CalendarHeatmapProps) {
  const { t } = useTranslation();
  const [isChecking, setIsChecking] = React.useState(false);
  const today = startOfToday();
  const initialEndDate = addDays(today, 30);

  const selectedDateRange: DateRange | undefined = React.useMemo(
    () =>
      startDate && endDate
        ? { from: startDate, to: endDate }
        : undefined,
    [startDate, endDate]
  );

  const {
    data: availability,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [`/api/equipment/${equipmentId}/availability`],
    enabled: !isChecking && equipmentId > 0,
    queryFn: async () => {
      const formattedStartDate = format(today, "yyyy-MM-dd");
      const formattedEndDate = format(initialEndDate, "yyyy-MM-dd");
      setIsChecking(true);

      try {
        const response = await fetch(
          `/api/equipment/${equipmentId}/availability?startDate=${formattedStartDate}&endDate=${formattedEndDate}`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch availability: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.startDate || !data.endDate) {
          throw new Error("Invalid date range received from server");
        }

        setIsChecking(false);
        return {
          available: data.available,
          startDate: parseISO(data.startDate),
          endDate: parseISO(data.endDate),
          message: data.message,
        };
      } catch (error) {
        console.error("Error fetching availability:", error);
        setIsChecking(false);
        throw error;
      }
    },
  });

  const isDateAvailable = React.useCallback((date: Date): boolean => {
    if (!isValid(date) || !availability) return false;
    return !isBefore(date, today) && availability.available;
  }, [availability, today]);

  const handleSelect = React.useCallback((range: DateRange | undefined) => {
    if (!range) {
      onSelect(undefined, undefined);
      return;
    }

    const { from, to } = range;
    if (!from || !isDateAvailable(from)) {
      onSelect(undefined, undefined);
      return;
    }

    onSelect(from, to || from);
  }, [onSelect, isDateAvailable]);

  // Calculate total days and price
  const totalDays = React.useMemo(() => {
    if (!startDate || !endDate) return 0;
    return differenceInDays(endDate, startDate) + 1;
  }, [startDate, endDate]);

  const totalPrice = React.useMemo(() => {
    return totalDays * dailyRate;
  }, [totalDays, dailyRate]);

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : t("common.loadError")}
          </AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} variant="outline" className="w-full">
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (isLoading || isChecking) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border shadow-md">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
        <div>
        <Calendar
          mode="range"
          selected={selectedDateRange}
          onSelect={handleSelect}
          className={cn("rounded-t-lg", className)}
          disabled={(date) => !isDateAvailable(date)}
          fromDate={today}
          toDate={initialEndDate}
        />
        <div className="p-4 border-t">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-300"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-400"></div>
              <span>Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-primary"></div>
              <span>Selected</span>
            </div>
          </div>
        </div>
      </div>

        {/* Booking Summary - Inside scrollable area */}
        {startDate && endDate && (
          <div className="p-4 border-t">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-base">{t("booking.summary")}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">{t("booking.startDate")}</span>
              <span className="text-right">{format(startDate, "PPP")}</span>

              <span className="text-muted-foreground">{t("booking.endDate")}</span>
              <span className="text-right">{format(endDate, "PPP")}</span>

              <span className="text-muted-foreground">{t("booking.days")}</span>
              <span className="text-right">{totalDays}</span>

              <span className="text-muted-foreground font-medium">{t("booking.total")}</span>
              <span className="text-right font-medium">{formatPrice(totalPrice)}</span>
            </div>
          </div>
        )}

        {availability?.message && (
          <Alert variant="default" className="mx-4">
            <AlertDescription className="text-sm">
              {availability.message}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Confirm Button - Fixed at bottom, outside scroll area */}
      {onConfirm && startDate && endDate && (
        <div className="sticky bottom-0 p-4 border-t bg-background mt-auto">
          <Button 
            onClick={onConfirm} 
            className="w-full h-12 text-base font-medium"
            disabled={isConfirming}
          >
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.processing')}
              </>
            ) : (
              <>
                {t("booking.confirm")} ({formatPrice(totalPrice)})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}