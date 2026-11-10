import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import pkg from './package.json';

dotenv.config();

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  
  // Enable CORS so the Netlify frontend can securely request data
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const PORT = 3000;

  // API Routes
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`[Server] Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

  apiRouter.get('/', (req, res) => {
    res.status(200).json({ status: "AIMA Engine Operational", version: pkg.version });
  });

  // Netlify fallback routes (translate, import-vocab, etc.)
  try {
    const path = await import('path');
    // Lấy chính xác đường dẫn tuyệt đối từ thư mục gốc của project trên đĩa Render
    const netlifyApiPath = path.join(process.cwd(), 'netlify', 'functions', 'api.ts');
    
    // Sử dụng dynamic import với đường dẫn tuyệt đối (bổ sung file:// cho chuẩn ESM URL)
    const netlifyModule = await import(`file://${netlifyApiPath}`).catch(() => import(`./netlify/functions/api.ts`));
    
    apiRouter.use(netlifyModule.router || netlifyModule.default);
    console.log('[ESM Bridge]: Khởi nạp Netlify Core Router thành công bằng đường dẫn tuyệt đối.');
  } catch (importError) {
    console.error('[ESM Bridge Error]: Không thể phân giải Netlify Router tại gốc:', importError);
  }

  // Catch-all for API routes to prevent falling through
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const path = await import('path');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });

}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
