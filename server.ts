import express from "express";
import viteConfigCreator from "./vite.config.ts";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import Papa from "papaparse";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID || "16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY";

import net from "net";

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, "0.0.0.0", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(findAvailablePort(startPort + 1)));
  });
}

async function startServer() {
  const app = express();
  const BASE_PORT = parseInt(process.env.PORT || "5174");

  app.use(express.json({ limit: "10mb" }));

  // API Routes
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`API Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get("/health", (req, res) => res.json({ status: "ok" }));

  // Replicate Netlify function logic for local development
  apiRouter.post("/import-vocab", async (req, res) => {
    const adminKey = req.headers["x-admin-key"] || req.query.key;
    if (!ADMIN_SECRET_KEY || adminKey !== ADMIN_SECRET_KEY) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Admin access required" });
    }
    try {
      console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv`;
      const response = await axios.get(sheetUrl, { timeout: 10000 });

      if (!response.data) {
        throw new Error("Empty response from Google Sheets");
      }

      const parsed = Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) =>
          header
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, ""),
      });

      const rawData = parsed.data;
      if (rawData.length === 0) {
        return res.json({
          message: "No data found in Google Sheet",
          count: 0,
          data: [],
        });
      }

      const sanitizedData = rawData
        .map((item: any) => {
          const term = String(item.term || item.category || "").trim();
          const meaning_vi = String(
            item.meaning_vi ||
              item.vietnamese ||
              item.tieng_viet ||
              item.vi ||
              "",
          ).trim();
          const target_en = String(
            item.target_en || item.english || item.tieng_anh || item.en || "",
          ).trim();
          const target_zh = String(
            item.target_zh || item.chinese || item.tieng_trung || item.zh || "",
          ).trim();
          const enabledVal =
            item.enable !== undefined ? item.enable : item.enabled;
          const enabled =
            enabledVal !== false &&
            String(enabledVal).toLowerCase() !== "false";

          const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
          const id = crypto.createHash("md5").update(hashInput).digest("hex");

          return {
            id,
            term: term || meaning_vi,
            meaning_vi,
            target_en,
            target_zh,
            enabled,
          };
        })
        .filter((item: any) => item.meaning_vi);

      if (sanitizedData.length === 0) {
        return res.json({
          message: "No valid items found after filtering",
          count: 0,
          data: [],
        });
      }

      res.json({
        status: "success",
        message: `Successfully synced ${sanitizedData.length} items from Google Sheets`,
        count: sanitizedData.length,
        data: sanitizedData,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Import error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Since we don't have a DB, /vocab API might not be needed if frontend uses localStorage.
  // We'll return 404 or a message to use localStorage.
  apiRouter.get("/vocab", (req, res) => {
    res
      .status(410)
      .json({
        error:
          "Database removed. Please use client-side localStorage and /api/import-vocab to sync.",
      });
  });

  // Catch-all for API routes to prevent falling through to SPA fallback
  apiRouter.all("*", (req, res) => {
    res
      .status(404)
      .json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use("/api", apiRouter);

  // Vite middleware for development
  const PORT = await findAvailablePort(BASE_PORT);
  if (process.env.NODE_ENV !== "production") {
    // Manually run Vite configuration to avoid tsx's bug with URL schemes containing vietnamese text.
    const viteConfig = typeof viteConfigCreator === 'function' 
      ? viteConfigCreator({ mode: 'development', command: 'serve' } as any) 
      : viteConfigCreator;

    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: PORT + 10000 },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    if (PORT !== BASE_PORT) {
      console.log(`   (port ${BASE_PORT} was in use, using ${PORT} instead)`);
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
