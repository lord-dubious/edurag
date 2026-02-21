import { tavily } from '@tavily/core';
import { env } from './env';

interface ColorSwatch {
  hex: string;
  name: string;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function parseColor(colorStr: string): string | null {
  const hexMatch = colorStr.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return '#' + hex.split('').map(c => c + c).join('');
    }
    return '#' + hex.toLowerCase();
  }
  
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  
  const rgbaMatch = colorStr.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbaMatch) {
    return rgbToHex(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]));
  }
  
  return null;
}

export function getColorName(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  const saturation = max === min ? 0 : (max - min) / (lightness > 0.5 ? 510 - max - min : max + min);
  
  if (lightness > 0.9) return 'White';
  if (lightness < 0.1) return 'Black';
  if (saturation < 0.1) return 'Gray';
  
  const hue = rgbToHue(r, g, b);
  
  if (hue < 15 || hue >= 345) return 'Red';
  if (hue < 45) return 'Orange';
  if (hue < 75) return 'Yellow';
  if (hue < 165) return 'Green';
  if (hue < 195) return 'Cyan';
  if (hue < 255) return 'Blue';
  if (hue < 285) return 'Purple';
  if (hue < 345) return 'Pink';
  
  return 'Gray';
}

export function rgbToHue(r: number, g: number, b: number): number {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  
  if (d === 0) return 0;
  
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  
  return Math.round(h * 360);
}

export function extractColorsFromCss(css: string): Set<string> {
  const colors = new Set<string>();
  
  const cssVarPatterns = [
    /--[\w-]*(?:color|brand|primary|accent|secondary|theme)[\w-]*:\s*([^;]+)/gi,
    /--[\w-]*(?:green|blue|red|orange|purple|yellow|teal)[\w-]*:\s*([^;]+)/gi,
  ];
  
  for (const pattern of cssVarPatterns) {
    const matches = css.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].trim();
      const color = parseColor(value);
      if (color) colors.add(color);
    }
  }
  
  const allColors = css.match(/#[0-9a-fA-F]{3,8}\b|rgb\s*\([^)]+\)|rgba\s*\([^)]+\)/gi) || [];
  for (const c of allColors) {
    const color = parseColor(c);
    if (color) colors.add(color);
  }
  
  return colors;
}

export function extractColorsFromHtml(html: string): Set<string> {
  const colors = new Set<string>();
  
  const styleMatches = html.matchAll(/style\s*=\s*["']([^"']+)["']/gi);
  for (const match of styleMatches) {
    const styleContent = match[1];
    const styleColors = styleContent.match(/#[0-9a-fA-F]{3,8}\b|rgb\s*\([^)]+\)|rgba\s*\([^)]+\)/gi) || [];
    for (const c of styleColors) {
      const color = parseColor(c);
      if (color) colors.add(color);
    }
  }
  
  const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  for (const style of styleTags) {
    const cssColors = extractColorsFromCss(style);
    cssColors.forEach(c => colors.add(c));
  }
  
  return colors;
}

export function isColorUsable(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / (lightness > 0.5 ? 2 - 2 * lightness : 2 * lightness) || 0;
  
  return lightness > 0.1 && lightness < 0.9 && saturation > 0.1;
}

const DEFAULT_COLORS: ColorSwatch[] = [
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#1e40af', name: 'Blue' },
  { hex: '#3b82f6', name: 'Blue' },
];

export function extractLogoFromHtml(html: string, baseUrl: string): string | null {
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImage) {
    return ogImage[1].startsWith('http') ? ogImage[1] : new URL(ogImage[1], baseUrl).href;
  }
  
  const logoImg = html.match(/<img[^>]*(?:alt|class|id|src)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i);
  if (logoImg) {
    return logoImg[1].startsWith('http') ? logoImg[1] : new URL(logoImg[1], baseUrl).href;
  }
  
  const logoImg2 = html.match(/<img[^>]*src=["']([^"']*(?:logo|brand)[^"']*)["']/i);
  if (logoImg2) {
    return logoImg2[1].startsWith('http') ? logoImg2[1] : new URL(logoImg2[1], baseUrl).href;
  }
  
  const favicon = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i);
  if (favicon) {
    return favicon[1].startsWith('http') ? favicon[1] : new URL(favicon[1], baseUrl).href;
  }
  
  return null;
}

export async function detectBrand(url: string, onProgress?: (status: string) => void): Promise<{
  colors: ColorSwatch[];
  logoUrl: string | null;
  title: string | null;
}> {
  try {
    onProgress?.('connecting');
    const client = tavily({ apiKey: env.TAVILY_API_KEY });
    
    onProgress?.('extracting');
    const result = await client.extract([url], {
      extractDepth: 'basic',
      includeImages: true,
    });
    
    const results = result.results || [];
    const firstResult = results[0];
    
    if (!firstResult) {
      return { colors: DEFAULT_COLORS, logoUrl: null, title: null };
    }
    
    const rawContent = firstResult.rawContent || '';
    const title = firstResult.title || null;
    
    const colors = extractColorsFromHtml(rawContent);
    const usableColors = Array.from(colors).filter(isColorUsable);
    
    const uniqueColors = [...new Set(usableColors)].slice(0, 12);
    
    const swatches: ColorSwatch[] = uniqueColors.length > 0 
      ? uniqueColors.map(hex => ({
          hex,
          name: getColorName(hex),
        }))
      : DEFAULT_COLORS;
    
    const images = firstResult.images || [];
    const logoUrl = images.find(img => 
      img.toLowerCase().includes('logo') || 
      img.toLowerCase().includes('brand')
    ) || images[0] || null;
    
    return {
      colors: swatches,
      logoUrl,
      title,
    };
  } catch (error) {
    console.error('Brand detection error:', error);
    return { colors: DEFAULT_COLORS, logoUrl: null, title: null };
  }
}
