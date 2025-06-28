# Farm Equipment Rental Platform

## Project Overview
A comprehensive farm equipment rental platform built with React/TypeScript frontend and Express/Node.js backend. The platform enables farmers to rent agricultural equipment with features including equipment browsing, booking, payments, and AI-powered assistance.

## Recent Changes
- **2025-06-28**: Streamlined receipt system and enhanced AI assistant with WhatsApp integration
  - Removed search bar from receipt history as requested for cleaner interface
  - Fixed receipt amount display with accurate rupee formatting (₹2,000, ₹20,000)
  - Corrected payment status UI with proper "Payment Confirmed" display and improved styling
  - Enhanced analytics dashboard showing total receipts, amounts, and status counts
  - Improved AI assistant with direct WhatsApp messaging functionality
  - Added WhatsApp contact button to main navigation for easy support access
  - Integrated equipment sharing feature in chatbot for improved user experience
  - Enhanced payment status badges with better colors and rounded styling
  - Simplified export functionality with total amount calculation feature
- **2025-06-28**: Fixed receipt amount formatting and mobile view issues
  - Corrected amount display inconsistency between Razorpay and booking system
  - Fixed receipt amounts showing ₹200 instead of correct ₹2,000
  - Added proper amount column to receipt history table
  - Fixed all missing translation keys (payment, filters, receipt)
  - Ensured mobile view displays amounts correctly with proper formatting
- **2025-06-28**: Fixed all TypeScript and translation errors
  - Resolved cityCoordinates typing issues in routes file
  - Fixed equipment update interface for popularity field support
  - Added missing translation keys for auth, navigation, and categories
  - Updated all language files (English, Hindi, Marathi) for consistency
  - Eliminated all console warnings and LSP errors
- **2025-01-28**: Fixed chatbot integration with Google Gemini API
  - Moved API calls to backend for security
  - Added multi-language support (English, Hindi, Marathi)
  - Enhanced UI with modern design and quick suggestion buttons
  - Implemented proper error handling and typing indicators
- **2025-01-28**: Added equipment availability sorting (available equipment shown first)
- **2025-01-28**: Integrated Google Gemini AI for farm equipment assistance

## Project Architecture
### Frontend (React/TypeScript)
- Component-based architecture with shadcn/ui
- Multi-language support with i18next
- TanStack Query for data fetching
- Wouter for routing

### Backend (Express/Node.js)
- PostgreSQL database with Drizzle ORM
- Passport.js authentication
- Razorpay payment integration
- Google Gemini AI integration for chatbot
- Cloudinary for image uploads

### Key Features
- Equipment browsing with filtering and search
- Map view with equipment locations
- Booking system with calendar selection
- Payment processing with Razorpay
- AI chatbot assistant (Google Gemini)
- Multi-language support
- Receipt generation and history
- Equipment comparison tools
- Review and rating system

## User Preferences
- Prefers working chatbot functionality similar to major e-commerce platforms
- Wants multi-language support for farm equipment assistance
- Requires proper API key integration and error handling

## Environment Setup
- Uses Google Gemini API for chatbot functionality
- PostgreSQL database for data persistence
- Cloudinary for image storage
- Razorpay for payment processing

## Current Status
- Chatbot is fully functional with Gemini API integration
- Equipment sorting by availability implemented
- Multi-language translations added for chatbot
- Enhanced UI/UX for better user experience