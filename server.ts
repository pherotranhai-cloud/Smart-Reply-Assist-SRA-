
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
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`API Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Replicate Netlify function logic for local development
  apiRouter.post('/import-vocab', async (req, res) => {
    try {
      console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
      
      const sheetUrl = `https://docs.google.com/spreadsheets/d/16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY/edit?usp=sharing`;
      console.log("Fetching from URL:", sheetUrl);
      const response = await axios.get(sheetUrl, { timeout: 10000 });
      
      if (!response.data) {
        throw new Error('Empty response from Google Sheets');
      }

      const parsed = Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
      });

      const rawData = parsed.data;
      if (rawData.length === 0) {
        return res.json({ message: 'No data found in Google Sheet', count: 0, data: [] });
      }

      const sanitizedData = rawData.map((item: any) => {
        const term = String(item.term || item.category || '').trim();
        const meaning_vi = String(item.meaning_vi || item.vietnamese || item.tieng_viet || item.vi || '').trim();
        const target_en = String(item.target_en || item.english || item.tieng_anh || item.en || '').trim();
        const target_zh = String(item.target_zh || item.chinese || item.tieng_trung || item.zh || '').trim();
        const enabledVal = item.enable !== undefined ? item.enable : item.enabled;
        const enabled = enabledVal !== false && String(enabledVal).toLowerCase() !== 'false';
        
        const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
        const id = crypto.createHash('md5').update(hashInput).digest('hex');

        return {
          id,
          term: term || meaning_vi,
          meaning_vi,
          target_en,
          target_zh,
          enabled
        };
      }).filter((item: any) => item.meaning_vi);

      if (sanitizedData.length === 0) {
        return res.json({ message: 'No valid items found after filtering', count: 0, data: [] });
      }

      res.json({ 
        status: 'success',
        message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
        count: sanitizedData.length,
        data: sanitizedData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Import error:', error.message);
      
      let errorMessage = 'Internal Server Error';
      let statusCode = 500;
      
      if (error.response && error.response.status === 404) {
        errorMessage = 'Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ';
        statusCode = 404;
      }

      res.status(statusCode).json({ error: errorMessage, details: error.message });
    }
  });

  // Since we don't have a DB, /vocab API might not be needed if frontend uses localStorage.
  // We'll return 404 or a message to use localStorage.
  apiRouter.get('/vocab', (req, res) => {
    res.status(410).json({ error: 'Database removed. Please use client-side localStorage and /api/import-vocab to sync.' });
  });

  // Catch-all for API routes to prevent falling through to SPA fallback
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use('/api', apiRouter);

  // Vite middleware for development
    const vite = await createViteServer({
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
