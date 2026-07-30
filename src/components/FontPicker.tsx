/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';

interface FontPickerProps {
  currentFont: string;
  onSelectFont: (fontName: string) => void;
}

interface FontItem {
  name: string;
  category: 'Display / Bold' | 'Script & Cursive' | 'Street / Marker' | 'Clean & Modern';
  isCustom?: boolean;
}

// HEAVY-HITTING CURATED LIST FOR VINYL & APPAREL
const FAVORITE_FONTS: FontItem[] = [
  // --- BOLD & DISPLAY (Ideal for Hoodies, Chest Prints & Big Decals) ---
  { name: 'Bebas Neue', category: 'Display / Bold' },
  { name: 'Impact', category: 'Display / Bold' },
  { name: 'Anton', category: 'Display / Bold' },
  { name: 'Oswald', category: 'Display / Bold' },
  { name: 'Montserrat', category: 'Display / Bold' },
  { name: 'Black Ops One', category: 'Display / Bold' },
  { name: 'Bungee', category: 'Display / Bold' },
  { name: 'Luckiest Guy', category: 'Display / Bold' },
  { name: 'Alfa Slab One', category: 'Display / Bold' },
  { name: 'Titan One', category: 'Display / Bold' },
  { name: 'Righteous', category: 'Display / Bold' },

  // --- SCRIPT & CURSIVE (Top Sellers for Custom Names & Boat/Car Decals) ---
  { name: 'Pacifico', category: 'Script & Cursive' },
  { name: 'Lobster', category: 'Script & Cursive' },
  { name: 'Dancing Script', category: 'Script & Cursive' },
  { name: 'Great Vibes', category: 'Script & Cursive' },
  { name: 'Caveat', category: 'Script & Cursive' },
  { name: 'Satisfy', category: 'Script & Cursive' },
  { name: 'Sacramento', category: 'Script & Cursive' },
  { name: 'Cookie', category: 'Script & Cursive' },

  // --- STREET & MARKER (Edgy, Streetwear & Club Apparel) ---
  { name: 'Permanent Marker', category: 'Street / Marker' },
  { name: 'Creepster', category: 'Street / Marker' },
  { name: 'Monoton', category: 'Street / Marker' },

  // --- CLEAN & MODERN (Sleek Branding, Taglines & Sub-Text) ---
  { name: 'Poppins', category: 'Clean & Modern' },
  { name: 'Roboto', category: 'Clean & Modern' },
  { name: 'Open Sans', category: 'Clean & Modern' },
  { name: 'Playfair Display', category: 'Clean & Modern' },
  { name: 'Cinzel', category: 'Clean & Modern' },
  { name: 'Abril Fatface', category: 'Clean & Modern' },
  { name: 'Arial', category: 'Clean & Modern' }
];

export function FontPicker({ currentFont, onSelectFont }: FontPickerProps) {
  const [fonts, setFonts] = useState<FontItem[]>(FAVORITE_FONTS);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // DYNAMIC GOOGLE FONTS LOADER
  // Automatically loads web fonts so preview styling displays live in the dropdown
  useEffect(() => {
    const googleFontNames = FAVORITE_FONTS
      .filter(f => f.name !== 'Impact' && f.name !== 'Arial')
      .map(f => f.name.replace(/\s+/g, '+'))
      .join('&family=');

    const linkId = 'west-vinyl-google-fonts';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${googleFontNames}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  // Close dropdown if user clicks outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // CUSTOM FONT UPLOADER ENGINE (.TTF, .OTF, .WOFF)
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fontName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s]/g, '');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadedFont = new FontFace(fontName, arrayBuffer);
      const readyFont = await loadedFont.load();
      
      document.fonts.add(readyFont);

      setFonts((prev) => {
        if (prev.some((f) => f.name === fontName)) return prev;
        return [{ name: fontName, category: 'Clean & Modern', isCustom: true }, ...prev];
      });

      onSelectFont(fontName);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to load custom font:', err);
      alert('Could not process this font file. Please upload a valid .TTF, .OTF, or .WOFF file.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredFonts = fonts.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    f.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full select-none" ref={dropdownRef}>
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
        Typography & Font
      </label>

      {/* Main Font Trigger Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-3 flex items-center justify-between text-white transition-colors shadow-inner"
        >
          <span className="truncate text-lg" style={{ fontFamily: currentFont }}>
            {currentFont || 'Select Font'}
          </span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          onChange={handleFontUpload}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Custom Font (.TTF, .OTF)"
          className="px-3 bg-slate-800 hover:bg-[#FF1493] border border-slate-700 hover:border-[#FF1493] rounded-xl text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      {/* Visual Font List Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#181a25] border border-slate-700 rounded-xl shadow-2xl z-50 max-h-80 flex flex-col overflow-hidden">
          
          {/* Top Search & Action Bar */}
          <div className="p-2 border-b border-slate-800 bg-slate-900/60 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Font Library ({fonts.length})</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[#FF1493] hover:underline flex items-center gap-1"
              >
                + Upload .TTF / .OTF
              </button>
            </div>
            
            <input 
              type="text" 
              placeholder="Search fonts..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[#FF1493]"
            />
          </div>

          {/* Scrollable Font Options */}
          <div className="flex-1 overflow-y-auto p-1 space-y-1 custom-scrollbar">
            {filteredFonts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">No fonts match your search</div>
            ) : (
              filteredFonts.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    onSelectFont(f.name);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center justify-between group ${
                    currentFont === f.name
                      ? 'bg-[#FF1493]/20 text-[#FF1493] font-bold border border-[#FF1493]/40'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  }`}
                >
                  <span className="text-xl truncate" style={{ fontFamily: f.name }}>
                    {f.name}
                  </span>
                  
                  {f.isCustom ? (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                      CUSTOM
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-500 uppercase font-mono group-hover:text-slate-400 transition-colors shrink-0">
                      {f.category.split(' ')[0]}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}