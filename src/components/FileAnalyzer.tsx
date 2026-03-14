import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileText, X, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import Markdown from 'react-markdown';
import { parseFile } from '../utils/fileParser';
import { AIService } from '../services/ai';
import { AISettings } from '../types';

interface FileAnalyzerProps {
  settings: AISettings;
  globalLanguage: string;
  onAnalyzeComplete: (summary: string) => void;
  t: any;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['pdf', 'xlsx', 'xls', 'csv'];

export const FileAnalyzer: React.FC<FileAnalyzerProps> = ({ settings, globalLanguage, onAnalyzeComplete, t }) => {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selectedFile: File) => {
    setError(null);
    setResult(null);

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(t('fileSizeError') || 'File size exceeds 5MB limit.');
      return;
    }

    const extension = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      setError(`${t('unsupportedFormat') || 'Unsupported file format. Allowed:'} ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    setFile(selectedFile);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      // 1. Parse File
      const text = await parseFile(file);
      
      if (!text || text.trim().length === 0) {
        throw new Error(t('extractError') || 'Could not extract text from file. The file might be empty or scanned image.');
      }

      // 2. Analyze with AI
      const ai = new AIService(settings);
      const analysis = await ai.analyzeFileContent(text, globalLanguage);
      
      setResult(analysis);
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('analysisFailed') || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.pdf')) return <FileText size={32} className="text-red-400" />;
    if (filename.match(/\.(xlsx|xls|csv)$/)) return <FileSpreadsheet size={32} className="text-green-400" />;
    return <FileText size={32} className="text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          file ? 'border-accent/50 bg-accent/5' : 'border-border-main/50 hover:border-accent/30 hover:bg-accent/5'
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center border border-border-main/50">
                <Upload size={32} className="text-muted" />
              </div>
              <div>
                <p className="text-lg font-medium">{t('dragDrop')}</p>
                <p className="text-sm text-muted mt-1">
                  {t('supports')}
                </p>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="saas-button secondary-button px-6 py-2"
              >
                {t('selectFile')}
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="selected"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              {getFileIcon(file.name)}
              <div>
                <p className="text-lg font-medium text-accent">{file.name}</p>
                <p className="text-sm text-muted">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setFile(null)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                  title="Remove file"
                >
                  <X size={20} />
                </button>
                <button 
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="saas-button primary-button px-8 py-2 flex items-center gap-2"
                >
                  {analyzing ? <Loader2 className="animate-spin" size={18} /> : null}
                  {analyzing ? t('analyzing') : t('analyzeDocument')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        />
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-3"
        >
          <AlertCircle size={20} />
          {error}
        </motion.div>
      )}

      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 border border-border-main/50"
        >
          <div className="flex justify-between items-center mb-4 border-b border-border-main/30 pb-4">
            <h3 className="text-xl font-bold text-accent flex items-center gap-2">
              <FileText size={24} /> {t('contextSummary')}
            </h3>
            <button 
              onClick={() => navigator.clipboard.writeText(result)}
              className="text-xs text-muted hover:text-accent uppercase tracking-wider"
            >
              {t('copy')}
            </button>
          </div>
          <div className="markdown-body prose max-w-none prose-headings:text-accent prose-a:text-primary">
            <Markdown>{result}</Markdown>
          </div>
          
          <div className="mt-6 pt-4 border-t border-border-main/30 flex justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAnalyzeComplete(result)}
              className="saas-button primary-button px-6 py-3 flex items-center gap-2"
            >
              {t('draftReply')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
