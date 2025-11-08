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
      const receipt = await storage.createReceipt({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalPrice * 100, // Amount in paise (multiply by 100 to convert from rupees)
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
        margin: 40,
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

      // Helper function to format currency consistently with proper styling
      const formatAmount = (amount: number) => {
        return `₹${Math.floor(amount / 100).toLocaleString('en-IN')}`;
      };

      // Professional PDF Content Generation
      const pageWidth = 595.28; // A4 width in points
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      // Professional Header with KrishiSadhan branding
      doc.rect(0, 0, pageWidth, 80)
         .fillAndStroke('#228B22', '#228B22'); // Forest Green

      // Professional KrishiSadhan Logo Design
      const logoX = margin + 15;
      const logoY = 20;
      const logoSize = 40;

      // Logo background circle
      doc.circle(logoX + logoSize/2, logoY + logoSize/2, logoSize/2)
         .fillAndStroke('#ffffff', '#228B22')
         .lineWidth(2);

      // Tractor silhouette design
      doc.fillColor('#228B22');

      // Tractor body (main chassis)
      doc.rect(logoX + 8, logoY + 20, 24, 8)
         .fill();

      // Tractor cabin
      doc.rect(logoX + 20, logoY + 12, 12, 8)
         .fill();

      // Large rear wheel
      doc.circle(logoX + 28, logoY + 32, 6)
         .fillAndStroke('#228B22', '#ffffff')
         .lineWidth(1);

      // Small front wheel  
      doc.circle(logoX + 12, logoY + 32, 4)
         .fillAndStroke('#228B22', '#ffffff')
         .lineWidth(1);

      // Exhaust pipe
      doc.rect(logoX + 26, logoY + 8, 2, 4)
         .fill();

      // Company Name and Details
      doc.font('Helvetica-Bold')
         .fontSize(28)
         .fillColor('#ffffff')
         .text('KrishiSadhan', margin + 70, 25);

      doc.font('Helvetica')
         .fontSize(11)
         .fillColor('#ffffff')
         .text('Premium Agricultural Equipment Rental Platform', margin + 70, 50);

      // Company contact details on right
      doc.fontSize(9)
         .fillColor('#ffffff')
         .text('www.krishisadhan.shop', pageWidth - 160, 20)
         .text('support@krishisadhan.shop', pageWidth - 160, 32)
         .text('+91-7385688905', pageWidth - 160, 44)
         .text('Maharashtra, India', pageWidth - 160, 56);

      // Receipt Title with elegant styling
      doc.fillColor('#2c3e50')
         .font('Helvetica-Bold')
         .fontSize(20)
         .text('RENTAL RECEIPT', margin, 100);

      // Horizontal line under title
      doc.moveTo(margin, 125)
         .lineTo(pageWidth - margin, 125)
         .lineWidth(2)
         .stroke('#228B22');

      // Receipt Information Section
      doc.rect(margin, 140, contentWidth, 60)
         .fillAndStroke('#f8f9fa', '#e9ecef');

      // Receipt details
      doc.fillColor('#495057')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text(`Receipt No: #KS-${receipt.id.toString().padStart(6, '0')}`, margin + 15, 155)
         .text(`Booking Ref: #BK-${receipt.bookingId.toString().padStart(6, '0')}`, margin + 15, 170);

      doc.font('Helvetica')
         .fontSize(10)
         .text(`Issue Date: ${format(receipt.generatedAt, 'dd MMMM yyyy')}`, margin + 15, 185);

      // Status badge
      const statusColor = receipt.status === 'paid' ? '#28a745' : '#ffc107';
      const statusText = receipt.status === 'paid' ? 'PAYMENT CONFIRMED' : 'PENDING';

      doc.rect(pageWidth - 160, 150, 120, 25)
         .fillAndStroke(statusColor, statusColor);

      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text(statusText, pageWidth - 155, 160, { align: 'center', width: 110 });

      // Equipment Information Section
      doc.fillColor('#2c3e50')
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('Equipment Details', margin, 220);

      doc.rect(margin, 240, contentWidth, 80)
         .fillAndStroke('#ffffff', '#dee2e6');

      doc.fillColor('#495057')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('Equipment:', margin + 15, 255)
         .font('Helvetica')
         .text(equipment.name, margin + 120, 255);

      doc.font('Helvetica-Bold')
         .text('Category:', margin + 15, 270)
         .font('Helvetica')
         .text(equipment.category.charAt(0).toUpperCase() + equipment.category.slice(1), margin + 120, 270);

      doc.font('Helvetica-Bold')
         .text('Location:', margin + 15, 285)
         .font('Helvetica')
         .text(equipment.location, margin + 120, 285);

      doc.font('Helvetica-Bold')
         .fontSize(11)
         .text('Daily Rate:', margin + 15, 300)
         .font('Helvetica')
         .fontSize(11)
         .text(formatAmount(equipment.dailyRate), margin + 120, 300);

      // Rental Period Section
      doc.fillColor('#2c3e50')
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('Rental Period', margin, 340);

      const rentalDays = Math.max(1, Math.ceil((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

      doc.rect(margin, 360, contentWidth, 60)
         .fillAndStroke('#e8f5e8', '#c3e6c3');

      doc.fillColor('#495057')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('Start Date:', margin + 15, 375)
         .font('Helvetica')
         .text(format(booking.startDate, 'dd MMMM yyyy'), margin + 120, 375);

      doc.font('Helvetica-Bold')
         .text('End Date:', margin + 15, 390)
         .font('Helvetica')
         .text(format(booking.endDate, 'dd MMMM yyyy'), margin + 120, 390);

      doc.font('Helvetica-Bold')
         .text('Total Days:', margin + 15, 405)
         .font('Helvetica')
         .text(`${rentalDays} day(s)`, margin + 120, 405);

      // Payment Summary Section
      doc.fillColor('#2c3e50')
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('Payment Summary', margin, 440);

      // Create professional payment table
      doc.rect(margin, 460, contentWidth, 100)
         .fillAndStroke('#ffffff', '#dee2e6');

      // Table header
      doc.rect(margin, 460, contentWidth, 20)
         .fillAndStroke('#f8f9fa', '#dee2e6');

      doc.fillColor('#495057')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('Description', margin + 10, 468)
         .text('Rate', margin + 200, 468)
         .text('Days', margin + 280, 468)
         .text('Amount', margin + 350, 468);

      // Table content
      const baseAmount = equipment.dailyRate * rentalDays;
      const gstRate = 18;
      const gstAmount = Math.round(baseAmount * (gstRate / 100));
      const totalAmount = baseAmount + gstAmount;

      doc.font('Helvetica')
         .fontSize(10)
         .text('Equipment Rental', margin + 10, 485);
      
      doc.fontSize(10)
         .text(formatAmount(equipment.dailyRate), margin + 200, 485)
         .text(`${rentalDays}`, margin + 280, 485)
         .text(formatAmount(baseAmount), margin + 350, 485);

      doc.fontSize(10)
         .text(`GST (${gstRate}%)`, margin + 10, 500)
         .text('-', margin + 200, 500)
         .text('-', margin + 280, 500)
         .text(formatAmount(gstAmount), margin + 350, 500);

      // Total line
      doc.moveTo(margin + 10, 520)
         .lineTo(pageWidth - margin - 10, 520)
         .lineWidth(1)
         .stroke('#dee2e6');

      // Fixed amount display with consistent formatting
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor('#228B22')
         .text('Total Amount Paid:', margin + 10, 530);
      
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor('#228B22')
         .text(formatAmount(receipt.amount), margin + 350, 530);

      // Payment Information
      doc.fillColor('#495057')
         .font('Helvetica')
         .fontSize(9)
         .text(`Payment ID: ${receipt.razorpayPaymentId}`, margin, 570)
         .text(`Payment Method: ${receipt.metadata.payment_method || 'Online Payment'}`, margin, 582)
         .text(`Transaction Date: ${format(receipt.generatedAt, 'dd MMM yyyy, hh:mm a')}`, margin, 594);

      // Professional Footer
      doc.rect(0, 620, pageWidth, 60)
         .fillAndStroke('#2c3e50', '#2c3e50');

      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#ffffff')
         .text('Thank you for choosing KrishiSadhan!', margin, 635, { 
           align: 'center', 
           width: contentWidth 
         });

      doc.font('Helvetica')
         .fontSize(9)
         .text('Your trusted partner in agricultural equipment rental services', margin, 650, { 
           align: 'center', 
           width: contentWidth 
         })
         .text('For support: support@krishisadhan.shop | +91-7385688905 | www.krishisadhan.shop', margin, 662, { 
           align: 'center', 
           width: contentWidth 
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
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      // Create a comprehensive system prompt for farm equipment rental context
      const systemPrompt = `You are a helpful farm equipment rental assistant for KrishiSadhan, an agricultural equipment rental platform. You help farmers and agricultural workers with:

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

User message: ${message}`;

      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      const text = response.text();

      res.json({ response: text });
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