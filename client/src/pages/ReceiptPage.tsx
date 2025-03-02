import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { format } from 'date-fns';
import { MainNav } from "@/components/main-nav";

interface Receipt {
  id: number;
  bookingId: number;
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  timestamp: string;
  method: string;
  metadata: {
    equipment_name?: string;
    booking_dates?: {
      start: string;
      end: string;
    };
    renter_name?: string;
    renter_contact?: string;
    equipment_owner?: string;
    location?: string;
  };
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: receipt, isLoading } = useQuery<Receipt>({
    queryKey: [`/api/receipts/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/receipts/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch receipt');
      }
      return response.json();
    },
    enabled: !!id
  });

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/receipts/${id}/download`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to download receipt');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold mb-4 text-destructive">
                {t('receipt.notFound', 'Receipt Not Found')}
              </h1>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNav />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-3xl font-bold text-primary mb-2">
                  {t('receipt.title', 'Payment Receipt')}
                </h1>
                <p className="text-muted-foreground">
                  #{receipt.id} | {format(new Date(receipt.timestamp), 'PPP')}
                </p>
              </div>
              <Button 
                variant="default"
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('receipt.download', 'Download PDF')}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <h2 className="font-semibold mb-2">{t('receipt.equipmentDetails', 'Equipment Details')}</h2>
                <p className="text-muted-foreground">{receipt.metadata.equipment_name}</p>
                <p className="text-muted-foreground">{receipt.metadata.location}</p>
                <p className="text-muted-foreground">
                  {receipt.metadata.booking_dates && (
                    <>
                      {format(new Date(receipt.metadata.booking_dates.start), 'PPP')} - 
                      {format(new Date(receipt.metadata.booking_dates.end), 'PPP')}
                    </>
                  )}
                </p>
              </div>

              <div>
                <h2 className="font-semibold mb-2">{t('receipt.paymentDetails', 'Payment Details')}</h2>
                <p className="text-muted-foreground">
                  {t('receipt.paymentId', 'Payment ID')}: {receipt.paymentId}
                </p>
                <p className="text-muted-foreground">
                  {t('receipt.method', 'Method')}: {receipt.method}
                </p>
                <p className="text-muted-foreground">
                  {t('receipt.status', 'Status')}: 
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    receipt.status === 'paid' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {receipt.status}
                  </span>
                </p>
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex justify-between items-center text-xl font-semibold">
                <span>{t('receipt.totalAmount', 'Total Amount')}</span>
                <span>
                  {new Intl.NumberFormat('hi-IN', {
                    style: 'currency',
                    currency: receipt.currency || 'INR',
                    maximumFractionDigits: 0
                  }).format(receipt.amount / 100)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}