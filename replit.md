# Farm Equipment Rental Platform

## Project Overview
A comprehensive farm equipment rental platform built with React/TypeScript frontend and Express/Node.js backend. The platform enables farmers to rent agricultural equipment with features including equipment browsing, booking, payments, and AI-powered assistance.

## Recent Changes
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