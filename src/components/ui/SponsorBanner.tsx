import React from 'react';
import { Heart } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const KofiIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] flex-shrink-0 mr-0.5">
    <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723S0 5.438 0 9.878c0 4.148 2.052 8.783 7.822 8.783h5.45c5.367 0 5.753-4.148 5.753-4.148s3.623.125 4.859-2.529c.928-1.996 0-3.036 0-3.036zm-6.666 4.398s-.204 1.834-3.69 1.834H8.384c-3.792 0-4.526-2.573-4.526-5.385 0-2.812.734-5.385 4.526-5.385h5.14c3.486 0 3.69 1.834 3.69 1.834v7.102zm4.332-1.749c-.482 1.036-1.954 1.137-1.954 1.137V7.809s1.472.102 1.954 1.137c.309.664.12 1.341 0 1.651z"/>
  </svg>
);

const PaypalIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] flex-shrink-0 mr-0.5">
    <path d="M20.067 8.047c-.452-2.5-1.97-4.426-4.905-5.26C13.88 2.41 12.016 2.44 9.948 2.44H3.14a.972.972 0 00-.962.836L.01 17.514a.65.65 0 00.64.747h4.372l1.248-7.904c.05-.316.326-.549.646-.549h2.378c3.55 0 6.353-1.442 7.164-5.597.35-1.797.166-3.155-.39-4.164zm-5.187 4.22c-.642 3.3-2.864 4.444-5.69 4.444H6.012l-1.02 6.463a.65.65 0 00.64.75h4.152a.973.973 0 00.962-.835l1.092-6.91a.647.647 0 01.642-.55h.582c3.21 0 5.748-1.305 6.48-5.066.31-1.6.142-2.825-.333-3.738a5.197 5.197 0 00-.814-.523c-.7 3.328-2.612 5.084-5.328 5.965z"/>
  </svg>
);

const GithubIcon = () => (
  <svg className="w-3.5 h-3.5 fill-current flex-shrink-0" viewBox="0 0 24 24">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

const SUPPORT_LINKS = [
  { 
    name: 'Ko-fi', 
    url: 'https://ko-fi.com/infinity86', 
    logo: <KofiIcon />, 
    colorClass: 'bg-[#ff5e5b] hover:bg-[#ff4c49] text-white shadow-lg shadow-rose-500/10 hover:shadow-rose-500/20' 
  },
  { 
    name: 'PayPal', 
    url: 'https://paypal.me/infinity86s?locale.x=en_GB&country.x=IN', 
    logo: <PaypalIcon />, 
    colorClass: 'bg-[#0070ba] hover:bg-[#005ea6] text-white shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20' 
  },
  { 
    name: 'GitHub', 
    url: 'https://github.com/sponsors/sanjay-m6', 
    logo: <GithubIcon />, 
    colorClass: 'bg-[#24292f] hover:bg-[#1a1f24] text-white shadow-lg shadow-black/15 hover:shadow-black/25' 
  },
];

export const SponsorBanner: React.FC = () => {
  const openUrl = async (url: string) => {
    try {
      await invoke('plugin:opener|open_url', { url });
    } catch (e) {
      console.error(e);
      window.open(url, '_blank');
    }
  };

  return (
    <div className="glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-dark-800 bg-dark-900/10">
      {/* Left: Support message */}
      <div className="flex items-center gap-3.5 w-full sm:w-auto">
        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-dark-950/60 border border-rose-500/20">
          <Heart className="w-5 h-5 text-rose-400" fill="currentColor" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-xs font-bold text-dark-100 uppercase tracking-wider">
            Support the Development
          </span>
          <span className="text-[10px] text-dark-400 mt-0.5">
            Keep our Palworld Dedicated Server Manager running with a small contribution.
          </span>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
        {SUPPORT_LINKS.map(link => (
          <button
            key={link.name}
            onClick={() => openUrl(link.url)}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex-shrink-0 ${link.colorClass}`}
          >
            {link.logo}
            <span>{link.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
