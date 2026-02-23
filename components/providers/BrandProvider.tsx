'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface BrandSettings {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  emoji: string | null;
  iconType: 'logo' | 'emoji' | 'upload';
  showTitle: boolean;
  onboarded: boolean;
}

interface BrandContextType {
  brand: BrandSettings | null;
  loading: boolean;
}

const BrandContext = createContext<BrandContextType>({
  brand: null,
  loading: true,
});

export function useBrand(): BrandContextType {
  return useContext(BrandContext);
}

const DEFAULT_BRAND: BrandSettings = {
  appName: 'University Knowledge Base',
  primaryColor: '#3b82f6',
  secondaryColor: '#1e40af',
  logoUrl: null,
  emoji: '🎓',
  iconType: 'emoji',
  showTitle: true,
  onboarded: false,
};

function hexToApproxOklch(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let c = 0;

  if (max !== min) {
    const d = max - min;
    c = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  const oklchL = l * 0.6 + 0.4;
  const oklchC = c * 0.25;
  const oklchH = h * 360;

  return `oklch(${oklchL.toFixed(3)} ${oklchC.toFixed(3)} ${oklchH.toFixed(1)})`;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBrand() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const brandSettings: BrandSettings = {
            appName: data.appName || DEFAULT_BRAND.appName,
            primaryColor: data.brandPrimary || DEFAULT_BRAND.primaryColor,
            secondaryColor: data.brandSecondary || DEFAULT_BRAND.secondaryColor,
            logoUrl: data.brandLogoUrl || null,
            emoji: data.emoji || null,
            iconType: data.iconType || 'emoji',
            showTitle: data.showTitle !== false,
            onboarded: data.onboarded ?? false,
          };
          setBrand(brandSettings);
          applyBrandColors(brandSettings);
        } else {
          setBrand(DEFAULT_BRAND);
        }
      } catch {
        setBrand(DEFAULT_BRAND);
      } finally {
        setLoading(false);
      }
    }

    fetchBrand();
  }, []);

  return (
    <BrandContext.Provider value={{ brand, loading }}>
      {children}
    </BrandContext.Provider>
  );
}

function applyBrandColors(brand: BrandSettings): void {
  const root = document.documentElement;
  const primaryOkLCH = hexToApproxOklch(brand.primaryColor);
  const secondaryOkLCH = hexToApproxOklch(brand.secondaryColor);

  root.style.setProperty('--primary', primaryOkLCH);
  root.style.setProperty('--secondary', secondaryOkLCH);
  root.style.setProperty('--accent', primaryOkLCH);
  root.style.setProperty('--accent-glow', primaryOkLCH);
  root.style.setProperty('--sidebar-primary', primaryOkLCH);

  const lighterPrimary = primaryOkLCH.replace(/oklch\((\d+\.\d+)/, (_, l) => {
    const newL = Math.min(0.98, parseFloat(l) + 0.3);
    return `oklch(${newL.toFixed(3)}`;
  });
  root.style.setProperty('--accent-light', lighterPrimary);
}
