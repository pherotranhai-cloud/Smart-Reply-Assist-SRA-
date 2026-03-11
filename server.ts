import express from 'express';
import { createServer as createViteServer } from 'vite';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB Schema
const VocabSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaningVi: { type: String, required: true },
  targetEn: String,
  targetZh: String,
  enabled: { type: Boolean, default: true },
  id: String,
}, { timestamps: true });

const Vocab = mongoose.models.Vocab || mongoose.model('Vocab', VocabSchema);

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not defined. Backend sync will be disabled.');
    return;
  }
  await mongoose.connect(MONGODB_URI);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post('/api/import-vocab', async (req, res) => {
    try {
      if (!MONGODB_URI) {
        return res.status(503).json({ error: 'Database connection not configured' });
      }

      await connectToDatabase();
      
      const data = req.body;

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty data array' });
      }

      const sanitizedData = data.filter(item => 
        item && typeof item === 'object' && item.term && item.meaningVi
      ).map(item => ({
        term: item.term.trim(),
        meaningVi: item.meaningVi.trim(),
        targetEn: item.targetEn?.trim() || '',
        targetZh: item.targetZh?.trim() || '',
        enabled: item.enabled !== undefined ? item.enabled : true,
        id: item.id || crypto.randomUUID()
      }));

      if (sanitizedData.length === 0) {
        return res.status(400).json({ error: 'No valid vocabulary items found' });
      }

      await Vocab.insertMany(sanitizedData as any[], { ordered: false });

      res.json({ 
        message: `Successfully imported ${sanitizedData.length} items`,
        count: sanitizedData.length
      });
    } catch (error: any) {
      console.error('Import error:', error);
      
      // Specific handling for IP Whitelist errors
      if (error.name === 'MongooseServerSelectionError' || error.message.includes('IP address is not on your Atlas cluster')) {
        return res.status(403).json({ 
          error: 'MongoDB Connection Blocked',
          details: 'Your IP address is not whitelisted in MongoDB Atlas. Please go to Network Access in Atlas and "Allow Access From Anywhere" (0.0.0.0/0).'
        });
      }

      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
