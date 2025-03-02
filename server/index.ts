import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import fs from "fs";
import path from "path";
import { setupAuth } from "./auth";
import { createTables } from "./migrations";

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Initialize database tables with better error handling
createTables().catch((err) => {
  console.error("Failed to create database tables:", err);
  process.exit(1);
});

(async () => {
  try {
    const port = Number(process.env.PORT) || 5002;
    const server = registerRoutes(app);
    await setupAuth(app);

    // Configure server timeouts
    server.keepAliveTimeout = 120000; // 2 minutes
    server.headersTimeout = 121000; // Slightly higher than keepAliveTimeout
    server.timeout = 180000; // 3 minutes

    // Enhanced error handling
    app.use(
      (
        err: Error & { status?: number; statusCode?: number },
        _req: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        console.error("Error:", {
          status,
          message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        });
        res.status(status).json({
          message,
          status,
          timestamp: new Date().toISOString(),
        });
      },
    );

    // Set up Vite in development mode
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Enhanced connection handling
    server.on("connection", (socket) => {
      socket.setKeepAlive(true, 30000);
      socket.setTimeout(120000);

      socket.on("error", (err) => {
        console.error("Socket error:", err);
      });

      socket.on("timeout", () => {
        console.log("Socket timeout detected");
        socket.end();
      });
    });

    // Start server with improved logging
    server.listen(port, "0.0.0.0", () => {
      console.log(`Server is running at http://0.0.0.0:${port}`);
      log(`Server ready and listening on port ${port}`);

      // Write a ready file to indicate the server is up
      const readyFile = path.join(process.cwd(), ".ready");
      fs.writeFileSync(readyFile, "ready");

      // Signal ready state
      if (process.send) {
        process.send("ready");
      }
    });

    // Enhanced graceful shutdown
    const cleanup = async () => {
      console.log("Initiating graceful shutdown...");

      // Remove ready file
      try {
        const readyFile = path.join(process.cwd(), ".ready");
        if (fs.existsSync(readyFile)) {
          fs.unlinkSync(readyFile);
        }
      } catch (error) {
        console.error("Error removing ready file:", error);
      }

      // Close server
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    // Register cleanup handlers
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
