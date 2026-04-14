import React, { useRef } from 'react';
import { Mic } from 'lucide-react';

interface VoiceVisualizerProps {
  isListening: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
  title?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isListening, onPressStart, onPressEnd, title }) => {
  const handlePressStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent default touch behavior like scrolling
    onPressStart();
  };

  const handlePressEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onPressEnd();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <button
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onContextMenu={handleContextMenu}
      style={{
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 select-none ${
        isListening 
          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
          : 'bg-panel border border-border-main text-text-muted hover:text-accent hover:border-accent/30'
      }`}
      title={title}
    >
      <Mic size={18} />
    </button>
  );
};
