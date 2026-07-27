import React, { useEffect, useRef } from 'react';
import { UserPreferences } from '../types';

interface BackgroundCanvasProps {
  preferences: UserPreferences;
}

export const BackgroundCanvas: React.FC<BackgroundCanvasProps> = ({ preferences }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (preferences.backgroundEffect === 'none' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    if (preferences.backgroundEffect === 'particles') {
      const particles: { x: number; y: number; vx: number; vy: number; radius: number }[] = [];
      for (let i = 0; i < 50; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 1,
          radius: Math.random() * 2 + 1,
        });
      }

      const drawParticles = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        animationFrameId = requestAnimationFrame(drawParticles);
      };
      drawParticles();
    } else if (preferences.backgroundEffect === 'liquid') {
      let time = 0;
      const drawLiquid = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, `hsla(${(time * 0.1) % 360}, 70%, 50%, 0.3)`);
        gradient.addColorStop(1, `hsla(${((time * 0.1) + 180) % 360}, 70%, 50%, 0.3)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        
        for (let x = 0; x <= canvas.width; x += 50) {
          const y = canvas.height / 2 + Math.sin(x * 0.01 + time * 0.02) * 50 + Math.cos(x * 0.02 + time * 0.01) * 50;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fill();
        
        time++;
        animationFrameId = requestAnimationFrame(drawLiquid);
      };
      drawLiquid();
    } else if (preferences.backgroundEffect === 'aurora') {
      let time = 0;
      const drawAurora = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(0, canvas.height);
          
          for (let x = 0; x <= canvas.width; x += 50) {
            const y = (canvas.height * 0.5) 
              + Math.sin(x * 0.005 + time * 0.01 + i) * (canvas.height * 0.2) 
              + Math.cos(x * 0.003 + time * 0.015 - i) * (canvas.height * 0.1);
            ctx.lineTo(x, y);
          }
          
          ctx.lineTo(canvas.width, canvas.height);
          ctx.closePath();
          
          const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
          const hue = (time * 0.1 + i * 40) % 360;
          gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0)`);
          gradient.addColorStop(0.5, `hsla(${hue}, 80%, 60%, 0.15)`);
          gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.05)`);
          
          ctx.fillStyle = gradient;
          ctx.fill();
        }
        
        time++;
        animationFrameId = requestAnimationFrame(drawAurora);
      };
      drawAurora();
    } else if (preferences.backgroundEffect === 'waves') {
      let time = 0;
      const drawWaves = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, canvas.height);
          
          for (let x = 0; x <= canvas.width; x += 50) {
            const y = canvas.height * (0.6 + i * 0.05) 
              + Math.sin(x * 0.008 + time * 0.02 + i) * 30 
              + Math.cos(x * 0.005 + time * 0.01 + i) * 20;
            ctx.lineTo(x, y);
          }
          
          ctx.lineTo(canvas.width, canvas.height);
          ctx.closePath();
          
          const hue = 200 + i * 15;
          ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.1)`;
          ctx.fill();
          
          // Draw wave line
          ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.2)`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        time++;
        animationFrameId = requestAnimationFrame(drawWaves);
      };
      drawWaves();
    }

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [preferences.backgroundEffect]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none">
      {preferences.backgroundImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${preferences.backgroundImage})` }}
        />
      )}
      {preferences.backgroundEffect !== 'none' && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />
      )}
    </div>
  );
};
