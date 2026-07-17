import React, { useState, useEffect } from 'react';

const IMAGES = [
  new URL('../../Asset/pal1.jpeg', import.meta.url).href,
  new URL('../../Asset/pal2.jpeg', import.meta.url).href,
  new URL('../../Asset/pal3.jpeg', import.meta.url).href,
  new URL('../../Asset/pal4.jpeg', import.meta.url).href,
  new URL('../../Asset/pal5.jpeg', import.meta.url).href,
];

export const BackgroundSlideshow: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Transition background images every 10 seconds
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % IMAGES.length);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
      {IMAGES.map((src, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={src}
            className={`absolute inset-0 w-full h-full transition-opacity duration-[2000ms] ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              className={`absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat transition-transform duration-[10000ms] ${
                isActive ? 'animate-ken-burns' : ''
              }`}
              style={{ backgroundImage: `url(${src})` }}
            />
          </div>
        );
      })}
      
      {/* Premium dark overlays for accessibility and cyberpunk styling */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-950/75 via-dark-950/70 to-dark-950/85 z-10" />
      <div className="absolute inset-0 cyber-grid opacity-[0.25] z-10" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent to-dark-950/40 z-10 pointer-events-none" />
    </div>
  );
};
