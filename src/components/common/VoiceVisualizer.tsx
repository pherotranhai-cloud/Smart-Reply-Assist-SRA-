import React, { useRef } from 'react';
import { Mic } from 'lucide-react';

interface VoiceVisualizerProps {
  isListening: boolean;
  onClick: () => void;
  title?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isListening, onClick, title }) => {
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent default touch behavior like scrolling
    onClick();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 select-none ${
        isListening 
          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse' 
          : 'bg-transparent text-text-muted hover:bg-bg-input active:bg-bg-input hover:text-accent'
      }`}
      title={title}
    >
      <Mic size={18} />
    </button>
  );
};
