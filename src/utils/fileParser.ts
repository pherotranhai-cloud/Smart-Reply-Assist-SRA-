import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Set worker source for PDF.js
// Note: In a real extension build, you might need to copy the worker file to public/
// and reference it via chrome.runtime.getURL() or similar.
// For now, we use the CDN or try to resolve it via import if the bundler supports it.
// However, importing the worker directly often causes issues in some setups.
// Let's try a CDN fallback for simplicity, but ideally this should be a local asset.
// Using unpkg for now as a default, but this might be blocked by CSP in strict environments.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const parseFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return parsePDF(file);
    case 'xlsx':
    case 'xls':
    case 'csv':
      return parseExcel(file);
    default:
      throw new Error(`Unsupported file format: .${extension}`);
  }
};

const parsePDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    text += strings.join(' ') + '\n';
  }

  return text;
};

const parseExcel = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  let text = '';
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Convert sheet to CSV format as it's a good text representation
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
  });

  return text;
};
