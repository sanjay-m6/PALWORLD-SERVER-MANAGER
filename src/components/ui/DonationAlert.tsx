import React, { useState, useEffect } from 'react';
import { Heart, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

const KofiIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] flex-shrink-0 mr-1.5">
    <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723S0 5.438 0 9.878c0 4.148 2.052 8.783 7.822 8.783h5.45c5.367 0 5.753-4.148 5.753-4.148s3.623.125 4.859-2.529c.928-1.996 0-3.036 0-3.036zm-6.666 4.398s-.204 1.834-3.69 1.834H8.384c-3.792 0-4.526-2.573-4.526-5.385 0-2.812.734-5.385 4.526-5.385h5.14c3.486 0 3.69 1.834 3.69 1.834v7.102zm4.332-1.749c-.482 1.036-1.954 1.137-1.954 1.137V7.809s1.472.102 1.954 1.137c.309.664.12 1.341 0 1.651z"/>
  </svg>
);

const PaypalIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] flex-shrink-0 mr-1.5">
    <path d="M20.067 8.047c-.452-2.5-1.97-4.426-4.905-5.26C13.88 2.41 12.016 2.44 9.948 2.44H3.14a.972.972 0 00-.962.836L.01 17.514a.65.65 0 00.64.747h4.372l1.248-7.904c.05-.316.326-.549.646-.549h2.378c3.55 0 6.353-1.442 7.164-5.597.35-1.797.166-3.155-.39-4.164zm-5.187 4.22c-.642 3.3-2.864 4.444-5.69 4.444H6.012l-1.02 6.463a.65.65 0 00.64.75h4.152a.973.973 0 00.962-.835l1.092-6.91a.647.647 0 01.642-.55h.582c3.21 0 5.748-1.305 6.48-5.066.31-1.6.142-2.825-.333-3.738a5.197 5.197 0 00-.814-.523c-.7 3.328-2.612 5.084-5.328 5.965z"/>
  </svg>
);

const GithubIcon = () => (
  <svg className="w-[15px] h-[15px] fill-current flex-shrink-0 mr-1.5" viewBox="0 0 24 24">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

interface SupportLink {
  name: string;
  url?: string;
  logo: React.ReactNode;
  colorClass: string;
}

export const DonationAlert: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const SUPPORT_LINKS: SupportLink[] = [
    { 
      name: 'Ko-fi', 
      url: 'https://ko-fi.com/infinity86', 
      logo: <KofiIcon />, 
      colorClass: 'bg-[#ff5f5f] hover:bg-[#ff4a4a] text-white shadow-lg shadow-red-500/15 hover:shadow-red-500/25' 
    },
    { 
      name: 'PayPal', 
      url: 'https://paypal.me/infinity86s?locale.x=en_GB&country.x=IN', 
      logo: <PaypalIcon />, 
      colorClass: 'bg-[#0079c1] hover:bg-[#006cae] text-white shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25' 
    },
    { 
      name: 'GitHub', 
      logo: <GithubIcon />, 
      url: 'https://github.com/sponsors/sanjay-m6', 
      colorClass: 'bg-[#24292e] hover:bg-[#1c2024] text-white shadow-lg shadow-black/20 hover:shadow-black/30' 
    }
  ];

  useEffect(() => {
    const checkInterval = 60000; // Check every 60 seconds

    const checkTimer = () => {
      const lastTimeStr = localStorage.getItem('lastDonationAlertTime');
      if (!lastTimeStr) {
        // Set initial timestamp to now
        localStorage.setItem('lastDonationAlertTime', Date.now().toString());
        return;
      }

      const lastTime = parseInt(lastTimeStr, 10);
      if (isNaN(lastTime)) {
        localStorage.setItem('lastDonationAlertTime', Date.now().toString());
        return;
      }

      const elapsed = Date.now() - lastTime;
      // Trigger popup if elapsed time is >= 3 hours
      if (elapsed >= 3 * 60 * 60 * 1000) {
        setIsOpen(true);
      }
    };

    // Run initial check
    checkTimer();

    const intervalId = setInterval(checkTimer, checkInterval);
    return () => clearInterval(intervalId);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    // Reset the 3-hour timer in localStorage
    localStorage.setItem('lastDonationAlertTime', Date.now().toString());
  };

  const handleActionClick = async (link: SupportLink) => {
    if (link.url) {
      try {
        await invoke('plugin:opener|open_url', { url: link.url });
      } catch (e) {
        console.error(e);
        window.open(link.url, '_blank');
      }
      handleClose();
    }
  };

  // Global custom event helper for testing/triggering manually
  useEffect(() => {
    const triggerTestDonationAlert = () => {
      setIsOpen(true);
    };
    window.addEventListener('test-donation-alert', triggerTestDonationAlert);
    return () => window.removeEventListener('test-donation-alert', triggerTestDonationAlert);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md">
          {/* Backdrop dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 cursor-default"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
            className="relative w-full max-w-md bg-dark-900 border border-dark-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col items-center p-6 text-center z-10"
          >
            {/* Decorative Top Highlight */}
            <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-rose-500/10 to-transparent opacity-40 pointer-events-none" />

            {/* Top close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Heart Icon Container */}
            <div className="relative mt-2 mb-4">
              <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-md animate-pulse" />
              <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-dark-850 border border-rose-500/20">
                <Heart className="w-6 h-6 text-rose-500" fill="currentColor" />
              </div>
            </div>

            {/* Title & Subtitle */}
            <h3 className="text-lg font-bold text-white tracking-tight">
              Support the Development
            </h3>
            <p className="text-xs text-dark-300 mt-2 mb-6 leading-relaxed">
              This Server Manager is free and open-source. If it helps you manage your servers, please consider a small contribution to support ongoing updates and features.
            </p>

            {/* Action Buttons Row */}
            <div className="grid grid-cols-2 gap-3 w-full mb-5">
              {SUPPORT_LINKS.map((link, index) => (
                <button
                  key={link.name}
                  onClick={() => handleActionClick(link)}
                  className={`flex items-center justify-center px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0 border border-transparent ${link.colorClass} ${
                    SUPPORT_LINKS.length % 2 !== 0 && index === SUPPORT_LINKS.length - 1 ? 'col-span-2' : ''
                  }`}
                >
                  {link.logo}
                  <span>{link.name}</span>
                </button>
              ))}
            </div>

            {/* Remind Me Later Button */}
            <button
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-dark-300 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider border border-dark-800 hover:border-dark-750"
            >
              Remind Me Later
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

