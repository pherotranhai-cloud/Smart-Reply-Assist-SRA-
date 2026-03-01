import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const EXT_DIR = path.resolve(__dirname, '../extension');
const TARGET_DIR = path.resolve(__dirname, '../dist-ext');

async function build() {
  console.log('Building extension packaging...');
  
  try {
    // Clean target
    if (fs.existsSync(TARGET_DIR)) {
      await fs.remove(TARGET_DIR);
    }
    await fs.ensureDir(TARGET_DIR);

    // Copy dist (UI)
    if (!fs.existsSync(DIST_DIR)) {
      throw new Error('Dist directory not found. Run vite build first.');
    }
    await fs.copy(DIST_DIR, TARGET_DIR);

    // Copy extension artifacts
    if (!fs.existsSync(EXT_DIR)) {
      throw new Error('Extension directory not found.');
    }
    await fs.copy(EXT_DIR, TARGET_DIR);

    // Verify required files
    const required = ['manifest.json', 'background.js', 'index.html'];
    for (const file of required) {
      if (!fs.existsSync(path.join(TARGET_DIR, file))) {
        throw new Error(`Missing required extension file: ${file}`);
      }
    }

    console.log('Extension build complete: dist-ext/');
  } catch (err) {
    console.error('Extension build failed:', err);
    process.exit(1);
  }
}

build();
