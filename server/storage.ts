import { Pool as PgPool } from 'pg';
import { users, equipment as equipmentTable, bookings, reviews, comparisons, recommendations, receipts, type User, type InsertUser, type Equipment, type InsertEquipment, type Booking, type InsertBooking, type UpdateProfile, type Review, type InsertReview, type Recommendation, type InsertRecommendation, type Receipt, type InsertReceipt } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, or, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { sql } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<UpdateProfile>): Promise<User>;

  // Equipment operations
  getEquipment(id: number): Promise<Equipment | undefined>;
  listEquipment(): Promise<Equipment[]>;
  listEquipmentByOwner(ownerId: number): Promise<Equipment[]>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  deleteEquipment(id: number): Promise<void>;
  updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment>;

  // Booking operations
  getBooking(id: number): Promise<Booking | undefined>;
  findBookingByRazorpayOrderId(orderId: string): Promise<Booking | undefined>;
  listBookings(userId?: number): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking>;
  updateBooking(id: number, data: Partial<Booking>): Promise<Booking>;
  getBookingsByStatus(status: string): Promise<Booking[]>;
  getBookingsByDateRange(equipmentId: number, startDate: Date, endDate: Date): Promise<Booking[]>;
  checkEquipmentAvailability(equipmentId: number, startDate: Date, endDate: Date): Promise<boolean>;
  deleteEquipmentBookings(equipmentId: number): Promise<void>;  

  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getReviewsByEquipment(equipmentId: number): Promise<Review[]>;
  getAverageRating(equipmentId: number): Promise<number>;

  // Comparison operations
  addToComparison(userId: number, equipmentId: number): Promise<void>;
  removeFromComparison(userId: number, equipmentId: number): Promise<void>;
  getComparison(userId: number): Promise<Equipment[]>;

  // Add recommendation operations
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  getRecommendationsForUser(userId: number): Promise<Recommendation[]>;

  // Receipt operations
  createReceipt(receipt: InsertReceipt): Promise<Receipt>;
  getReceipt(id: number): Promise<Receipt | undefined>;
  listReceipts(userId: number): Promise<Receipt[]>;
  getReceiptByBookingId(bookingId: number): Promise<Receipt | undefined>; // Added method

  sessionStore: session.Store;

  // Add new search methods
  searchEquipment(params: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    location?: string;
    radius?: number;
    specifications?: Record<string, any>;
    season?: 'spring' | 'summer' | 'autumn' | 'winter';
    availability?: boolean;
  }): Promise<Equipment[]>;

  getEquipmentBySpecification(specKey: string, value: string | number): Promise<Equipment[]>;
  getEquipmentInRadius(lat: number, lng: number, radiusKm: number): Promise<Equipment[]>;
  calculateEquipmentPopularity(equipmentId: number): Promise<number>;
  listEquipmentReviews(equipmentId: number): Promise<Review[]>;
}

export class DatabaseStorage implements IStorage {
  public sessionStore!: session.Store;

  constructor() {
    // Session store will be initialized in init()
  }

