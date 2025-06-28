import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import type { Receipt } from "@shared/schema";
import { MainNav } from "@/components/main-nav";
import { useToast } from "@/hooks/use-toast";

interface ReceiptWithMetadata extends Receipt {
  metadata: {
    equipment_name?: string;
    booking_dates?: {
      start: string;
      end: string;
    };
    payment_method?: string;
  };
}

const ReceiptHistory = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    data: receipts,
    isLoading,
    error,
  } = useQuery<ReceiptWithMetadata[]>({
    queryKey: ["/api/receipts"],
    queryFn: async () => {
      const response = await fetch("/api/receipts", {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch receipts");
      }
      return response.json();
    },
  });

  const getStatusInfo = (status: string) => {
    const statusDisplayMap: Record<
      string,
      { text: string; className: string; icon?: JSX.Element }
    > = {
      paid: {
        text: t("receipts.status.paid", "Paid"),
        className: "bg-green-100 text-green-800 border border-green-200",
        icon: <span className="text-green-600 mr-1">✓</span>,
      },
      pending: {
        text: t("receipts.status.pending", "Pending"),
        className: "bg-yellow-100 text-yellow-800 border border-yellow-200",
        icon: <span className="text-yellow-600 mr-1">⏳</span>,
      },
      failed: {
        text: t("receipts.status.failed", "Failed"),
        className: "bg-red-100 text-red-800 border border-red-200",
        icon: <span className="text-red-600 mr-1">✗</span>,
      },
    };

    return (
      statusDisplayMap[status.toLowerCase()] || {
        text: status.charAt(0).toUpperCase() + status.slice(1),
        className: "bg-gray-100 text-gray-800 border border-gray-200",
      }
    );
  };

  const handleDownload = async (receiptId: number) => {
    try {
      toast({
        title: t("receipts.downloading", "Downloading Receipt..."),
        description: t(
          "receipts.downloadingDesc",
          "Please wait while we prepare your receipt.",
        ),
      });

      const response = await fetch(`/api/receipts/${receiptId}/download`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to download receipt");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receiptId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t("receipts.downloadSuccess", "Receipt Downloaded"),
        description: t(
          "receipts.downloadSuccessDesc",
          "Your receipt has been downloaded successfully.",
        ),
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        variant: "destructive",
        title: t("receipts.downloadError", "Download Failed"),
        description: t(
          "receipts.downloadErrorDesc",
          "Failed to download the receipt. Please try again.",
        ),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">
            {t("receipts.title", "Receipt History")}
          </h1>
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">
            {t("receipts.title", "Receipt History")}
          </h1>
          <Card>
            <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center p-6">
              <p className="text-destructive mb-4">
                {t("common.error", "Error")}
              </p>
              <p className="text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : t("common.loadError", "Failed to load receipts")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!receipts?.length) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">
            {t("receipts.title", "Receipt History")}
          </h1>
          <Card>
            <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center p-6">
              <p className="text-muted-foreground">
                {t("receipts.noReceipts", "No receipts found")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNav />
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {t("receipts.title", "Receipt History")}
        </h1>

        <div className="rounded-lg border bg-card shadow-custom">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-bold">
                  {t("receipts.receiptId", "Receipt ID")}
                </TableHead>
                <TableHead className="font-bold">
                  {t("receipts.equipment", "Equipment")}
                </TableHead>
                <TableHead className="font-bold">
                  {t("receipts.bookingPeriod", "Booking Period")}
                </TableHead>
                <TableHead className="font-bold">
                  {t("receipts.paymentStatus", "Payment Status")}
                </TableHead>
                <TableHead className="font-bold">
                  {t("receipts.generatedOn", "Generated On")}
                </TableHead>
                <TableHead className="text-right font-bold">
                  {t("common.actions", "Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts?.map((receipt) => {
                const statusInfo = getStatusInfo(receipt.status);
                return (
                  <TableRow
                    key={receipt.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="font-medium">#{receipt.id}</TableCell>
                    <TableCell>
                      {receipt.metadata.equipment_name ||
                        t("common.notAvailable", "N/A")}
                    </TableCell>
                    <TableCell>
                      {receipt.metadata.booking_dates ? (
                        <>
                          {formatDate(receipt.metadata.booking_dates.start)}{" "}
                          {t("common.to", "to")}{" "}
                          {formatDate(receipt.metadata.booking_dates.end)}
                        </>
                      ) : (
                        t("common.notAvailable", "N/A")
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}
                      >
                        {statusInfo.icon}
                        {statusInfo.text}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(receipt.generatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(receipt.id)}
                        className="inline-flex items-center gap-2 hover:bg-primary/10 transition-all"
                      >
                        <Download className="h-4 w-4" />
                        {t("receipts.download", "Download")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default ReceiptHistory;