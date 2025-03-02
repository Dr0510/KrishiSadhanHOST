import Razorpay from 'razorpay';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import { storage } from './storage';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

export async function createPaymentSession(bookingId: number, amount: number, equipmentName: string) {
  try {
    console.log('Creating payment session for booking:', bookingId, 'amount:', amount);

    // Validate amount
    if (amount <= 0) {
      throw new Error('Invalid amount. Amount must be greater than 0');
    }

    // Amount is already in paise from frontend
    const amountInPaise = Math.floor(amount);
    console.log('Amount in paise:', amountInPaise);

    const orderOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `booking_${bookingId}`,
      notes: {
        bookingId: bookingId.toString(),
        equipmentName,
      },
    };
    console.log('Creating Razorpay order with options:', orderOptions);

    const order = await razorpay.orders.create(orderOptions);
    console.log('Razorpay order created:', order);

    if (!order?.id) {
      throw new Error('Failed to create Razorpay order');
    }

    const config = {
      id: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: 'INR',
      name: "AgriRent Equipment",
      description: `Booking for ${equipmentName}`,
      prefill: {
        name: '',
        email: '',
        contact: ''
      }
    };
    console.log('Returning payment configuration:', { ...config, keyId: '***' });
    return config;
  } catch (error) {
    console.error('Error creating payment session:', error);
    throw error;
  }
}

export async function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  try {
    const text = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(text)
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    console.error('Error verifying payment signature:', error);
    return false;
  }
}

interface RazorpayPayment {
  status: string;
  amount: number;
  currency: string;
  created_at: number;
  method: string;
  notes?: {
    equipmentName?: string;
  };
}

export async function generateReceipt(bookingId: number, paymentId: string) {
  try {
    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(paymentId) as RazorpayPayment;
    const booking = await storage.getBooking(bookingId);
    const equipment = booking ? await storage.getEquipment(booking.equipmentId) : null;
    const user = booking ? await storage.getUser(booking.userId) : null;

    if (!booking || !equipment || !user) {
      throw new Error('Required information not found');
    }

    // Create PDF document
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("AgriRent", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text("Payment Receipt", pageWidth / 2, 30, { align: "center" });

    // Receipt details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const startY = 50;
    const lineHeight = 7;
    let currentY = startY;

    // Transaction details
    doc.setFont("helvetica", "bold");
    doc.text("Transaction Details", 20, currentY);
    currentY += lineHeight * 1.5;

    doc.setFont("helvetica", "normal");
    doc.text(`Receipt No: ${bookingId}-${Date.now()}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Payment Date: ${new Date(payment.created_at * 1000).toLocaleString()}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Payment Method: ${payment.method.toUpperCase()}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Transaction ID: ${paymentId}`, 20, currentY);
    currentY += lineHeight * 2;

    // Customer details
    doc.setFont("helvetica", "bold");
    doc.text("Customer Details", 20, currentY);
    currentY += lineHeight * 1.5;

    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${user.name}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Contact: ${user.contact || 'N/A'}`, 20, currentY);
    currentY += lineHeight * 2;

    // Booking details
    doc.setFont("helvetica", "bold");
    doc.text("Booking Details", 20, currentY);
    currentY += lineHeight * 1.5;

    doc.setFont("helvetica", "normal");
    doc.text(`Equipment: ${equipment.name}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Booking Period: ${new Date(booking.startDate).toLocaleDateString()} to ${new Date(booking.endDate).toLocaleDateString()}`, 20, currentY);
    currentY += lineHeight;
    doc.text(`Daily Rate: ₹${equipment.dailyRate.toLocaleString('hi-IN')}`, 20, currentY);
    currentY += lineHeight * 2;

    // Payment details
    doc.setFont("helvetica", "bold");
    doc.text("Payment Summary", 20, currentY);
    currentY += lineHeight * 1.5;

    // Convert amount from paise to rupees for display
    const amountInRupees = payment.amount / 100;

    doc.setFont("helvetica", "normal");
    doc.text(`Amount Paid: ₹${amountInRupees.toLocaleString('hi-IN')}`, 20, currentY);
    doc.text(`Status: ${payment.status.toUpperCase()}`, pageWidth - 60, currentY);
    currentY += lineHeight * 2;

    // Footer
    const footerY = doc.internal.pageSize.height - 20;
    doc.setFontSize(8);
    doc.text("This is a computer generated receipt and does not require a signature.", pageWidth / 2, footerY, { align: "center" });

    // Save the receipt
    const pdfBuffer = doc.output('arraybuffer');
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    // Create receipt record in database with amount in paise
    const receiptData = {
      bookingId,
      userId: booking.userId,
      amount: payment.amount, // Amount in paise from Razorpay
      status: payment.status,
      razorpayPaymentId: paymentId,
      pdfUrl: `data:application/pdf;base64,${pdfBase64}`,
      metadata: {
        equipment_name: equipment.name,
        booking_dates: {
          start: booking.startDate.toISOString(),
          end: booking.endDate.toISOString()
        },
        payment_method: payment.method
      },
      generatedAt: new Date()
    };

    const receipt = await storage.createReceipt(receiptData);
    return {
      ...receipt,
      pdfUrl: receiptData.pdfUrl
    };
  } catch (error) {
    console.error('Error generating receipt:', error);
    throw new Error('Failed to generate receipt');
  }
}

interface WebhookSuccessResult {
  status: 'success';
  bookingId: number;
  orderId: string;
  paymentId: string;
}

interface WebhookFailureResult {
  status: 'failed';
  bookingId: number;
  error: string;
}

type WebhookResult = WebhookSuccessResult | WebhookFailureResult | null;

export async function handleWebhookEvent(event: any): Promise<WebhookResult> {
  try {
    switch (event.event) {
      case 'payment.captured':
        // Payment successful
        const { order_id, id: payment_id } = event.payload.payment.entity;
        const bookingId = parseInt(event.payload.payment.entity.notes.bookingId);

        if (!bookingId) {
          throw new Error('Booking ID not found in payment notes');
        }

        return {
          status: 'success',
          bookingId,
          orderId: order_id,
          paymentId: payment_id
        };

      case 'payment.failed':
        // Payment failed
        return {
          status: 'failed',
          bookingId: parseInt(event.payload.payment.entity.notes.bookingId),
          error: event.payload.payment.entity.error_description
        };

      default:
        // Unhandled event
        console.log('Unhandled webhook event:', event.event);
        return null;
    }
  } catch (error) {
    console.error('Error handling webhook event:', error);
    throw error;
  }
}