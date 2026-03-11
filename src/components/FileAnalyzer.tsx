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
          file ? 'border-neon-cyan/50 bg-neon-cyan/5' : 'border-cyber-border hover:border-neon-cyan/30 hover:bg-[var(--accent)]/5'
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
              <div className="w-16 h-16 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
                <Upload size={32} className="text-[var(--muted)]" />
              </div>
              <div>
                <p className="text-lg font-medium">{t('dragDrop')}</p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {t('supports')}
                </p>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="cyber-button px-6 py-2 rounded-lg bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] hover:opacity-80"
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
                <p className="text-lg font-medium text-neon-cyan">{file.name}</p>
                <p className="text-sm text-[var(--muted)]">{(file.size / 1024).toFixed(1)} KB</p>
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
                  className="cyber-button px-8 py-2 rounded-lg bg-neon-cyan text-[var(--btn-text)] font-bold hover:shadow-[0_0_15px_var(--glow)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          className="glass-panel p-6 neon-border"
        >
          <div className="flex justify-between items-center mb-4 border-b border-cyber-border pb-4">
            <h3 className="text-xl font-bold neon-text-cyan flex items-center gap-2">
              <FileText size={24} /> {t('contextSummary')}
            </h3>
            <button 
              onClick={() => navigator.clipboard.writeText(result)}
              className="text-xs text-[var(--muted)] hover:text-neon-cyan uppercase tracking-wider"
            >
              {t('copy')}
            </button>
          </div>
          <div className="markdown-body prose prose-invert max-w-none prose-headings:text-neon-cyan prose-a:text-neon-magenta">
            <Markdown>{result}</Markdown>
          </div>
          
          <div className="mt-6 pt-4 border-t border-cyber-border flex justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAnalyzeComplete(result)}
              className="cyber-button px-6 py-3 bg-neon-magenta text-[var(--btn-text)] font-bold rounded-lg flex items-center gap-2 hover:shadow-[0_0_15px_var(--glow)] transition-all"
            >
              {t('draftReply')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
