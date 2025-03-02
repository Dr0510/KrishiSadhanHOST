import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertEquipmentSchema, insertBookingSchema, updateProfileSchema, reviewSchema, receipts } from "@shared/schema";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import express from 'express';
import fs from 'fs';
import { format } from 'date-fns';
import { createPaymentSession, verifyPaymentSignature, generateReceipt } from "./payment";
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

// Configure cloudinary
import { v2 as cloudinary } from 'cloudinary';
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('Invalid file type. Only JPEG, PNG and WebP images are allowed.');
      return cb(error as any, false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // User profile routes
  app.post("/api/user/profile/image", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).send("No image uploaded");

    try {
      // Convert buffer to base64 string
      const base64Image = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'equipment-rental/profiles'
      });

      const imageUrl = result.secure_url;
      await storage.updateUser(req.user.id, { imageUrl });
      res.json({ imageUrl });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      res.status(500).json({ 
        error: 'Failed to upload image',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const updatedUser = await storage.updateUser(req.user.id, parsed.data);
    res.json(updatedUser);
  });

  // Equipment routes with enhanced error handling and logging
  app.get("/api/equipment", async (req, res) => {
    try {
      const owned = req.query.owned === 'true';
      console.log('Fetching equipment, owned filter:', owned);

      // If owned=true, require authentication and only return user's equipment
      if (owned) {
        if (!req.isAuthenticated()) {
          console.log('Unauthorized attempt to view owned equipment');
          return res.status(401).json({ error: 'Authentication required to view owned equipment' });
        }
        const equipment = await storage.listEquipmentByOwner(req.user.id);
        console.log(`Found ${equipment.length} items owned by user ${req.user.id}`);
        return res.json(equipment);
      }

      // Otherwise return all equipment (for the marketplace view)
      const equipment = await storage.listEquipment();
      console.log(`Found ${equipment.length} total equipment items`);

      // Instead of filtering, return all equipment with their availability status
      equipment.forEach(item => {
        console.log(`Equipment ${item.id}: availability = ${item.availability}`);
      });

      res.json(equipment);
    } catch (error) {
      console.error('Error listing equipment:', error);
      res.status(500).json({ error: 'Failed to list equipment' });
    }
  });

  app.get("/api/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.getEquipment(parseInt(req.params.id));
      if (!equipment) return res.status(404).json({ error: "Equipment not found" });
      res.json(equipment);
    } catch (error) {
      console.error('Error getting equipment:', error);
      res.status(500).json({ error: 'Failed to get equipment details' });
    }
  });

  // Enhanced equipment creation endpoint
  app.post("/api/equipment", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          error: 'Image is required',
          details: 'Please upload an equipment image'
        });
      }

      console.log('Uploading equipment image to Cloudinary...');

      // Convert buffer to base64 string
      const base64Image = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

      // Upload to cloudinary with specific options
      const imageResult = await cloudinary.uploader.upload(dataURI, {
        folder: 'equipment-rental/equipment',
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto'
      });

      console.log('Cloudinary upload successful:', {
        publicId: imageResult.public_id,
        url: imageResult.secure_url
      });

      // Parse and validate JSON fields
      let specs = {};
      let features = [];

      try {
        if (req.body.specs) {
          specs = JSON.parse(req.body.specs);
          if (typeof specs !== 'object' || Array.isArray(specs)) {
            throw new Error('Specs must be an object');
          }
        }

        if (req.body.features) {
          features = JSON.parse(req.body.features);
          if (!Array.isArray(features)) {
            throw new Error('Features must be an array');
          }
        }
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid JSON format',
          details: error instanceof Error ? error.message : 'Invalid specs or features format'
        });
      }

      // Get coordinates from cityCoordinates map
      const cityCoordinates = {
        'pune': [18.5204, 73.8567],
        'mumbai': [19.0760, 72.8777],
        'delhi': [28.6139, 77.2090],
        'bangalore': [12.9716, 77.5946],
        'hyderabad': [17.3850, 78.4867],
        'chennai': [13.0827, 80.2707],
        'kolkata': [22.5726, 88.3639],
        'ahmedabad': [23.0225, 72.5714],
        'latur': [18.4088, 76.5604],
        'nilanga': [18.1177, 76.7506],
        'aurangabad': [19.8762, 75.3433],
        'chh. sambhajinagar': [19.8762, 75.3433],
        'nagpur': [21.1458, 79.0882],
        'nashik': [19.9975, 73.7898],
      };

      // Clean and format location string
      const location = req.body.location?.toLowerCase().trim();
      // Try different location formats
      const coordinates = cityCoordinates[location] || 
                        cityCoordinates[location.replace('.', '')] || // Try without period
                        cityCoordinates[location.replace(' ', '')] || // Try without space
                        null;

      const equipmentData = {
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        dailyRate: parseInt(req.body.dailyRate),
        location: req.body.location,
        specs,
        features,
        ownerId: req.user.id,
        imageUrl: imageResult.secure_url,
        availability: true,
        latitudeCoord: coordinates ? coordinates[0] : null,
        longitudeCoord: coordinates ? coordinates[1] : null
      };

      const parsed = insertEquipmentSchema.safeParse(equipmentData);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.errors
        });
      }

      const equipment = await storage.createEquipment(parsed.data);
      console.log('Equipment created successfully:', {
        id: equipment.id,
        name: equipment.name,
        imageUrl: equipment.imageUrl
      });

      res.status(201).json({
        message: 'Equipment created successfully',
        equipment
      });
    } catch (error) {
      console.error('Error creating equipment:', error);
      res.status(500).json({
        error: 'Failed to create equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add equipment update endpoint
  app.patch("/api/equipment/:id", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const equipmentId = parseInt(req.params.id);
      const equipment = await storage.getEquipment(equipmentId);

      if (!equipment) {
        return res.status(404).json({ error: 'Equipment not found' });
      }

      // Only allow equipment owner or admin to update
      if (equipment.ownerId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ error: 'Not authorized to update this equipment' });
      }

      let updateData: any = { ...req.body };

      // Handle image upload if new image is provided
      if (req.file) {
        console.log('Uploading new equipment image to Cloudinary...');

        const base64Image = req.file.buffer.toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

        const imageResult = await cloudinary.uploader.upload(dataURI, {
          folder: 'equipment-rental/equipment',
          resource_type: 'image',
          quality: 'auto',
          fetch_format: 'auto'
        });

        console.log('Cloudinary upload successful:', {
          publicId: imageResult.public_id,
          url: imageResult.secure_url
        });

        updateData.imageUrl = imageResult.secure_url;
      }

      // Handle specs and features parsing
      if (req.body.specs) {
        try {
          updateData.specs = JSON.parse(req.body.specs);
          if (typeof updateData.specs !== 'object' || Array.isArray(updateData.specs)) {
            throw new Error('Specs must be an object');
          }
        } catch (e) {
          return res.status(400).json({ error: 'Invalid specs format' });
        }
      }

      if (req.body.features) {
        try {
          updateData.features = JSON.parse(req.body.features);
          if (!Array.isArray(updateData.features)) {
            throw new Error('Features must be an array');
          }
        } catch (e) {
          return res.status(400).json({ error: 'Invalid features format' });
        }
      }

      if (req.body.dailyRate) {
        updateData.dailyRate = parseInt(req.body.dailyRate);
      }

      console.log('Updating equipment with data:', {
        id: equipmentId,
        ...updateData
      });

      const updated = await storage.updateEquipment(equipmentId, updateData);
      res.json(updated);
    } catch (error) {
      console.error('Error updating equipment:', error);
      res.status(500).json({
        error: 'Failed to update equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update the availability endpoint to be more robust
  app.get("/api/equipment/:id/availability", async (req, res) => {
    try {
      const equipmentId = parseInt(req.params.id);
      if (isNaN(equipmentId)) {
        console.error('Invalid equipment ID:', req.params.id);
        return res.status(400).json({ error: 'Invalid equipment ID' });
      }

      // Parse dates with validation
      const now = new Date();
      let startDate = now;
      let endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30); // Default to 30 days from now

      if (req.query.startDate) {
        const parsedStart = new Date(req.query.startDate as string);
        if (!isNaN(parsedStart.getTime())) {
          startDate = parsedStart;
        } else {
          console.error('Invalid start date:', req.query.startDate);
          return res.status(400).json({ error: 'Invalid start date format' });
        }
      }

      if (req.query.endDate) {
        const parsedEnd = new Date(req.query.endDate as string);
        if (!isNaN(parsedEnd.getTime())) {
          endDate = parsedEnd;
        } else {
          console.error('Invalid end date:', req.query.endDate);
          return res.status(400).json({ error: 'Invalid end date format' });
        }
      }

      // Ensure startDate is not in the past
      if (startDate < now) {
        startDate = now;
      }

      // Ensure endDate is after startDate
      if (endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 30);
      }

      // First check if equipment exists
      const equipment = await storage.getEquipment(equipmentId);
      if (!equipment) {
        return res.status(404).json({ error: 'Equipment not found' });
      }

      // Check if equipment is generally available
      if (!equipment.availability) {
        return res.json({
          available: false,
          message: 'Equipment is not available for booking'
        });
      }

      // Check specific date range availability
      const isAvailable = await storage.checkEquipmentAvailability(
        equipmentId,
        startDate,
        endDate
      );

      res.json({
        available: isAvailable,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        message: isAvailable ? 'Equipment is available for the selected dates' : 'Equipment is not available for the selected dates'
      });
    } catch (error) {
      console.error('Error checking equipment availability:', error);
      res.status(500).json({
        error: 'Failed to check equipment availability',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add equipment availability update endpoint for owners
  app.patch("/api/equipment/:id/availability", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const equipmentId = parseInt(req.params.id);
      const equipment = await storage.getEquipment(equipmentId);

      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      // Verify ownership
      if (equipment.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this equipment" });
      }

      const { available } = req.body;

      // Update equipment availability
      const updated = await storage.updateEquipment(equipmentId, {
        availability: available
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating availability:', error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  });

  // Add equipment delete endpoint
  app.delete("/api/equipment/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const equipmentId = parseInt(req.params.id);
      const equipment = await storage.getEquipment(equipmentId);

      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      // Only allow equipment owner to delete
      if (equipment.ownerId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ error: "Not authorized to delete this equipment" });
      }

      // Delete equipment from storage
      await storage.deleteEquipment(equipmentId);

      // Also delete any related bookings
      await storage.deleteEquipmentBookings(equipmentId);

      res.json({ success: true, message: "Equipment deleted successfully" });
    } catch (error) {
      console.error('Error deleting equipment:', error);
      res.status(500).json({
        error: "Failed to delete equipment",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Update the booking creation endpoint to use Razorpay
  app.post("/api/bookings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const bookingData = {
        ...req.body,
        userId: req.user.id,
        status: 'pending'
      };

      const parsed = insertBookingSchema.safeParse(bookingData);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid booking data",
          details: parsed.error.errors
        });
      }

      const equipment = await storage.getEquipment(parsed.data.equipmentId);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      // Check if equipment is available
      if (!equipment.availability) {
        return res.status(400).json({ error: "Equipment is not available for booking" });
      }

      // Calculate rental duration in days including both start and end dates
      const startDate = new Date(parsed.data.startDate);
      const endDate = new Date(parsed.data.endDate);
      const totalDays = Math.max(1, Math.ceil(
        (endDate.getTime() - startDate.getTime()) /
        (1000 * 3600 * 24)
      ) + 1); // Add 1 to include both start and end dates

      // Calculate total amount based on daily rate and duration
      const totalAmount = equipment.dailyRate * totalDays;

      // First check if equipment is still available
      const isAvailable = await storage.checkEquipmentAvailability(
        parsed.data.equipmentId,
        startDate,
        endDate
      );

      if (!isAvailable) {
        return res.status(400).json({ error: "Equipment is no longer available for these dates" });
      }

      // Create booking record with calculated total price
      const booking = await storage.createBooking({
        ...parsed.data,
        totalPrice: totalAmount,
        startDate,
        endDate,
        status: 'pending'
      });

      try {
        // Lock equipment by marking it unavailable
        await storage.updateEquipment(parsed.data.equipmentId, {
          availability: false
        });

        // Create Razorpay order
        const razorpayOrder = await createPaymentSession(booking.id, totalAmount * 100, equipment.name); // Amount in paise

        // Update booking with Razorpay order info
        const updatedBooking = await storage.updateBooking(booking.id, {
          status: 'awaiting_payment',
          razorpayOrderId: razorpayOrder.id
        });

        console.log(`Created booking ${booking.id} for equipment ${equipment.id}, awaiting payment`);

        // Return booking info with complete Razorpay configuration
        res.status(201).json({
          booking: updatedBooking,
          razorpayConfig: {
            key: razorpayOrder.keyId,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            name: razorpayOrder.name,
            description: razorpayOrder.description,
            order_id: razorpayOrder.id,
            prefill: razorpayOrder.prefill
          }
        });
      } catch (paymentError) {
        console.error('Error in payment order creation:', paymentError);

        // Revert equipment availability if payment setup fails
        await storage.updateEquipment(parsed.data.equipmentId, {
          availability: true
        });

        // Update booking status to payment_failed
        await storage.updateBooking(booking.id, { status: 'payment_failed' });

        res.status(400).json({
          error: "Payment order creation failed",
          details: paymentError instanceof Error ? paymentError.message : "Unknown payment error"
        });
      }
    } catch (error) {
      console.error('Error in booking creation:', error);
      res.status(500).json({
        error: "Failed to process booking",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update the receipt generation in payment verification endpoint
  app.post("/api/bookings/verify-payment", express.json(), async (req, res) => {
    try {
      const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        console.error('Missing required payment verification fields:', req.body);
        return res.status(400).json({
          error: 'Missing required payment details',
          details: 'All payment verification fields are required'
        });
      }

      // Get the booking details
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        console.error(`Booking not found for verification: ${bookingId}`);
        return res.status(404).json({ error: 'Booking not found' });
      }

      // Get equipment details for receipt
      const equipment = await storage.getEquipment(booking.equipmentId);
      if (!equipment) {
        console.error(`Equipment not found for booking: ${bookingId}`);
        return res.status(404).json({ error: 'Equipment not found' });
      }

      // Verify payment signature
      const isValid = await verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) {
        console.error('Invalid payment signature for booking:', bookingId);
        return res.status(400).json({ error: 'Invalid payment signature' });
      }

      // Update booking status
      const updatedBooking = await storage.updateBooking(bookingId, {
        status: 'paid',
        razorpayPaymentId: razorpay_payment_id
      });

      console.log('Creating receipt with metadata...');

      // Create receipt with simplified metadata
      const receipt = await storage.createReceipt({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalPrice * 100, // Amount in paise
        status: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        metadata: {
          equipment_name: equipment.name,
          booking_dates: {
            start: booking.startDate.toISOString(),
            end: booking.endDate.toISOString()
          },
          payment_method: 'razorpay'
        },
        generatedAt: new Date()
      });

      console.log(`Successfully generated receipt for booking ${bookingId}`);

      res.json({
        success: true,
        booking: updatedBooking,
        receipt,
        message: 'Payment verified and receipt generated successfully'
      });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({
        error: 'Payment verification failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add receipt listing endpoint
  app.get("/api/receipts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const receipts = await storage.listReceipts(req.user.id);

      // Log receipt amounts for debugging
      console.log('Receipt amounts:', receipts.map(r => ({
        id: r.id,
        amount: r.amount,
        amountInRupees: r.amount / 100
      })));

      res.json(receipts.map(receipt => ({
        ...receipt,
        amount: Number(receipt.amount), // Ensure amount is a number
        generatedAt: receipt.generatedAt.toISOString()
      })));
    } catch (error) {
      console.error('Error fetching receipts:', error);
      res.status(500).json({
        error: "Failed to fetch receipts",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add endpoint to get a specific receipt
  app.get("/api/receipts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const receiptId = parseInt(req.params.id);
      const receipt = await storage.getReceipt(receiptId);

      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found" });
      }

      // Check if the receipt belongs to the authenticated user
      if (receipt.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access this receipt" });
      }

      res.json({
        ...receipt,
        amount: Number(receipt.amount),
        generatedAt: receipt.generatedAt.toISOString()
      });
    } catch (error) {
      console.error('Error fetching receipt:', error);
      res.status(500).json({ error: "Failed to fetch receipt" });
    }
  });
  // Add endpoint to get a specific receipt by bookingId
  app.get("/api/bookings/:id/receipt", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) {
        return res.status(400).json({ error: "Invalid booking ID" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const receipt = await storage.getReceiptByBookingId(bookingId);
      if (!receipt) {
        // Create receipt if it doesn't exist for a paid booking
        if (booking.status === 'paid') {
          const newReceipt = await storage.createReceipt({
            bookingId: booking.id,
            userId: booking.userId,
            amount: booking.totalPrice * 100, // Amount in paise
            status: 'paid',
            razorpayPaymentId: booking.razorpayPaymentId,
            metadata: {
              equipment_name: (await storage.getEquipment(booking.equipmentId))?.name,
              booking_dates: {
                start: booking.startDate.toISOString(),
                end: booking.endDate.toISOString()
              },
              payment_method: 'razorpay'
            },
            generatedAt: new Date()
          });
          return res.json(newReceipt);
        }
        return res.status(404).json({ error: "Receipt not found" });
      }

      // Check if the receipt belongs to the authenticated user
      if (receipt.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access this receipt" });
      }

      res.json(receipt);
    } catch (error) {
      console.error('Error fetching receipt:', error);
      res.status(500).json({ error: "Failed to fetch receipt" });
    }
  });

  // Update the webhook handler
  app.post("/api/webhooks/razorpay", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      // If webhook secret is configured, verify the signature
      if (webhookSecret) {
        const signature = req.headers['x-razorpay-signature'];
        if (!signature) {
          return res.status(400).json({ error: 'Missing signature' });
        }

        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(req.body)
          .digest('hex');

        if (signature !== expectedSignature) {
          return res.status(400).json({ error: 'Invalid signature' });
        }
      }

      const event = JSON.parse(req.body.toString());
      const result = await handleWebhookEvent(event);

      if (result) {
        if (result.status === 'success' && result.paymentId) {
          // Update booking status
          const booking = await storage.updateBooking(result.bookingId, {
            status: 'paid',
            razorpayPaymentId: result.paymentId
          });

          // Also update equipment availability
          if (booking) {
            await storage.updateEquipment(booking.equipmentId, {
              availability: false
            });

            // Generate receipt with the payment ID
            await generateReceipt(result.bookingId, result.paymentId);
          }
        } else if (result.status === 'failed') {
          // Update booking status to failed and ensure equipment remains available
          const booking = await storage.updateBooking(result.bookingId, {
            status: 'payment_failed'
          });

          if (booking) {
            await storage.updateEquipment(booking.equipmentId, {
              availability: true
            });
          }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Webhook Error:', err);
      if (err instanceof Error) {
        res.status(400).send(`Webhook Error: ${err.message}`);
      } else {
        res.status(400).send('Webhook Error: Unknown error');
      }
    }
  });

  // Fix for the typo in the payment-config endpoint
  app.get("/api/bookings/:id/payment-config", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.getBooking(bookingId);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access this booking" });
      }

      const equipment = await storage.getEquipment(booking.equipmentId);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      const config = await createPaymentSession(bookingId, booking.totalPrice * 100, equipment.name); // Amount in paise
      res.json(config);
    } catch (error) {
      console.error('Error getting payment configuration:', error);
      res.status(500).json({
        error: "Failed to get payment configuration",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Booking details endpoint with authentication and authorization
  app.get("/api/bookings/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthorized attempt to access booking:', req.params.id);
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) {
        console.error('Invalid booking ID:', req.params.id);
        return res.status(400).json({ error: "Invalid booking ID" });
      }

      console.log(`Looking up booking ${bookingId} for user ${req.user.id}`);
      const booking = await storage.getBooking(bookingId);

      if (!booking) {
        console.log(`Booking ${bookingId} not found`);
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check if the user has permission to view this booking
      if (booking.userId !== req.user.id && !req.user.isAdmin) {
        console.log(`User ${req.user.id} not authorized to view booking ${bookingId}`);
        return res.status(403).json({ error: "Not authorized to view this booking" });
      }

      console.log(`Successfully retrieved booking ${bookingId}`);
      res.json(booking);
    } catch (error) {
      console.error('Error getting booking:', error);
      res.status(500).json({ error: "Failed to get bookingdetails" });
    }
  });

  // Add bookings list endpoint with enhanced logging
  app.get("/api/bookings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log('Unauthorized attempt to access bookings');
        return res.status(401).json({ error: "Authentication required" });
      }

      console.log('User requesting bookings:', {
        userId: req.user.id,
        isAdmin: req.user.isAdmin,
        queryUserId: req.query.userId
      });

      // If a specific userId is providedin query, verify access rights
      const requestedUserId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      if (requestedUserId && requestedUserId !== req.user.id && !req.user.isAdmin) {
        console.log('User not authorized to view other users bookings');
        return res.status(403).json({ error: "Not authorized to view these bookings" });
      }

      // Use the authenticated user's ID if no specific ID isrequested
      const userIdToQuery = requestedUserId || req.user.id;
      console.log('Fetching bookings for userId:',userIdToQuery);

      const bookings = await storage.listBookings(userIdToQuery);
      console.log(`Found ${bookings.length} bookings for user ${userIdToQuery}`);

      res.json(bookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      res.status(500).json({
        error: "Failed to fetch bookings",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Equipment comparison routes
  app.post("/api/comparisons/comparisons/add/:equipmentId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }

    try {
      const equipmentId = parseInt(req.params.equipmentId);
      await storage.addToComparison(req.user.id, equipmentId);
      res.sendStatus(200);
    } catch (error) {      console.error('Error adding to comparison:', error);
      res.status(500).json({ error: "Failed to add to comparison" });
    }
  });

  app.delete("/api/comparisons/remove/:equipmentId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }

    try {
      const equipmentId = parseInt(req.params.equipmentId);
      await storage.removeFromComparison(req.user.id, equipmentId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error removing from comparison:', error);
      res.status(500).json({ error: "Failed to remove from comparison" });
    }
  });

  app.get("/api/comparisons", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }

    try {
      const equipment = await storage.getComparison(req.user.id);
      res.json(equipment);
    } catch (error) {
      console.error('Error fetching comparison:', error);
      res.status(500).json({ error: "Failed to fetch comparison" });
    }
  });

  // Add recommendation routes
  app.get("/api/recommendations", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }

    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user's booking history
      const userBookings = await storage.listBookings(user.id);

      // Get all equipment
      const allEquipment = await storage.listEquipment();

      // Calculate recommendations based on user preferences and history
      const recommendations = allEquipment.map(equipment => {
        let score = 0;
        let reasons = [];

        // Category preference matching
        if (user.preferences.preferredCategories.includes(equipment.category)) {
          score += 30;
          reasons.push(`Matches your preferred category: ${equipment.category}`);        }

        // Location preference matching
        if (user.preferences.preferredLocations.includes(equipment.location)) {
          score += 20;
          reasons.push(`Available in your preferred location: ${equipment.location}`);
        }

        // Price range matching
        if (equipment.dailyRate >= user.preferences.priceRange.min &&
          equipment.dailyRate <= user.preferences.priceRange.max) {
          score += 15;
          reasons.push('Within your preferred price range');
        }

        // Feature matching
        const matchingFeatures = equipment.features.filter(feature =>
          user.preferences.features.includes(feature)
        );
        if (matchingFeatures.length > 0) {
          score += 5 * matchingFeatures.length;
          reasons.push(`Has ${matchingFeatures.length} features you prefer`);
        }

        // Popularity bonus
        if (equipment.popularity > 0) {
          score += Math.min(10, equipment.popularity);
        }

        // Previous rental bonus
        if (userBookings.some(booking => booking.equipmentId === equipment.id)) {
          score += 10;
          reasons.push('You have rented this before');
        }

        return {
          equipment,
          score: Math.min(100, score), // Cap at 100%
          reason: reasons[0] || 'Recommended based on your preferences'
        };
      });

      // Sort by score and take top recommendations
      const topRecommendations = recommendations
        .filter(rec => rec.score > 30) // Only include items with decent match
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Limit to top 5

      // Store recommendations
      await Promise.all(topRecommendations.map(async (rec) => {
        await storage.createRecommendation({
          userId: user.id,
          equipmentId: rec.equipment.id,
          score: rec.score,
          reason: rec.reason
        });
      }));

      res.json(topRecommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({
        error: "Failed to generate recommendations",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Receipt download endpoint with improved error handling
  app.get("/api/receipts/:id/download", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const receiptId = parseInt(req.params.id);
      const receipt = await storage.getReceipt(receiptId);

      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found" });
      }

      // Check if the receipt belongs to the authenticated user
      if (receipt.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access this receipt" });
      }

      // Get associated booking and equipment details
      const booking = await storage.getBooking(receipt.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Associated booking not found" });
      }

      const equipment = await storage.getEquipment(booking.equipmentId);
      if (!equipment) {
        return res.status(404).json({ error: "Associated equipment not found" });
      }

      // Generate filename
      const filename = `receipt_${receipt.id}_${format(receipt.generatedAt, 'yyyyMMdd')}.pdf`;

      // Create PDF document with proper formatting options
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Handle errors in the PDF generation stream
      doc.on('error', (error) => {
        console.error('PDF generation error:', error);
        // Only send error if headers haven't been sent
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to generate PDF" });
        }
      });

      // Pipe the PDF document to the response stream
      doc.pipe(res);

      // Add company header with styling
      doc.fontSize(20)
         .text('Agricultural Equipment Rental', { align: 'center' })
         .moveDown(0.5);

      doc.fontSize(14)
         .text('Receipt', { align: 'center' })
         .moveDown();

      // Add receipt details with proper formatting
      doc.fontSize(12)
         .text(`Receipt #: ${receipt.id}`)
         .text(`Date: ${format(receipt.generatedAt, 'PPpp')}`)
         .text(`Booking ID: ${booking.id}`)
         .text(`Payment ID: ${receipt.razorpayPaymentId}`)
         .moveDown();

      // Add equipment details
      doc.fontSize(12)
         .text('Equipment Details', { underline: true })
         .text(`Name: ${equipment.name}`)
         .text(`Category: ${equipment.category}`)
         .text(`Location: ${equipment.location}`)
         .text(`Daily Rate: ₹${equipment.dailyRate}`)
         .moveDown();

      // Add booking period details
      doc.text('Rental Period', { underline: true })
         .text(`Start Date: ${format(booking.startDate, 'PPP')}`)
         .text(`End Date: ${format(booking.endDate, 'PPP')}`)
         .moveDown();

      // Add payment details
      doc.text('Payment Details', { underline: true })
         .text(`Total Amount: ₹${receipt.amount / 100}`) //amount in rupees
         .text(`Payment Status: ${receipt.status}`)
         .text(`Payment Method: Razorpay`)
         .moveDown();

      // Add footer
      doc.fontSize(10)
         .text('Thank you for your business!', { align: 'center' })
         .text(`Generated on: ${format(new Date(), 'PPpp')}`, { align: 'center' });

      // Add page numbers
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .text(
             `Page ${i + 1} of ${pages.count}`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }

      // Finalize the PDF document
      doc.end();
    } catch (error) {
      console.error('Error generating receipt PDF:', error);
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to generate receipt PDF",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  app.get("/api/receipts/:id/download", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const receiptId = parseInt(req.params.id);
      const receipt = await storage.getReceipt(receiptId);

      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found" });
      }

      // Check if the receipt belongs to the authenticated user
      if (receipt.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access this receipt" });
      }

      // Get related booking and equipment details
      const booking = await storage.getBooking(receipt.bookingId);
      const equipment = booking ? await storage.getEquipment(booking.equipmentId) : null;
      const user = await storage.getUser(receipt.userId);

      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Receipt #${receipt.id}`,
          Author: 'Agricultural Equipment Rental',
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=receipt-${receipt.id}.pdf`);

      // Pipe the PDF directly to the response
      doc.pipe(res);

      // Add company logo or header with improved styling
      doc.font('Helvetica-Bold')
         .fontSize(24)
         .text('Agricultural Equipment Rental', { align: 'center' })
         .fontSize(16)
         .text('Payment Receipt', { align: 'center' })
         .moveDown();

      // Add receipt details with better formatting
      doc.font('Helvetica')
         .fontSize(12)
         .text(`Receipt Number: #${receipt.id}`, { align: 'right' })
         .text(`Date: ${format(new Date(receipt.generatedAt), 'PPP')}`, { align: 'right' })
         .moveDown();

      // Add a styled separator
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .lineWidth(1)
         .strokeColor('#CCCCCC')
         .stroke()
         .moveDown();

      // Equipment and booking details with improved layout
      if (equipment && booking) {
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .fillColor('#333333')
           .text('Equipment Details', { underline: true })
           .font('Helvetica')
           .fontSize(12)
           .fillColor('black')
           .moveDown(0.5);

        // Create a table-like structure for equipment details
        const detailsTable = {
          headers: ['Equipment Name', 'Category', 'Location'],
          rows: [[equipment.name, equipment.category, equipment.location]]
        };

        let xPos = 50;
        detailsTable.headers.forEach(header => {
          doc.text(header, xPos, doc.y, { width: 165, align: 'left' });
          xPos += 165;
        });

        doc.moveDown(0.5);
        xPos = 50;
        detailsTable.rows[0].forEach(cell => {
          doc.text(cell, xPos, doc.y, { width: 165, align: 'left' });
          xPos += 165;
        });

        doc.moveDown()
           .font('Helvetica-Bold')
           .text('Booking Period:', { underline: true })
           .font('Helvetica')
           .text(`From: ${format(new Date(booking.startDate), 'PPP')}`)
           .text(`To: ${format(new Date(booking.endDate), 'PPP')}`)
           .moveDown();
      }

      // Payment details with enhanced styling
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .text('Payment Details', { underline: true })
         .font('Helvetica')
         .fontSize(12)
         .moveDown(0.5);

      const paymentDetails = [
        ['Payment ID:', receipt.razorpayPaymentId],
        ['Payment Method:', receipt.metadata.payment_method || 'Online Payment'],
        ['Status:', receipt.status.toUpperCase()]
      ];

      paymentDetails.forEach(([label, value]) => {
        doc.text(`${label} ${value}`, { continued: false });
      });

      doc.moveDown();

      // Add amount in a styled box
      const boxTop = doc.y;
      doc.rect(50, boxTop, 495, 40)
         .fillAndStroke('#f8f9fa', '#e9ecef');

      doc.fill('#000000')
         .font('Helvetica-Bold')
         .fontSize(14)
         .text(
           'Total Amount: ' + 
           new Intl.NumberFormat('hi-IN', {
             style: 'currency',
             currency: 'INR',
             maximumFractionDigits: 0
           }).format(receipt.amount / 100),
           60,
           boxTop + 12,
           { align: 'right', width: 475 }
         );

      // Add styled footer
      const footerTop = doc.page.height - 100;
      doc.font('Helvetica')
         .fontSize(10)
         .fillColor('#666666')
         .text('Thank you for using our service', 50, footerTop, { align: 'center' })
         .moveDown(0.5)
         .text('For any queries, please contact support@agriculturequipment.com', { align: 'center' })
         .moveDown(0.5)
         .text(`Generated on ${format(new Date(), 'PPP')}`, { align: 'center' });

      // Add page numbers
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.text(
          `Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
      }

      // Finalize the PDF
      doc.end();
    } catch (error) {
      console.error('Error generating receipt PDF:', error);
      res.status(500).json({
        error: 'Failed to generate receipt PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/reviews", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      console.log('Received review data:', req.body);

      const reviewData = {
        ...req.body,
        userId: req.user.id,
        createdAt: new Date()
      };

      const parsed = reviewSchema.safeParse(reviewData);
      if (!parsed.success) {
        console.error('Review validation failed:', parsed.error);
        return res.status(400).json({
          error: "Invalid review data",
          details: parsed.error.errors
        });
      }

      console.log('Creating review with validated data:', parsed.data);
      const review = await storage.createReview(parsed.data);

      // Update equipment popularity after review
      await storage.updateEquipment(parsed.data.equipmentId, {
        popularity: await storage.calculateEquipmentPopularity(parsed.data.equipmentId)
      });

      // Update booking to mark it as rated
      if (req.body.bookingId) {
        await storage.updateBooking(req.body.bookingId, {
          isRated: true
        });
      }

      console.log('Review created successfully:', review);
      res.status(201).json(review);
    } catch (error) {
      console.error('Error creating review:', error);
      res.status(500).json({
        error: "Failed to create review",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/equipment/:id/reviews", async (req, res) => {
    try {
      const equipmentId = parseInt(req.params.id);
      if (isNaN(equipmentId)) {
        return res.status(400).json({ error: "Invalid equipment ID" });
      }

      const reviews = await storage.listEquipmentReviews(equipmentId);
      res.json(reviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      res.status(500).json({
        error: "Failed to fetch reviews",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return httpServer;
}

async function handleWebhookEvent(event: any): Promise<{ status: 'success' | 'failed'; bookingId: number; paymentId?: string } | null> {
  // This is a placeholder.  Replace with actual webhook event handling logic
  console.log("Webhook event received:", event);
  if (event.payload.payment.status === 'captured') {
    return { status: 'success', bookingId: event.payload.payment.order_id, paymentId: event.payload.payment.id };
  } else if (event.payload.payment.status === 'failed') {
    return { status: 'failed', bookingId: event.payload.payment.order_id };
  }
  return null;
}