// Utility to dynamically load custom Google Fonts present in slide decks
const loadedFonts = new Set<string>();

const standardWebSafeFonts = new Set([
  'arial',
  'helvetica',
  'times new roman',
  'times',
  'courier new',
  'courier',
  'georgia',
  'palatino',
  'garamond',
  'bookman',
  'comic sans ms',
  'trebuchet ms',
  'arial black',
  'impact',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
]);

export function loadGoogleFontIfNeeded(fontFamily?: string) {
  if (!fontFamily) return;
  const normalized = fontFamily.trim();
  const lower = normalized.toLowerCase();

  if (standardWebSafeFonts.has(lower) || loadedFonts.has(lower)) {
    return;
  }

  loadedFonts.add(lower);

  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    const formattedFont = encodeURIComponent(normalized).replace(/%20/g, '+');
    link.href = `https://fonts.googleapis.com/css2?family=${formattedFont}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700&display=swap`;
    document.head.appendChild(link);
  } catch (err) {
    console.warn('Failed to dynamically load font:', fontFamily, err);
  }
}

export function loadPresentationFonts(presentation: { slides: Array<{ elements: Array<{ style?: { fontFamily?: string } }> }> }) {
  if (!presentation || !presentation.slides) return;
  presentation.slides.forEach((slide) => {
    slide.elements.forEach((el) => {
      if (el.style?.fontFamily) {
        loadGoogleFontIfNeeded(el.style.fontFamily);
      }
    });
  });
}
