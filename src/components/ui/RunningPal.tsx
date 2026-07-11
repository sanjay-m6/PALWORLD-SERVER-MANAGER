import React from 'react';

interface RunningPalProps {
  size?: number;
  className?: string;
  label?: string;
}

export const RunningPal: React.FC<RunningPalProps> = ({ 
  size = 72, 
  className = '', 
  label 
}) => {
  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <div 
        className="relative flex items-center justify-center"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <svg 
          viewBox="0 0 100 100" 
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ambient Shadow underneath */}
          <ellipse 
            cx="50" 
            cy="88" 
            rx="24" 
            ry="4.5" 
            fill="rgba(0, 0, 0, 0.25)" 
            className="animate-pal-shadow origin-center" 
          />
          
          {/* Main Body + Features Group (Bounces while running) */}
          <g className="animate-pal-body origin-bottom">
            {/* Left Horn */}
            <path 
              d="M 33 26 C 24 18, 17 28, 25 35 C 28 32, 31 30, 35 29 Z" 
              fill="#ECC94B" 
              stroke="#0f172a" 
              strokeWidth="2" 
              strokeLinejoin="round"
            />
            {/* Right Horn */}
            <path 
              d="M 67 26 C 76 18, 83 28, 75 35 C 72 32, 69 30, 65 29 Z" 
              fill="#ECC94B" 
              stroke="#0f172a" 
              strokeWidth="2" 
              strokeLinejoin="round"
            />
            
            {/* Left Ear */}
            <path 
              d="M 26 38 C 17 40, 15 48, 24 47 Z" 
              fill="#475569" 
              stroke="#0f172a" 
              strokeWidth="1.75" 
              strokeLinejoin="round"
            />
            {/* Right Ear */}
            <path 
              d="M 74 38 C 83 40, 85 48, 76 47 Z" 
              fill="#475569" 
              stroke="#0f172a" 
              strokeWidth="1.75" 
              strokeLinejoin="round"
            />

            {/* Fluffy Wool Body (Cloud-like Path) */}
            <path 
              d="M 50 25 
                 A 11 11 0 0 1 65 28 
                 A 11 11 0 0 1 74 38 
                 A 11 11 0 0 1 75 52 
                 A 11 11 0 0 1 65 67 
                 A 11 11 0 0 1 50 70 
                 A 11 11 0 0 1 35 67 
                 A 11 11 0 0 1 25 52 
                 A 11 11 0 0 1 26 38 
                 A 11 11 0 0 1 35 28 Z" 
              fill="#FFFFFF" 
              stroke="#0f172a" 
              strokeWidth="2.5" 
              strokeLinejoin="round"
            />

            {/* Dark Face Panel */}
            <rect 
              x="36" 
              y="38" 
              width="28" 
              height="24" 
              rx="12" 
              fill="#334155" 
              stroke="#0f172a" 
              strokeWidth="2" 
            />
            
            {/* Cute Oval Eyes */}
            <ellipse cx="43" cy="48" rx="2.5" ry="4" fill="#FFFFFF" />
            <ellipse cx="43.5" cy="48.5" rx="1" ry="1.75" fill="#000000" />
            
            <ellipse cx="57" cy="48" rx="2.5" ry="4" fill="#FFFFFF" />
            <ellipse cx="56.5" cy="48.5" rx="1" ry="1.75" fill="#000000" />
            
            {/* Blushing Cheeks */}
            <ellipse cx="40" cy="54" rx="2.5" ry="1.5" fill="#F43F5E" opacity="0.6" />
            <ellipse cx="60" cy="54" rx="2.5" ry="1.5" fill="#F43F5E" opacity="0.6" />
            
            {/* Happy Mouth */}
            <path 
              d="M 48 53 Q 50 56 52 53" 
              stroke="#FFFFFF" 
              strokeWidth="1.5" 
              fill="none" 
              strokeLinecap="round" 
            />
            
            {/* Cute Little Fluff on Forehead */}
            <path 
              d="M 44 32 A 5 5 0 0 1 56 32" 
              fill="none" 
              stroke="#0f172a" 
              strokeWidth="2" 
              strokeLinecap="round" 
            />

            {/* Stubby Left Arm */}
            <path 
              d="M 31 52 C 26 53, 24 57, 27 60 C 29 61, 32 58, 32 55" 
              fill="#334155" 
              stroke="#0f172a" 
              strokeWidth="1.75"
              className="animate-pal-left-arm origin-top-right"
            />
            {/* Stubby Right Arm */}
            <path 
              d="M 69 52 C 74 53, 76 57, 73 60 C 71 61, 68 58, 68 55" 
              fill="#334155" 
              stroke="#0f172a" 
              strokeWidth="1.75"
              className="animate-pal-right-arm origin-top-left"
            />
          </g>
          
          {/* Running Left Foot */}
          <ellipse 
            cx="38" 
            cy="77" 
            rx="5.5" 
            ry="4" 
            fill="#1E293B" 
            stroke="#0f172a" 
            strokeWidth="2" 
            className="animate-pal-left-foot origin-center" 
          />
          {/* Running Right Foot */}
          <ellipse 
            cx="62" 
            cy="77" 
            rx="5.5" 
            ry="4" 
            fill="#1E293B" 
            stroke="#0f172a" 
            strokeWidth="2" 
            className="animate-pal-right-foot origin-center" 
          />
        </svg>
      </div>
      {label && (
        <span className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-gradient-cyan animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
};
