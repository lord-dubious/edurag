import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rgbToHex,
  parseColor,
  getColorName,
  rgbToHue,
  extractColorsFromCss,
  extractColorsFromHtml,
  isColorUsable,
  detectBrand,
} from '@/lib/brand-detection';

const mockExtract = vi.fn();

vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({
    extract: mockExtract,
  })),
}));

describe('rgbToHex', () => {
  it('converts RGB values to hex color', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('handles mixed RGB values', () => {
    expect(rgbToHex(30, 64, 124)).toBe('#1e407c');
    expect(rgbToHex(128, 128, 128)).toBe('#808080');
  });
});

describe('parseColor', () => {
  it('parses hex colors', () => {
    expect(parseColor('#ff0000')).toBe('#ff0000');
    expect(parseColor('#FF0000')).toBe('#ff0000');
    expect(parseColor('#f00')).toBe('#ff0000');
  });

  it('parses rgb() format', () => {
    expect(parseColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(parseColor('rgb(30, 64, 124)')).toBe('#1e407c');
    expect(parseColor('rgb(30,64,124)')).toBe('#1e407c');
  });

  it('parses rgba() format', () => {
    expect(parseColor('rgba(255, 0, 0, 1)')).toBe('#ff0000');
    expect(parseColor('rgba(30, 64, 124, 0.5)')).toBe('#1e407c');
  });

  it('returns null for invalid formats', () => {
    expect(parseColor('invalid')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('hsl(0, 100%, 50%)')).toBeNull();
  });
});

describe('getColorName', () => {
  it('identifies primary colors by hue', () => {
    expect(getColorName('#ff0000')).toBe('Red');
    expect(getColorName('#00ff00')).toBe('Green');
    expect(getColorName('#0000ff')).toBe('Blue');
    expect(getColorName('#ffff00')).toBe('Yellow');
    expect(getColorName('#00ffff')).toBe('Cyan');
    expect(getColorName('#ff00ff')).toBe('Pink');
  });

  it('identifies neutral colors', () => {
    expect(getColorName('#000000')).toBe('Black');
    expect(getColorName('#ffffff')).toBe('White');
    expect(getColorName('#808080')).toBe('Gray');
  });

  it('identifies colors by hue ranges', () => {
    expect(getColorName('#1e407c')).toBe('Blue');
    expect(getColorName('#ffa500')).toBe('Orange');
    expect(getColorName('#7b00ff')).toBe('Purple');
  });

  it('handles hex case insensitivity', () => {
    expect(getColorName('#FF0000')).toBe('Red');
    expect(getColorName('#FFA500')).toBe('Orange');
  });
});

describe('rgbToHue', () => {
  it('calculates hue for red', () => {
    const hue = rgbToHue(255, 0, 0);
    expect(hue).toBe(0);
  });

  it('calculates hue for green', () => {
    const hue = rgbToHue(0, 255, 0);
    expect(hue).toBe(120);
  });

  it('calculates hue for blue', () => {
    const hue = rgbToHue(0, 0, 255);
    expect(hue).toBe(240);
  });

  it('handles grayscale (no dominant color)', () => {
    const hue = rgbToHue(128, 128, 128);
    expect(hue).toBe(0);
  });
});

describe('extractColorsFromCss', () => {
  it('extracts hex colors from CSS', () => {
    const css = `
      :root {
        --primary: #1e407c;
        --secondary: #ff5733;
      }
    `;
    const colors = extractColorsFromCss(css);
    expect(colors).toContain('#1e407c');
    expect(colors).toContain('#ff5733');
  });

  it('extracts rgb colors from CSS', () => {
    const css = `
      .button {
        background-color: rgb(30, 64, 124);
      }
    `;
    const colors = extractColorsFromCss(css);
    expect(colors).toContain('#1e407c');
  });

  it('extracts brand-related CSS variables', () => {
    const css = `
      :root {
        --brand-primary: #1e407c;
        --brand-secondary: #ff5733;
        --color-accent: #00ff00;
      }
    `;
    const colors = extractColorsFromCss(css);
    expect(colors).toContain('#1e407c');
    expect(colors).toContain('#ff5733');
    expect(colors).toContain('#00ff00');
  });

  it('returns empty array for CSS without colors', () => {
    const css = `
      .container {
        padding: 10px;
        margin: 20px;
      }
    `;
    const colors = extractColorsFromCss(css);
    expect(colors).toHaveLength(0);
  });
});

describe('extractColorsFromHtml', () => {
  it('extracts colors from inline styles', () => {
    const html = `
      <div style="background-color: #1e407c; color: #ffffff;">
        Content
      </div>
    `;
    const colors = extractColorsFromHtml(html);
    expect(colors).toContain('#1e407c');
    expect(colors).toContain('#ffffff');
  });

  it('extracts colors from style tags', () => {
    const html = `
      <style>
        .primary { background: #1e407c; }
      </style>
    `;
    const colors = extractColorsFromHtml(html);
    expect(colors).toContain('#1e407c');
  });

  it('returns empty array for HTML without colors', () => {
    const html = `
      <div>
        <p>Text content</p>
      </div>
    `;
    const colors = extractColorsFromHtml(html);
    expect(colors).toHaveLength(0);
  });
});

describe('isColorUsable', () => {
  it('returns true for usable brand colors', () => {
    expect(isColorUsable('#1e407c')).toBe(true);
    expect(isColorUsable('#ff5733')).toBe(true);
    expect(isColorUsable('#0066cc')).toBe(true);
  });

  it('returns false for too dark colors', () => {
    expect(isColorUsable('#000000')).toBe(false);
    expect(isColorUsable('#111111')).toBe(false);
    expect(isColorUsable('#0a0a0a')).toBe(false);
  });

  it('returns false for too light colors', () => {
    expect(isColorUsable('#ffffff')).toBe(false);
    expect(isColorUsable('#eeeeee')).toBe(false);
    expect(isColorUsable('#fafafa')).toBe(false);
  });
});

describe('detectBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns brand info from Tavily extract', async () => {
    mockExtract.mockResolvedValueOnce({
      results: [
        {
          url: 'https://example.edu',
          rawContent: `
            <html>
              <head>
                <style>
                  :root { --brand-primary: #1e407c; }
                </style>
              </head>
              <body style="background: #ff5733;">
                <img src="logo.png" />
              </body>
            </html>
          `,
          images: ['https://example.edu/logo.png'],
          title: 'Example University',
        },
      ],
    });

    const result = await detectBrand('https://example.edu');

    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors[0]).toHaveProperty('hex');
    expect(result.colors[0]).toHaveProperty('name');
    expect(result.logoUrl).toBe('https://example.edu/logo.png');
    expect(result.title).toBe('Example University');

    expect(mockExtract).toHaveBeenCalledWith(
      ['https://example.edu'],
      { extractDepth: 'basic', includeImages: true }
    );
  });

  it('handles extraction failure gracefully', async () => {
    mockExtract.mockRejectedValueOnce(new Error('API error'));

    const result = await detectBrand('https://example.edu');

    expect(result.colors).toBeDefined();
    expect(result.colors.length).toBeGreaterThan(0);
  });

  it('returns default colors when no colors found', async () => {
    mockExtract.mockResolvedValueOnce({
      results: [
        {
          url: 'https://example.edu',
          rawContent: '<html><body>Plain text</body></html>',
          images: [],
        },
      ],
    });

    const result = await detectBrand('https://example.edu');

    expect(result.colors).toBeDefined();
    expect(result.colors.length).toBeGreaterThan(0);
  });

  it('extracts title from response', async () => {
    mockExtract.mockResolvedValueOnce({
      results: [
        {
          url: 'https://test-university.edu',
          rawContent: '<html><body></body></html>',
          images: [],
          title: 'Test University Home',
        },
      ],
    });

    const result = await detectBrand('https://test-university.edu');

    expect(result.title).toBe('Test University Home');
  });

  it('filters out unusable colors', async () => {
    mockExtract.mockResolvedValueOnce({
      results: [
        {
          url: 'https://example.edu',
          rawContent: `
            <style>
              :root {
                --black: #000000;
                --white: #ffffff;
                --brand: #1e407c;
              }
            </style>
          `,
          images: [],
        },
      ],
    });

    const result = await detectBrand('https://example.edu');

    const hexColors = result.colors.map((c: { hex: string }) => c.hex);
    expect(hexColors).not.toContain('#000000');
    expect(hexColors).not.toContain('#ffffff');
    expect(hexColors).toContain('#1e407c');
  });
});
