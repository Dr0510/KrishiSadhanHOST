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
import { GoogleGenerativeAI } from '@google/generative-ai';

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
      const cityCoordinates: Record<string, number[]> = {
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
        'barshi': [18.2333, 75.6833],
      };

      // Clean and format location string
      const location = req.body.location?.toLowerCase().trim();

      // Handle custom coordinates if provided
      let coordinates = null;

      // First check if direct coordinates were provided
      if (req.body.latitudeCoord && req.body.longitudeCoord) {
        const lat = parseFloat(req.body.latitudeCoord);
        const lng = parseFloat(req.body.longitudeCoord);
        if (!isNaN(lat) && !isNaN(lng)) {
          coordinates = [lat, lng];
          console.log('Using custom coordinates from form:', coordinates);
        }
      }

      // If no direct coordinates, try to find from city map
      if (!coordinates && location) {
        // Normalize location for comparison
        const normalizedLocation = location.toLowerCase().trim();

        // Try different location formats in the city map
        coordinates = cityCoordinates[normalizedLocation] || 
                      cityCoordinates[normalizedLocation.replace('.', '')] || // Try without period
                      cityCoordinates[normalizedLocation.replace(' ', '')] || // Try without space
                      null;

        if (coordinates) {
          console.log('Found coordinates for location:', location, coordinates);
        } else {
          console.log('No coordinates found for location:', location);

          // If location is provided but no coordinates found, try more thorough matching
          if (location && location.length > 0) {
            // Try a fuzzy match with cityCoordinates keys
            let bestMatch = '';
            let maxSimilarity = 0;

            Object.keys(cityCoordinates).forEach(city => {
              // Check if location contains city name or vice versa
              if (city.includes(normalizedLocation) || normalizedLocation.includes(city)) {
                const similarity = Math.min(city.length, normalizedLocation.length) / 
                                  Math.max(city.length, normalizedLocation.length);
                if (similarity > maxSimilarity) {
                  maxSimilarity = similarity;
                  bestMatch = city;
                }
              }
            });

            if (bestMatch && maxSimilarity > 0.5) {
              coordinates = cityCoordinates[bestMatch];
              console.log(`Found fuzzy match for "${location}": "${bestMatch}"`, coordinates);
            } else {
              // Split location by commas and check each part
              const locationParts = normalizedLocation.split(',');
              for (const part of locationParts) {
                const trimmedPart = part.trim();
                if (cityCoordinates[trimmedPart]) {
                  coordinates = cityCoordinates[trimmedPart];
                  console.log(`Found coordinates for location part "${trimmedPart}"`, coordinates);
                  break;
                }
              }

              // If still no coordinates, use default
              if (!coordinates) {
                coordinates = [20.5937, 78.9629]; // Default to center of India
                console.log('Using default coordinates for unknown location:', location);
              }
            }
          }
        }
      }

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
        latitudeCoord: coordinates ? coordinates[0].toString() : null,
        longitudeCoord: coordinates ? coordinates[1].toString() : null
      };

      const parsed = insertEquipmentSchema.safeParse(equipmentData);
      if (!parsed.success) {
        console.error('Equipment validation failed:', {
          data: equipmentData,
          errors: parsed.error.errors
        });
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

      // Always update coordinates when equipment is modified
      const cityCoordinates: Record<string, number[]> = {
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
        'barshi': [18.2333, 75.6833],
      };

      // First check if direct coordinates were provided (highest priority)
      if (req.body.latitudeCoord && req.body.longitudeCoord) {
        const lat = parseFloat(req.body.latitudeCoord);
        const lng = parseFloat(req.body.longitudeCoord);
        if (!isNaN(lat) && !isNaN(lng)) {
          updateData.latitudeCoord = lat.toString();
          updateData.longitudeCoord = lng.toString();
          console.log('Updating with custom coordinates:', [lat, lng]);
        }
      } 
      // If location changed but no coordinates provided, try to determine from location
      else if (req.body.location) {
        const location = req.body.location.toLowerCase().trim();

        // Try to find from city map
        const coordinates = cityCoordinates[location] || 
                          cityCoordinates[location.replace('.', '')] || 
                          cityCoordinates[location.replace(' ', '')] || 
                          null;

        if (coordinates) {
          updateData.latitudeCoord = coordinates[0].toString();
          updateData.longitudeCoord = coordinates[1].toString();
          console.log('Updated coordinates for location:', location, coordinates);
        } else {
          console.log('No coordinates found for location:', location);

          // Try fuzzy matching for better location mapping
          let bestMatch = '';
          let maxSimilarity = 0;

          Object.keys(cityCoordinates).forEach(city => {
            if (city.includes(location) || location.includes(city)) {
              const similarity = Math.min(city.length, location.length) / 
                                Math.max(city.length, location.length);
              if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                bestMatch = city;
              }
            }
          });

          if (bestMatch && maxSimilarity > 0.5) {
            const fuzzyCoordinates = cityCoordinates[bestMatch];
            updateData.latitudeCoord = fuzzyCoordinates[0].toString();
            updateData.longitudeCoord = fuzzyCoordinates[1].toString();
            console.log(`Found fuzzy match for "${location}": "${bestMatch}"`, fuzzyCoordinates);
          } else {
            // If all else fails, set default coordinates for center of India
            updateData.latitudeCoord = "20.5937";
            updateData.longitudeCoord = "78.9629";
            console.log('Using default coordinates for unknown location:', location);
          }
        }
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
      // booking.totalPrice is already in rupees
      const receipt = await storage.createReceipt({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalPrice, // Amount in rupees (from booking)
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
        amountInRupees: r.amount
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
            amount: booking.totalPrice, // Store in rupees
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
  app.post("/api/comparisons/add/:equipmentId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }

    try {
      const equipmentId = parseInt(req.params.equipmentId);
      await storage.addToComparison(req.user.id, equipmentId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error adding to comparison:', error);
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
        margin: 0,
        size: 'A4',
        bufferPages: true
      });

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Handle errors in the PDF generation stream
      doc.on('error', (error) => {
        console.error('PDF generation error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to generate PDF" });
        }
      });

      doc.pipe(res);

      // Helper function to format currency
      const formatAmount = (amount: number) => {
        return `₹${Math.floor(amount).toLocaleString('en-IN')}`;
      };

      // Page dimensions
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 50;
      const contentWidth = pageWidth - (margin * 2);

      // ==================== PREMIUM HEADER ====================
      // Gradient-style header background (simulated with rectangles)
      doc.rect(0, 0, pageWidth, 120)
         .fill('#1a5f1a');
      
      doc.rect(0, 0, pageWidth, 100)
         .fill('#228B22');

      // Decorative top border
      doc.rect(0, 0, pageWidth, 5)
         .fill('#FFD700');

      // Enhanced Logo Design
      const logoX = margin + 20;
      const logoY = 25;
      const logoSize = 50;

      // Logo outer circle with shadow effect
      doc.circle(logoX + logoSize/2, logoY + logoSize/2 + 2, logoSize/2)
         .fill('#00000020');
      
      // Logo background circle
      doc.circle(logoX + logoSize/2, logoY + logoSize/2, logoSize/2)
         .fillAndStroke('#FFFFFF', '#FFD700')
         .lineWidth(3);

      // Tractor icon design
      doc.fillColor('#228B22');
      
      // Tractor body
      doc.rect(logoX + 10, logoY + 25, 28, 10)
         .fill();
      
      // Tractor cabin
      doc.rect(logoX + 24, logoY + 15, 14, 10)
         .fill();
      
      // Large rear wheel
      doc.circle(logoX + 34, logoY + 40, 7)
         .fillAndStroke('#228B22', '#FFD700')
         .lineWidth(2);
      
      // Small front wheel
      doc.circle(logoX + 14, logoY + 40, 5)
         .fillAndStroke('#228B22', '#FFD700')
         .lineWidth(2);
      
      // Exhaust pipe
      doc.rect(logoX + 32, logoY + 10, 3, 5)
         .fill('#228B22');

      // Company branding
      doc.font('Helvetica-Bold')
         .fontSize(32)
         .fillColor('#FFFFFF')
         .text('KrishiSadhan', logoX + 70, 30);

      doc.font('Helvetica')
         .fontSize(10)
         .fillColor('#E8F5E9')
         .text('Premium Agricultural Equipment Rental', logoX + 70, 58);

      // Professional tagline
      doc.fontSize(8)
         .fillColor('#C8E6C9')
         .text('Empowering Farmers | Building Communities', logoX + 70, 72);

      // Company details box on the right
      const rightBoxX = pageWidth - 180;
      doc.rect(rightBoxX, 20, 160, 70)
         .fillAndStroke('#FFFFFF15', '#FFFFFF40')
         .lineWidth(1);

      doc.font('Helvetica-Bold')
         .fontSize(9)
         .fillColor('#FFFFFF')
         .text('Contact Us', rightBoxX + 10, 28);

      doc.font('Helvetica')
         .fontSize(8)
         .fillColor('#E8F5E9')
         .text('🌐 www.krishisadhan.shop', rightBoxX + 10, 42)
         .text('📧 support@krishisadhan.shop', rightBoxX + 10, 54)
         .text('📞 +91-7385688905', rightBoxX + 10, 66)
         .text('📍 Maharashtra, India', rightBoxX + 10, 78);

      // ==================== RECEIPT TITLE SECTION ====================
      // Decorative line
      doc.moveTo(margin, 135)
         .lineTo(pageWidth - margin, 135)
         .lineWidth(3)
         .strokeColor('#228B22')
         .stroke();

      doc.font('Helvetica-Bold')
         .fontSize(26)
         .fillColor('#1a5f1a')
         .text('PAYMENT RECEIPT', margin, 145);

      doc.font('Helvetica')
         .fontSize(11)
         .fillColor('#666666')
         .text('Official Transaction Document', margin, 172);

      // ==================== RECEIPT INFO CARDS ====================
      // Receipt details card
      doc.roundedRect(margin, 195, (contentWidth / 2) - 10, 85, 8)
         .fillAndStroke('#F1F8F4', '#C8E6C9')
         .lineWidth(1);

      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#1a5f1a')
         .text('RECEIPT INFORMATION', margin + 15, 205);

      doc.font('Helvetica-Bold')
         .fontSize(9)
         .fillColor('#333333')
         .text('Receipt No:', margin + 15, 225)
         .font('Helvetica')
         .fillColor('#555555')
         .text(`#KS-${receipt.id.toString().padStart(6, '0')}`, margin + 100, 225);

      doc.font('Helvetica-Bold')
         .fillColor('#333333')
         .text('Booking Ref:', margin + 15, 240)
         .font('Helvetica')
         .fillColor('#555555')
         .text(`#BK-${receipt.bookingId.toString().padStart(6, '0')}`, margin + 100, 240);

      doc.font('Helvetica-Bold')
         .fillColor('#333333')
         .text('Issue Date:', margin + 15, 255)
         .font('Helvetica')
         .fillColor('#555555')
         .text(format(receipt.generatedAt, 'dd MMMM yyyy'), margin + 100, 255);

      // Status badge card
      const statusX = margin + (contentWidth / 2) + 10;
      const statusColor = receipt.status === 'paid' ? '#4CAF50' : '#FF9800';
      const statusText = receipt.status === 'paid' ? '✓ PAYMENT CONFIRMED' : '⏳ PENDING';

      doc.roundedRect(statusX, 195, (contentWidth / 2) - 10, 85, 8)
         .fillAndStroke('#FFFFFF', statusColor)
         .lineWidth(3);

      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor(statusColor)
         .text(statusText, statusX + 15, 230, { 
           align: 'center', 
           width: (contentWidth / 2) - 40 
         });

      // Verified stamp
      if (receipt.status === 'paid') {
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#4CAF50')
           .text('Digitally Verified & Secured', statusX + 15, 255, { 
             align: 'center', 
             width: (contentWidth / 2) - 40 
           });
      }

      // ==================== EQUIPMENT DETAILS ====================
      doc.font('Helvetica-Bold')
         .fontSize(15)
         .fillColor('#1a5f1a')
         .text('Equipment Details', margin, 300);

      doc.roundedRect(margin, 320, contentWidth, 100, 8)
         .fillAndStroke('#FFFFFF', '#E0E0E0')
         .lineWidth(1);

      // Equipment info in two columns
      const col1X = margin + 20;
      const col2X = margin + (contentWidth / 2) + 10;
      let yPos = 335;

      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Equipment Name:', col1X, yPos)
         .font('Helvetica')
         .fontSize(11)
         .fillColor('#000000')
         .text(equipment.name, col1X + 110, yPos, { width: 180 });

      yPos += 20;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Category:', col1X, yPos)
         .font('Helvetica')
         .fontSize(10)
         .fillColor('#555555')
         .text(equipment.category.charAt(0).toUpperCase() + equipment.category.slice(1), col1X + 110, yPos);

      yPos += 20;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Location:', col1X, yPos)
         .font('Helvetica')
         .fontSize(10)
         .fillColor('#555555')
         .text(equipment.location, col1X + 110, yPos);

      yPos += 20;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Daily Rate:', col1X, yPos)
         .font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#228B22')
         .text(formatAmount(equipment.dailyRate), col1X + 110, yPos);

      // ==================== RENTAL PERIOD ====================
      doc.font('Helvetica-Bold')
         .fontSize(15)
         .fillColor('#1a5f1a')
         .text('Rental Period', margin, 440);

      const rentalDays = Math.max(1, Math.ceil((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

      doc.roundedRect(margin, 460, contentWidth, 75, 8)
         .fillAndStroke('#E8F5E9', '#A5D6A7')
         .lineWidth(2);

      yPos = 475;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Start Date:', margin + 20, yPos)
         .font('Helvetica')
         .fontSize(10)
         .fillColor('#555555')
         .text(format(booking.startDate, 'dd MMMM yyyy'), margin + 150, yPos);

      yPos += 20;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('End Date:', margin + 20, yPos)
         .font('Helvetica')
         .fontSize(10)
         .fillColor('#555555')
         .text(format(booking.endDate, 'dd MMMM yyyy'), margin + 150, yPos);

      yPos += 20;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Total Duration:', margin + 20, yPos)
         .font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#228B22')
         .text(`${rentalDays} Day${rentalDays > 1 ? 's' : ''}`, margin + 150, yPos);

      // ==================== PAYMENT BREAKDOWN ====================
      doc.font('Helvetica-Bold')
         .fontSize(15)
         .fillColor('#1a5f1a')
         .text('Payment Summary', margin, 555);

      // Payment table
      doc.roundedRect(margin, 575, contentWidth, 120, 8)
         .fillAndStroke('#FFFFFF', '#E0E0E0')
         .lineWidth(1);

      // Table header
      doc.rect(margin, 575, contentWidth, 30)
         .fill('#F5F5F5');

      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#333333')
         .text('Description', margin + 15, 585)
         .text('Rate', margin + 240, 585)
         .text('Days', margin + 340, 585)
         .text('Amount', margin + 420, 585);

      // Divider line
      doc.moveTo(margin, 605)
         .lineTo(pageWidth - margin, 605)
         .lineWidth(1)
         .strokeColor('#E0E0E0')
         .stroke();

      // Table rows
      const baseAmount = equipment.dailyRate * rentalDays;
      const gstRate = 18;
      const gstAmount = Math.round(baseAmount * (gstRate / 100));

      yPos = 615;
      doc.font('Helvetica')
         .fontSize(10)
         .fillColor('#333333')
         .text('Equipment Rental', margin + 15, yPos)
         .text(formatAmount(equipment.dailyRate), margin + 240, yPos)
         .text(`${rentalDays}`, margin + 340, yPos)
         .font('Helvetica-Bold')
         .text(formatAmount(baseAmount), margin + 420, yPos);

      yPos += 25;
      doc.font('Helvetica')
         .fillColor('#333333')
         .text(`GST (${gstRate}%)`, margin + 15, yPos)
         .text('—', margin + 240, yPos)
         .text('—', margin + 340, yPos)
         .font('Helvetica-Bold')
         .text(formatAmount(gstAmount), margin + 420, yPos);

      // Total section
      doc.rect(margin, 665, contentWidth, 30)
         .fill('#E8F5E9');

      doc.font('Helvetica-Bold')
         .fontSize(13)
         .fillColor('#1a5f1a')
         .text('TOTAL AMOUNT PAID', margin + 15, 673);

      doc.font('Helvetica-Bold')
         .fontSize(16)
         .fillColor('#228B22')
         .text(formatAmount(receipt.amount), margin + 420, 670);

      // ==================== PAYMENT DETAILS ====================
      doc.roundedRect(margin, 710, contentWidth, 50, 8)
         .fillAndStroke('#F9F9F9', '#E0E0E0')
         .lineWidth(1);

      doc.font('Helvetica-Bold')
         .fontSize(9)
         .fillColor('#333333')
         .text('Transaction Details', margin + 15, 720);

      doc.font('Helvetica')
         .fontSize(8)
         .fillColor('#666666')
         .text(`Payment ID: ${receipt.razorpayPaymentId}`, margin + 15, 735)
         .text(`Method: ${receipt.metadata.payment_method || 'Online Payment'}`, margin + 15, 747)
         .text(`Date: ${format(receipt.generatedAt, 'dd MMM yyyy, hh:mm a')}`, margin + 280, 735)
         .text('Status: Secured & Verified ✓', margin + 280, 747);

      // ==================== FOOTER ====================
      doc.rect(0, pageHeight - 70, pageWidth, 70)
         .fill('#1a5f1a');

      doc.font('Helvetica-Bold')
         .fontSize(13)
         .fillColor('#FFD700')
         .text('Thank You for Choosing KrishiSadhan!', 0, pageHeight - 55, { 
           align: 'center', 
           width: pageWidth 
         });

      doc.font('Helvetica')
         .fontSize(9)
         .fillColor('#E8F5E9')
         .text('Your Trusted Partner in Agricultural Equipment Rental', 0, pageHeight - 38, { 
           align: 'center', 
           width: pageWidth 
         });

      doc.fontSize(8)
         .fillColor('#C8E6C9')
         .text('📧 support@krishisadhan.shop  |  📞 +91-7385688905  |  🌐 www.krishisadhan.shop', 0, pageHeight - 22, { 
           align: 'center', 
           width: pageWidth 
         });

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
      const newPopularity = await storage.calculateEquipmentPopularity(parsed.data.equipmentId);
      await storage.updateEquipment(parsed.data.equipmentId, {
        popularity: newPopularity
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

  // Chatbot endpoint using Gemini API
  app.post("/api/chatbot", async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Google AI API key not configured' });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // First, use Gemini to detect the language
      const languageDetectionPrompt = `Analyze this message and identify the language. Respond with ONLY one of these language codes: 'en' for English, 'hi' for Hindi, or 'mr' for Marathi. If unsure, respond with 'en'.

Message: ${message}`;

      const langDetectionResult = await model.generateContent(languageDetectionPrompt);
      const langResponse = await langDetectionResult.response;
      let detectedLanguage = langResponse.text().trim().toLowerCase();
      
      // Validate detected language
      if (!['en', 'hi', 'mr'].includes(detectedLanguage)) {
        detectedLanguage = 'en'; // Default to English if detection fails
      }

      console.log('Detected language:', detectedLanguage);

      const languageNames: Record<string, string> = {
        'en': 'English',
        'hi': 'Hindi',
        'mr': 'Marathi'
      };

      const languageInstructions: Record<string, string> = {
        'en': 'Respond in English.',
        'hi': 'उपयोगकर्ता ने हिंदी में सवाल पूछा है। कृपया हिंदी में जवाब दें।',
        'mr': 'वापरकर्त्याने मराठीत प्रश्न विचारला आहे. कृपया मराठीत उत्तर द्या।'
      };

      const prompt = `You are a helpful farm equipment rental assistant for KrishiSadhan, an agricultural equipment rental platform. You help farmers and agricultural workers with:

MAIN SERVICES:
- Finding suitable farm equipment for rent (tractors, harvesters, tillers, sprayers, seeders, cultivators, threshers, irrigation systems, rotavators)
- Understanding rental prices, availability, and booking process
- Equipment specifications, usage guidance, and recommendations
- Customer support for the rental platform

PLATFORM FEATURES:
- Equipment search and filtering by category, location, price range
- Online booking with payment gateway integration
- Multi-language support (English, Hindi, Marathi)
- Equipment comparison tools
- Reviews and ratings system
- Receipt and booking history

GUIDELINES:
- Be helpful, friendly, and knowledgeable about farm equipment
- Provide practical advice for agricultural needs
- Keep responses concise but informative
- Suggest specific equipment categories when relevant
- Mention platform features that can help users
- Use simple language appropriate for farmers
- If asked about pricing, mention that rates vary by equipment and location

IMPORTANT: The user's message is in ${languageNames[detectedLanguage]}. ${languageInstructions[detectedLanguage]}
You MUST respond in the SAME language as the user's question.

User question: ${message}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Return response with detected language
      res.json({ 
        response: text,
        detectedLanguage: detectedLanguage
      });
    } catch (error) {
      console.error('Gemini API error:', error);

      // Handle specific Gemini API errors
      let errorMessage = 'Failed to get response from AI assistant';
      if (error instanceof Error) {
        if (error.message.includes('overloaded')) {
          errorMessage = 'Our AI assistant is currently busy. Please try again in a moment.';
        } else if (error.message.includes('quota')) {
          errorMessage = 'AI service quota reached. Please try again later.';
        } else if (error.message.includes('API key')) {
          errorMessage = 'AI service configuration issue. Please contact support.';
        } else {
          errorMessage = error.message;
        }
      }

      res.status(500).json({ 
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error'
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