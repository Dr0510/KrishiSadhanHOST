import { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

interface PaymentGatewayProps {
  bookingId: number;
  totalPrice: number;
  razorpayOrderId: string;
  userData: {
    name?: string;
    email?: string;
    phone?: string;
  };
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  showButton?: boolean;
}

const formatPrice = (amount: number): string => {
  return `₹${amount.toFixed(2)}`;
};

export function PaymentGateway({
  bookingId,
  totalPrice,
  razorpayOrderId,
  userData,
  onSuccess,
  onError,
  showButton = true
}: PaymentGatewayProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const loadScript = async () => {
      try {
        console.log('Attempting to load Razorpay script...');
        // Check if script is already loaded
        if (document.querySelector('script[src*="checkout.razorpay.com"]')) {
          console.log('Razorpay script already loaded');
          setIsScriptLoaded(true);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => {
          console.log('Razorpay script loaded successfully');
          setIsScriptLoaded(true);
        };
        script.onerror = (error) => {
          console.error('Error loading Razorpay script:', error);
          toast({
            title: t('payment.error', "Error"),
            description: t('payment.scriptLoadError', "Failed to load payment gateway. Please try again."),
            variant: "destructive",
          });
        };

        document.body.appendChild(script);
      } catch (error) {
        console.error('Error in loadScript:', error);
        toast({
          title: t('payment.error', "Error"),
          description: t('payment.scriptLoadError', "Failed to load payment gateway. Please try again."),
          variant: "destructive",
        });
      }
    };

    loadScript();
  }, [toast, t]);

  const handlePayment = async () => {
    console.log('Payment initialization started');

    if (!razorpayOrderId) {
      console.error('Missing razorpayOrderId');
      toast({
        title: t('payment.error', "Error"),
        description: t('payment.noOrder', "No payment order found"),
        variant: "destructive",
      });
      return;
    }

    if (!isScriptLoaded || !window.Razorpay) {
      console.error('Razorpay not ready', { isScriptLoaded, hasRazorpay: Boolean(window.Razorpay) });
      toast({
        title: t('payment.error', "Error"),
        description: t('payment.scriptLoadError', "Payment gateway is not ready. Please try again."),
        variant: "destructive",
      });
      return;
    }

    setIsLoadingPayment(true);

    try {
      // Fetch the payment configuration from the server
      const response = await fetch(`/api/bookings/${bookingId}/payment-config`, {
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error('Failed to get payment configuration');
      }

      const config = await response.json();
      console.log('Received payment configuration:', { 
        ...config, 
        keyId: '***',
        formattedAmount: formatPrice(config.amount / 100) 
      });

      // Format amount for display
      const displayAmount = formatPrice(config.amount / 100);

      const options: RazorpayOptions = {
        key: config.keyId,
        amount: config.amount,
        currency: config.currency,
        name: config.name,
        description: config.description,
        order_id: config.id,
        prefill: {
          name: userData.name || '',
          email: userData.email || '',
          contact: userData.phone || ''
        },
        modal: {
          ondismiss: () => {
            console.log('Payment modal dismissed');
            setIsLoadingPayment(false);
          }
        },
        theme: {
          color: "#0097FB"
        },
        handler: async function(response: RazorpayResponse) {
          console.log('Payment success handler called', response);
          try {
            const result = await fetch('/api/bookings/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                bookingId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }),
              credentials: "include",
            });

            if (!result.ok) {
              const errorData = await result.json();
              throw new Error(errorData.error || 'Payment verification failed');
            }

            // Invalidate all relevant queries to ensure fresh data
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['/api/equipment'] }),
              queryClient.invalidateQueries({ queryKey: ['/api/bookings'] }),
              queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] })
            ]);

            toast({
              title: t('payment.success', "Payment Successful"),
              description: t('payment.confirmed', "Your booking has been confirmed."),
            });

            onSuccess?.();
            setLocation('/dashboard'); // Redirect to dashboard after successful payment
          } catch (error) {
            console.error('Payment verification error:', error);
            onError?.(error as Error);
            toast({
              title: t('payment.failed', "Payment Failed"),
              description: error instanceof Error ? error.message : t('payment.verificationError', "Please try again or contact support."),
              variant: "destructive",
            });
          } finally {
            setIsLoadingPayment(false);
          }
        }
      };

      console.log('Initializing Razorpay instance...');
      const razorpayInstance = new window.Razorpay(options);

      razorpayInstance.on('payment.failed', (response: { error: RazorpayError }) => {
        console.error('Payment failed:', response.error);
        setIsLoadingPayment(false);
        onError?.(new Error(response.error.description));
        toast({
          title: t('payment.failed', "Payment Failed"),
          description: response.error.description,
          variant: "destructive",
        });
      });

      console.log('Opening Razorpay payment modal...');
      razorpayInstance.open();
    } catch (error) {
      console.error('Error initiating payment:', error);
      setIsLoadingPayment(false);
      onError?.(error as Error);
      toast({
        title: t('payment.error', "Error"),
        description: error instanceof Error ? error.message : t('payment.generic', "Failed to initiate payment"),
        variant: "destructive",
      });
    }
  };

  if (isLoadingPayment) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return showButton ? (
    <Button
      variant="outline"
      className="mt-2 w-full"
      onClick={handlePayment}
      disabled={!isScriptLoaded || isLoadingPayment}
    >
      {t('payment.payNow', 'Pay Now')}
    </Button>
  ) : null;
}