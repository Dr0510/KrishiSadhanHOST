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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Loader2, Search, Filter, Eye, Calendar, CreditCard, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Receipt } from "@shared/schema";
import { MainNav } from "@/components/main-nav";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Format amount in Indian Rupees with proper formatting
  const formatRupees = (amount: number) => {
    // Convert paise to rupees before formatting
    const amountInRupees = amount / 100;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amountInRupees);
  };

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

  // Use all receipts since search is removed
  const filteredReceipts = receipts || [];

  // Calculate analytics
  const analytics = useMemo(() => {
    if (!receipts) return { total: 0, totalAmount: 0, paidCount: 0, pendingCount: 0 };

    const total = receipts.length;
    const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const paidCount = receipts.filter(r => r.status === 'paid').length;
    const pendingCount = receipts.filter(r => r.status === 'pending').length;

    return { total, totalAmount, paidCount, pendingCount };
  }, [receipts]);

  const getStatusInfo = (status: string) => {
    const statusDisplayMap: Record<
      string,
      { text: string; className: string; icon?: JSX.Element }
    > = {
      paid: {
        text: "Payment Confirmed",
        className: "bg-green-50 text-green-700 border border-green-200 font-medium px-3 py-1.5 rounded-full",
        icon: <span className="text-green-600 mr-1">✓</span>,
      },
      pending: {
        text: "Processing",
        className: "bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium px-3 py-1.5 rounded-full",
        icon: <span className="text-yellow-600 mr-1">⏳</span>,
      },
      failed: {
        text: "Payment Failed",
        className: "bg-red-50 text-red-700 border border-red-200 font-medium px-3 py-1.5 rounded-full",
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

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatRupees(analytics.totalAmount)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{analytics.paidCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{analytics.pendingCount}</div>
            </CardContent>
          </Card>
        </div>



        {/* Results Count */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {filteredReceipts.length} of {receipts?.length || 0} receipts
          </p>
          {filteredReceipts.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => {
              const totalFiltered = filteredReceipts.reduce((sum, r) => sum + r.amount, 0);
              toast({
                title: "Total Amount",
                description: `Total: ${formatRupees(totalFiltered)}`,
              });
            }}>
              <Eye className="h-4 w-4 mr-2" />
              Show Total
            </Button>
          )}
        </div>

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
                  {t("receipts.amount", "Amount")}
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
              {filteredReceipts?.map((receipt) => {
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
                    <TableCell className="font-medium">
                      {formatRupees(receipt.amount)}
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
                      <div className="flex gap-2 justify-end">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Receipt Details #{receipt.id}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-semibold text-sm">Equipment</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {receipt.metadata?.equipment_name || "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-sm">Payment Status</h4>
                                  <p className="text-sm font-medium text-green-600">
                                    Payment Confirmed
                                  </p>
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-sm">Booking Period</h4>
                                <p className="text-sm text-muted-foreground">
                                  {receipt.metadata?.booking_dates ? (
                                    `${formatDate(receipt.metadata.booking_dates.start)} to ${formatDate(receipt.metadata.booking_dates.end)}`
                                  ) : "N/A"}
                                </p>
                              </div>

                              <div className="border-t pt-4">
                                <h4 className="font-semibold text-sm mb-2">Rental Calculation</h4>
                                <div className="space-y-2 text-sm">
                                  {(() => {
                                    if (receipt.metadata?.booking_dates) {
                                      const startDate = new Date(receipt.metadata.booking_dates.start);
                                      const endDate = new Date(receipt.metadata.booking_dates.end);
                                      const daysRented = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                                      // Ensure dailyRate calculation handles potential division by zero or near-zero
                                      const dailyRate = daysRented > 0 ? Math.round(receipt.amount / daysRented) : receipt.amount;
                                      return (
                                        <>
                                          <div className="flex justify-between">
                                            <span>Daily Rate:</span>
                                            <span>{formatRupees(dailyRate)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Rental Period:</span>
                                            <span>{daysRented} day(s)</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Equipment Rental:</span>
                                            <span>{formatRupees(dailyRate)} × {daysRented} = {formatRupees(receipt.amount)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold border-t pt-2">
                                            <span>Total Amount Paid:</span>
                                            <span className="text-green-600">{formatRupees(receipt.amount)}</span>
                                          </div>
                                        </>
                                      );
                                    }
                                    return (
                                      <div className="flex justify-between font-bold">
                                        <span>Total Amount Paid:</span>
                                        <span className="text-green-600">{formatRupees(receipt.amount)}</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-sm">Payment Method</h4>
                                <p className="text-sm text-muted-foreground">
                                  {receipt.metadata?.payment_method || "Online Payment"}
                                </p>
                              </div>

                              <div>
                                <h4 className="font-semibold text-sm">Status</h4>
                                <Badge className={getStatusInfo(receipt.status).className}>
                                  {getStatusInfo(receipt.status).text}
                                </Badge>
                              </div>

                              <div>
                                <h4 className="font-semibold text-sm">Generated On</h4>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(receipt.generatedAt)}
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(receipt.id)}
                          className="hover:bg-primary/10"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
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