  async init() {
    const maxRetries = 5;
    const retryDelay = 5000; // 5 seconds
    let retries = maxRetries;

    while (retries > 0) {
      try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('Database connection verified successfully');

        // Initialize session store with the correct pool type
        this.sessionStore = new PostgresSessionStore({
          pool: pool as unknown as PgPool,
          tableName: 'session',
          createTableIfMissing: true,
          pruneSessionInterval: 60
        });

        console.log('Session store initialized successfully');
        return;
      } catch (error) {
        console.error(`Database initialization attempt failed (${retries} retries left):`, error);
        retries--;

        if (retries > 0) {
          console.log(`Retrying in ${retryDelay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.error('All database initialization attempts failed');
        }
      }
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
    } catch (error) {
        console.error('Error in getUser:', error);
        throw new Error('Failed to fetch user');
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error('Error in getUserByUsername:', error);
      throw new Error('Failed to fetch user by username');
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      console.error('Error in createUser:', error);
      throw new Error('Failed to create user');
    }
  }

  async updateUser(id: number, data: Partial<UpdateProfile>): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set(data)
        .where(eq(users.id, id))
        .returning();
      if (!user) throw new Error('User not found');
      return user;
    } catch (error) {
      console.error('Error in updateUser:', error);
      throw new Error('Failed to update user');
    }
  }

  async getEquipment(id: number): Promise<Equipment | undefined> {
    try {
      const [equip] = await db.select().from(equipmentTable).where(eq(equipmentTable.id, id));
      return equip;
    } catch (error) {
      console.error('Error in getEquipment:', error);
      throw new Error('Failed to fetch equipment');
    }
  }

  async listEquipment(): Promise<Equipment[]> {
    try {
      console.log('Attempting to list equipment from database...');
      const equipment = await db
        .select({
          id: equipmentTable.id,
          ownerId: equipmentTable.ownerId,
          name: equipmentTable.name,
          description: equipmentTable.description,
          category: equipmentTable.category,
          dailyRate: equipmentTable.dailyRate,
          location: equipmentTable.location,
          imageUrl: equipmentTable.imageUrl,
          availability: equipmentTable.availability,
          specs: equipmentTable.specs,
          features: equipmentTable.features,
          seasonalAvailability: equipmentTable.seasonalAvailability,
          searchableSpecs: equipmentTable.searchableSpecs,
          createdAt: equipmentTable.createdAt,
          popularity: equipmentTable.popularity,
          latitudeCoord: equipmentTable.latitudeCoord,
          longitudeCoord: equipmentTable.longitudeCoord
        })
        .from(equipmentTable)
        .orderBy(desc(equipmentTable.createdAt));

      console.log('Raw database query result:', equipment);

      // Transform the data to ensure proper parsing of JSON fields
      const transformedEquipment = equipment.map(item => {
        try {
          return {
            ...item,
            availability: Boolean(item.availability),
            specs: this.parseJsonField(item.specs, {}),
            features: this.parseJsonField(item.features, []),
            seasonalAvailability: this.parseJsonField(item.seasonalAvailability, {
              spring: true,
              summer: true,
              autumn: true,
              winter: true
            }),
            searchableSpecs: this.parseJsonField(item.searchableSpecs, {})
          };
        } catch (parseError) {
          console.error('Error parsing equipment fields for item:', item.id, parseError);
          return {
            ...item,
            availability: Boolean(item.availability),
            specs: {},
            features: [],
            seasonalAvailability: {
              spring: true,
              summer: true,
              autumn: true,
              winter: true
            },
            searchableSpecs: {}
          };
        }
      });

      console.log('Transformed equipment:', transformedEquipment);
      return transformedEquipment;
    } catch (error) {
      console.error('Error in listEquipment:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to list equipment');
    }
  }

  async listEquipmentByOwner(ownerId: number): Promise<Equipment[]> {
    try {
      const equipment = await db
        .select()
        .from(equipmentTable)
        .where(eq(equipmentTable.ownerId, ownerId));

      console.log(`Equipment for owner ${ownerId}:`, equipment);

      // Transform the data to ensure proper boolean values
      const transformedEquipment = equipment.map(item => ({
        ...item,
        availability: Boolean(item.availability)
      }));

      return transformedEquipment;
    } catch (error) {
      console.error('Error in listEquipmentByOwner:', error);
      throw new Error('Failed to list equipment by owner');
    }
  }

  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    try {
      const [equipment] = await db
        .insert(equipmentTable)
        .values({
          ownerId: insertEquipment.ownerId,
          name: insertEquipment.name,
          description: insertEquipment.description,
          category: insertEquipment.category,
          dailyRate: insertEquipment.dailyRate,
          location: insertEquipment.location,
          imageUrl: insertEquipment.imageUrl,
          specs: insertEquipment.specs ?? {},
          features: insertEquipment.features ?? [],
          seasonalAvailability: insertEquipment.seasonalAvailability ?? {
            spring: true,
            summer: true,
            autumn: true,
            winter: true
          },
          searchableSpecs: insertEquipment.searchableSpecs ?? {},
          availability: true
        })
        .returning();

      if (!equipment) {
        throw new Error('Failed to create equipment record');
      }

      return {
        ...equipment,
        specs: this.parseJsonField(equipment.specs, {}),
        features: this.parseJsonField(equipment.features, []),
        seasonalAvailability: this.parseJsonField(equipment.seasonalAvailability, {
          spring: true,
          summer: true,
          autumn: true,
          winter: true
        }),
        searchableSpecs: this.parseJsonField(equipment.searchableSpecs, {})
      };
    } catch (error) {
      console.error('Error in createEquipment:', error);
      throw new Error('Failed to create equipment');
    }
  }

  async updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment> {
    try {
      // Ensure JSON fields are properly handled
      const updateData = {
        ...data,
        specs: data.specs ? data.specs : undefined,
        features: Array.isArray(data.features) ? data.features : undefined,
        seasonalAvailability: data.seasonalAvailability ? data.seasonalAvailability : undefined,
        searchableSpecs: data.searchableSpecs ? data.searchableSpecs : undefined
      };

      const [equipment] = await db
        .update(equipmentTable)
        .set(updateData)
        .where(eq(equipmentTable.id, id))
        .returning();

      if (!equipment) {
        throw new Error('Equipment not found');
      }

      // Transform JSON fields in the response
      return {
        ...equipment,
        specs: this.parseJsonField(equipment.specs, {}),
        features: this.parseJsonField(equipment.features, []),
        seasonalAvailability: this.parseJsonField(equipment.seasonalAvailability, {
          spring: true,
          summer: true,
          autumn: true,
          winter: true
        }),
        searchableSpecs: this.parseJsonField(equipment.searchableSpecs, {})
      };
    } catch (error) {
      console.error('Error updating equipment:', error);
      throw new Error('Failed to update equipment');
    }
  }

  async deleteEquipment(id: number): Promise<void> {
    try {
      await db.delete(equipmentTable).where(eq(equipmentTable.id, id));
    } catch (error) {
      console.error('Error in deleteEquipment:', error);
      throw new Error('Failed to delete equipment');
    }
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    try {
      console.log(`Fetching booking with ID: ${id}`);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));

      if (!booking) {
        console.log(`No booking found with ID: ${id}`);
        return undefined;
      }

      console.log(`Found booking:`, booking);
      return booking;
    } catch (error) {
      console.error('Error in getBooking:', error);
      throw new Error('Failed to fetch booking');
    }
  }

  async findBookingByRazorpayOrderId(orderId: string): Promise<Booking | undefined> {
    try {
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.razorpayOrderId, orderId));
      return booking;
    } catch (error) {
      console.error('Error finding booking by Razorpay order ID:', error);
      throw new Error('Failed to find booking by Razorpay order ID');
    }
  }

  async listBookings(userId?: number): Promise<Booking[]> {
    try {
      console.log(`Fetching bookings for user: ${userId}`);

      let bookingsQuery;
      // If userId is provided, filter bookings for that user
      if (userId) {
        console.log('Filtering bookings by user ID');
        bookingsQuery = db
          .select()
          .from(bookings)
          .where(eq(bookings.userId, userId))
          .orderBy(desc(bookings.createdAt));
      } else {
        // Return all bookings for admin users
        console.log('Fetching all bookings (admin view)');
        bookingsQuery = db
          .select()
          .from(bookings)
          .orderBy(desc(bookings.createdAt));
      }

      const result = await bookingsQuery;
      console.log(`Found ${result.length} bookings:`, result);
      return result;
    } catch (error) {
      console.error('Error listing bookings:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
      return [];
    }
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          ...insertBooking,
          status: insertBooking.status || 'pending',
          createdAt: new Date(),
          lastStatusUpdate: new Date()
        } as any)
        .returning();
      return booking;
    } catch (error) {
      console.error('Error in createBooking:', error);
      throw new Error('Failed to create booking');
    }
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking> {
    try {
      const [booking] = await db
        .update(bookings)
        .set({
          status,
          lastStatusUpdate: new Date()
        })
        .where(eq(bookings.id, id))
        .returning();
      if (!booking) throw new Error('Booking not found');
      return booking;
    } catch (error) {
      console.error('Error in updateBookingStatus:', error);
      throw new Error('Failed to update booking status');
    }
  }

  async updateBooking(id: number, data: Partial<Booking>): Promise<Booking> {
    try {
      const [booking] = await db
        .update(bookings)
        .set({
          ...data,
          lastStatusUpdate: new Date()
        })
        .where(eq(bookings.id, id))
        .returning();
      if (!booking) throw new Error('Booking not found');
      return booking;
    } catch (error) {
      console.error('Error in updateBooking:', error);
      throw new Error('Failed to update booking');
    }
  }

  async getBookingsByStatus(status: string): Promise<Booking[]> {
    try {
      return await db
        .select()
        .from(bookings)
        .where(eq(bookings.status, status));
    } catch (error) {
      console.error('Error in getBookingsByStatus:', error);
      throw new Error('Failed to get bookings by status');
    }
  }

  async getBookingsByDateRange(
    equipmentId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Booking[]> {
    try {
      // Parse dates and ensure they are valid Date objects
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error('Invalid date input:', { startDate, endDate });
        return [];
      }

      // Set times to start and end of day in UTC
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(23, 59, 59, 999);

      // Query bookings within the date range
      const bookingsResult = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.equipmentId, equipmentId),
            or(
              // Booking starts within the range
              and(
                gte(bookings.startDate, start),
                lte(bookings.startDate, end)
              ),
              // Booking ends within the range
              and(
                gte(bookings.endDate, start),
                lte(bookings.endDate, end)
              ),
              // Booking spans the entire range
              and(
                lte(bookings.startDate, start),
                gte(bookings.endDate, end)
              )
            )
          )
        );

      return bookingsResult.map(booking => ({
        ...booking,
        startDate: new Date(booking.startDate),
        endDate: new Date(booking.endDate)
      }));
    } catch (error) {
      console.error('Error in getBookingsByDateRange:', error);
      return [];
    }
  }

  // Add a new method to check equipment availability directly
  async checkEquipmentAvailability(
    equipmentId: number, 
    startDate: Date, 
    endDate: Date
  ): Promise<boolean> {
    try {
      // First check if equipment exists and is generally available
      const equipment = await this.getEquipment(equipmentId);
      if (!equipment || !equipment.availability) {
        return false;
      }

      // Then check for any conflicting bookings
      const existingBookings = await this.getBookingsByDateRange(equipmentId, startDate, endDate);
      const hasConflictingBooking = existingBookings.some(booking => 
        booking.status === 'paid' || booking.status === 'awaiting_payment'
      );

      return !hasConflictingBooking;
    } catch (error) {
      console.error('Error checking equipment availability:', error);
      throw new Error('Failed to check equipment availability');
    }
  }

  async deleteEquipmentBookings(equipmentId: number): Promise<void> {
    try {
      await db.delete(bookings).where(eq(bookings.equipmentId, equipmentId));
      console.log(`Successfully deleted all bookings for equipment ${equipmentId}`);
    } catch (error) {
      console.error('Error deleting equipment bookings:', error);
      throw new Error('Failed to delete equipment bookings');
    }
  }

  async createReview(review: InsertReview): Promise<Review> {
    try {
      const reviewData = {
        userId: review.userId,
        equipmentId: review.equipmentId,
        rating: review.rating,
        comment: review.comment,
        createdAt: new Date()
      };

      const [newReview] = await db
        .insert(reviews)
        .values(reviewData)
        .returning();

      return newReview;
    } catch (error) {
      console.error('Error creating review:', error);
      throw new Error('Failed to create review');
    }
  }

  async getReviewsByEquipment(equipmentId: number): Promise<Review[]> {
    try {
      const results = await db
        .select()
        .from(reviews)
        .where(eq(reviews.equipmentId, equipmentId));

      return results;
    } catch (error) {
      console.error('Error in getReviewsByEquipment:', error);
      throw new Error('Failed to get reviews by equipment');
    }
  }

  async getAverageRating(equipmentId: number): Promise<number> {
    try {
      const result = await db
        .select({
          average: sql<number>`COALESCE(AVG(${reviews.rating})::numeric(10,1), 0)`
        })
        .from(reviews)
        .where(eq(reviews.equipmentId, equipmentId));
      return result[0]?.average || 0;
    } catch (error) {
      console.error('Error in getAverageRating:', error);
      throw new Error('Failed to get average rating');
    }
  }

  async addToComparison(userId: number, equipmentId: number): Promise<void> {
    try {
      const [existingComparison] = await db
        .select()
        .from(comparisons)
        .where(eq(comparisons.userId, userId));

      if (existingComparison) {
        const equipmentIds = existingComparison.equipmentIds || [];
        if (!equipmentIds.includes(equipmentId)) {
          await db
            .update(comparisons)
            .set({
              equipmentIds: [...equipmentIds, equipmentId],
            })
            .where(eq(comparisons.userId, userId));
        }
      } else {
        await db
          .insert(comparisons)
          .values({
            userId,
            equipmentIds: [equipmentId],
            createdAt: new Date()
          });
      }
    } catch (error) {
      console.error('Error in addToComparison:', error);
      throw new Error('Failed to add to comparison');
    }
  }

  async removeFromComparison(userId: number, equipmentId: number): Promise<void> {
    try {
      const [comparison] = await db
        .select()
        .from(comparisons)
        .where(eq(comparisons.userId, userId));

      if (comparison) {
        const equipmentIds = comparison.equipmentIds.filter(id => id !== equipmentId);
        await db
          .update(comparisons)
          .set({ equipmentIds })
          .where(eq(comparisons.userId, userId));
      }
    } catch (error) {
      console.error('Error in removeFromComparison:', error);
      throw new Error('Failed to remove from comparison');
    }
  }

  async getComparison(userId: number): Promise<Equipment[]> {
    try {
      const [comparison] = await db
        .select()
        .from(comparisons)
        .where(eq(comparisons.userId, userId));

      if (!comparison) return [];

      return await db
        .select()
        .from(equipmentTable)
        .where(sql`${equipmentTable.id} = ANY(${comparison.equipmentIds})`);
    } catch (error) {
      console.error('Error in getComparison:', error);
      throw new Error('Failed to get comparison');
    }
  }

  async createRecommendation(insertRecommendation: InsertRecommendation): Promise<Recommendation> {
    try {
      const [recommendation] = await db
        .insert(recommendations)
        .values({
          ...insertRecommendation,
          createdAt: new Date()
        })
        .returning();

      return recommendation;
    } catch (error) {
      console.error('Error creating recommendation:', error);
      throw new Error('Failed to create recommendation');
    }
  }

  async getRecommendationsForUser(userId: number): Promise<Recommendation[]> {
    try {
      const userRecommendations = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.userId, userId))
        .orderBy(desc(recommendations.createdAt));

      return userRecommendations;
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      throw new Error('Failed to fetch recommendations');
    }
  }

  async createReceipt(receiptData: InsertReceipt): Promise<Receipt> {
    try {
      const [newReceipt] = await db
        .insert(receipts)
        .values({
          ...receiptData,
          generatedAt: new Date(),
          metadata: receiptData.metadata || {}
        })
        .returning();

      return newReceipt;
    } catch (error) {
      console.error('Error creating receipt:', error);
      throw new Error('Failed to create receipt');
    }
  }

  async getReceipt(id: number): Promise<Receipt | undefined> {
    try {
      const [receipt] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.id, id));

      return receipt;
    } catch (error) {
      console.error('Error fetching receipt:', error);
      throw new Error('Failed to fetch receipt');
    }
  }

  async listReceipts(userId: number): Promise<Receipt[]> {
    try {
      const userReceipts = await db
        .select()
        .from(receipts)
        .where(eq(receipts.userId, userId))
        .orderBy(desc(receipts.generatedAt));

      return userReceipts;
    } catch (error) {
      console.error('Error listing receipts:', error);
      throw new Error('Failed to list receipts');
    }
  }

  async getReceiptByBookingId(bookingId: number): Promise<Receipt | undefined> {
    try {
      const [receipt] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.bookingId, bookingId));

      return receipt;
    } catch (error) {
      console.error('Error fetching receipt by booking ID:', error);
      throw new Error('Failed to fetch receipt by booking ID');
    }
  }

  async searchEquipment(params: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    location?: string;
    radius?: number;
    specifications?: Record<string, any>;
    season?: 'spring' | 'summer' | 'autumn' | 'winter';
    availability?: boolean;
  }): Promise<Equipment[]> {
    try {
      const conditions = [];

      if (params.query) {
        conditions.push(
          or(
            sql`${equipmentTable.name} ILIKE ${`%${params.query}%`}`,
            sql`${equipmentTable.description} ILIKE ${`%${params.query}%`}`
          )
        );
      }

      if (params.category && params.category !== 'all') {
        conditions.push(eq(equipmentTable.category, params.category));
      }

      if (params.minPrice !== undefined) {
        conditions.push(gte(equipmentTable.dailyRate, params.minPrice));
      }

      if (params.maxPrice !== undefined) {
        conditions.push(lte(equipmentTable.dailyRate, params.maxPrice));
      }

      if (params.location) {
        conditions.push(sql`${equipmentTable.location} ILIKE ${`%${params.location}%`}`);
      }

      if (params.availability !== undefined) {
        conditions.push(eq(equipmentTable.availability, params.availability));
      }

      if (params.season) {
        conditions.push(
          sql`${equipmentTable.seasonalAvailability}->>'${params.season}' = 'true'`
        );
      }

      const query = conditions.length > 0
        ? db.select().from(equipmentTable).where(and(...conditions))
        : db.select().from(equipmentTable);

      const results = await query.orderBy(desc(equipmentTable.createdAt));

      return results.map(equipment => ({
        ...equipment,
        availability: Boolean(equipment.availability),
        specs: this.parseJsonField(equipment.specs, {}),
        features: this.parseJsonField(equipment.features, []),
        seasonalAvailability: this.parseJsonField(equipment.seasonalAvailability, {
          spring: true,
          summer: true,
          autumn: true,
          winter: true
        }),
        searchableSpecs: this.parseJsonField(equipment.searchableSpecs, {})
      }));
    } catch (error) {
      console.error('Error in searchEquipment:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to search equipment');
    }
  }

  async getEquipmentBySpecification(specKey: string, value: string | number): Promise<Equipment[]> {
    try {
      const results = await db
        .select()
        .from(equipmentTable)
        .where(
          sql`${equipmentTable.searchableSpecs}->>'${specKey}' = ${value.toString()}`
        );

      return results.map(equipment => ({
        ...equipment,
        availability: Boolean(equipment.availability)
      }));
    } catch (error) {
      console.error('Error in getEquipmentBySpecification:', error);
      throw new Error('Failed to get equipment by specification');
    }
  }

  async getEquipmentInRadius(lat: number, lng: number, radiusKm: number): Promise<Equipment[]> {
    try {
      // Using PostgreSQL's earthdistance extension for location-based search
      const { rows } = await pool.query(`
        SELECT *
        FROM equipment
        WHERE point(${lng}, ${lat}) <@> point(NULLIF(longitude_coord, '')::float8, NULLIF(latitude_coord, '')::float8) <= ${radiusKm}
      `);

      return rows.map(equipment => ({
        ...equipment,
        availability: Boolean(equipment.availability)
      }));
    } catch (error) {
      console.error('Error in getEquipmentInRadius:', error);
      throw new Error('Failed to get equipment in radius');
    }
  }

  // Helper method to safely parse JSON fields
  private parseJsonField(field: any, defaultValue: any): any {
    if (!field) return defaultValue;
    if (typeof field === 'object') return field;

    try {
      // Handle '[object Object]' case
      if (field === '[object Object]') return defaultValue;

      // Try to parse if it's a string
      if (typeof field === 'string') {
        if (field.trim() === '') return defaultValue;
        const parsed = JSON.parse(field);
        return parsed || defaultValue;
      }

      return defaultValue;
    } catch (error) {
      console.error('Error parsing JSON field:', error);
      console.error('Field value:', field);
      console.error('Field type:', typeof field);
      return defaultValue;
    }
  }

  async calculateEquipmentPopularity(equipmentId: number): Promise<number> {
    try {
      const [result] = await db
        .select({
          popularity: sql<number>`
            COALESCE(
              (
                SELECT COUNT(*)::int * 10 +
                (SELECT COALESCE(AVG(${reviews.rating}), 0) * 2)::int
                FROM ${reviews}
                WHERE ${reviews.equipmentId} = ${equipmentId}
              ),
              0
            )`
        })
        .from(equipmentTable)
        .where(eq(equipmentTable.id, equipmentId));

      return result?.popularity || 0;
    } catch (error) {
      console.error('Error calculating equipment popularity:', error);
      return 0;
    }
  }

  async listEquipmentReviews(equipmentId: number): Promise<Review[]> {
    try {
      const equipmentReviews = await db
        .select({
          id: reviews.id,
          userId: reviews.userId,
          equipmentId: reviews.equipmentId,
          rating: reviews.rating,
          comment: reviews.comment,
          createdAt: reviews.createdAt
        })
        .from(reviews)
        .where(eq(reviews.equipmentId, equipmentId))
        .orderBy(desc(reviews.createdAt));

      return equipmentReviews;
    } catch (error) {
      console.error('Error listing equipment reviews:', error);
      throw new Error('Failed to list equipment reviews');
    }
  }
}

export const storage = new DatabaseStorage();
storage.init().catch(err => {
  console.error('Error initializing storage:', err);
});