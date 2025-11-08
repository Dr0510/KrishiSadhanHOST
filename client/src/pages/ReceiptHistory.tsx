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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Loader2, Eye, Calendar, CreditCard } from "lucide-react";
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

  // ✅ FIXED: Correct Razorpay amount (paise → rupees)
  const formatRupees = (amount: number) => {
    const rupees = Number(amount) / 100 || 0; // Razorpay returns amount in paise
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(rupees);
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

  const filteredReceipts = receipts || [];

  // ✅ FIXED: Divide by 100 when calculating totals
  const analytics = useMemo(() => {
    if (!receipts) return { total: 0, totalAmount: 0, paidCount: 0, pendingCount: 0 };

    const total = receipts.length;
    const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.amount / 100, 0);
    const paidCount = receipts.filter(r => r.status === 'paid').length;
    const pendingCount = receipts.filter(r => r.status === 'pending').length;

    return { total, totalAmount, paidCount, pendingCount };
  }, [receipts]);

  const getStatusInfo = (status: string) => {
    const statusDisplayMap: Record<string, { text: string; className: string; icon?: JSX.Element }> = {
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

    return statusDisplayMap[status.toLowerCase()] || {
      text: status.charAt(0).toUpperCase() + status.slice(1),
      className: "bg-gray-100 text-gray-800 border border-gray-200",
    };
  };

  const handleDownload = async (receiptId: number) => {
    try {
      toast({
        title: t("receipts.downloading", "Downloading Receipt..."),
        description: t("receipts.downloadingDesc", "Please wait while we prepare your receipt."),
      });

      const response = await fetch(`/api/receipts/${receiptId}/download`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to download receipt");

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
        description: t("receipts.downloadSuccessDesc", "Your receipt has been downloaded successfully."),
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        variant: "destructive",
        title: t("receipts.downloadError", "Download Failed"),
        description: t("receipts.downloadErrorDesc", "Failed to download the receipt. Please try again."),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">{t("receipts.title", "Receipt History")}</h1>
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
          <h1 className="text-2xl font-bold mb-6">{t("receipts.title", "Receipt History")}</h1>
          <Card>
            <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center p-6">
              <p className="text-destructive mb-4">{t("common.error", "Error")}</p>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : t("common.loadError", "Failed to load receipts")}
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
          <h1 className="text-2xl font-bold mb-6">{t("receipts.title", "Receipt History")}</h1>
          <Card>
            <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center p-6">
              <p className="text-muted-foreground">{t("receipts.noReceipts", "No receipts found")}</p>
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

        {/* Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader><CardTitle>Total Receipts</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{analytics.total}</div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Total Amount</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{formatRupees(analytics.totalAmount * 100)}</div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Paid</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{analytics.paidCount}</div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">{analytics.pendingCount}</div></CardContent>
          </Card>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card shadow-custom">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Receipt ID</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Booking Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Generated On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceipts.map((receipt) => {
                const statusInfo = getStatusInfo(receipt.status);
                return (
                  <TableRow key={receipt.id} className="hover:bg-muted/20">
                    <TableCell>#{receipt.id}</TableCell>
                    <TableCell>{receipt.metadata.equipment_name || "N/A"}</TableCell>
                    <TableCell>
                      {receipt.metadata.booking_dates
                        ? `${formatDate(receipt.metadata.booking_dates.start)} to ${formatDate(receipt.metadata.booking_dates.end)}`
                        : "N/A"}
                    </TableCell>
                    <TableCell>{formatRupees(receipt.amount)}</TableCell>
                    <TableCell>
                      <span className={statusInfo.className}>{statusInfo.icon}{statusInfo.text}</span>
                    </TableCell>
                    <TableCell>{formatDate(receipt.generatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleDownload(receipt.id)}>
                        <Download className="h-4 w-4 mr-1" /> PDF
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
