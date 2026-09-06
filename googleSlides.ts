import { PresentationData, SlideData, SlideElement, GoogleDriveFile } from '../types';

export const extractPresentationId = (urlOrId: string): string => {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
};

export const listGoogleDrivePresentations = async (accessToken: string): Promise<GoogleDriveFile[]> => {
  try {
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.presentation' and trashed=false");
    const fields = encodeURIComponent('files(id,name,modifiedTime,thumbnailLink,iconLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=20&orderBy=modifiedTime desc`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error al obtener presentaciones de Drive (${res.status})`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (error) {
    console.error('Error listing Google Slides:', error);
    throw error;
  }
};

export const fetchGooglePresentation = async (
  presentationId: string,
  accessToken: string
): Promise<PresentationData> => {
  const cleanId = extractPresentationId(presentationId);
  const url = `https://slides.googleapis.com/v1/presentations/${cleanId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error al cargar la presentación (${res.status})`);
  }

  const rawPresentation = await res.json();
  return parseGoogleSlidesData(rawPresentation);
};

// Helper to reliably convert any Google Slides API measurement into EMU (English Metric Units)
const toEmu = (val?: { magnitude?: number; unit?: string } | number, fallbackUnit?: string): number => {
  if (val === undefined || val === null) return 0;
  const mag = typeof val === 'number' ? val : (val.magnitude ?? 0);
  const unit = typeof val === 'object' ? (val.unit || fallbackUnit) : fallbackUnit;
  if (!mag || isNaN(mag)) return 0;
  // 1 Point = 12700 EMUs
  if (unit === 'PT' || unit === 'POINT' || (mag < 50000 && unit !== 'EMU')) {
    return mag * 12700;
  }
  return mag;
};

// Recursively unpack pageElements including elementGroups
const flattenPageElements = (pageElements: any[] = []): any[] => {
  const result: any[] = [];
  for (const pe of pageElements) {
    if (pe.elementGroup && pe.elementGroup.children) {
      const groupTransform = pe.transform || {};
      const groupScaleX = typeof groupTransform.scaleX === 'number' ? groupTransform.scaleX : 1;
      const groupScaleY = typeof groupTransform.scaleY === 'number' ? groupTransform.scaleY : 1;
      const groupTranslateX = groupTransform.translateX || 0;
      const groupTranslateY = groupTransform.translateY || 0;

      for (const child of pe.elementGroup.children) {
        const childTransform = child.transform || {};
        const combinedTransform = {
          ...childTransform,
          scaleX: (typeof childTransform.scaleX === 'number' ? childTransform.scaleX : 1) * groupScaleX,
          scaleY: (typeof childTransform.scaleY === 'number' ? childTransform.scaleY : 1) * groupScaleY,
          translateX: (childTransform.translateX || 0) + groupTranslateX,
          translateY: (childTransform.translateY || 0) + groupTranslateY,
          unit: childTransform.unit || groupTransform.unit || 'EMU',
        };
        result.push({
          ...child,
          transform: combinedTransform,
        });
      }
    } else {
      result.push(pe);
    }
  }
  return result;
};

// Build theme color lookup map from Google Slides master colorScheme
const buildThemeColorMap = (raw: any): Record<string, string> => {
  const map: Record<string, string> = {
    LIGHT1: '#FFFFFF',
    LIGHT2: '#F8F9FA',
    DARK1: '#111827',
    DARK2: '#1F2937',
    BACKGROUND: '#FFFFFF',
    TEXT: '#111827',
  };

  if (raw?.masters && Array.isArray(raw.masters)) {
    for (const master of raw.masters) {
      const colors = master.pageProperties?.colorScheme?.colors;
      if (Array.isArray(colors)) {
        for (const c of colors) {
          if (c.type && c.color?.rgbColor) {
            const r = Math.round((c.color.rgbColor.red ?? 0) * 255);
            const g = Math.round((c.color.rgbColor.green ?? 0) * 255);
            const b = Math.round((c.color.rgbColor.blue ?? 0) * 255);
            map[c.type] = `rgb(${r}, ${g}, ${b})`;
          }
        }
      }
    }
  }
  return map;
};

const parseColor = (colorObj: any, defaultColor: string, themeColorMap?: Record<string, string>): string => {
  if (!colorObj) return defaultColor;
  if (colorObj.rgbColor) {
    const r = Math.round((colorObj.rgbColor.red ?? 0) * 255);
    const g = Math.round((colorObj.rgbColor.green ?? 0) * 255);
    const b = Math.round((colorObj.rgbColor.blue ?? 0) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (colorObj.themeColor) {
    if (themeColorMap && themeColorMap[colorObj.themeColor]) {
      return themeColorMap[colorObj.themeColor];
    }
    switch (colorObj.themeColor) {
      case 'LIGHT1':
      case 'BACKGROUND':
      case 'LIGHT2':
        return '#FFFFFF';
      case 'DARK1':
      case 'TEXT':
      case 'DARK2':
        return '#111827';
      case 'ACCENT1':
        return '#2563EB';
      case 'ACCENT2':
        return '#DC2626';
      case 'ACCENT3':
        return '#D97706';
      case 'ACCENT4':
        return '#16A34A';
      case 'ACCENT5':
        return '#4F46E5';
      case 'ACCENT6':
        return '#0891B2';
      default:
        return defaultColor;
    }
  }
  return defaultColor;
};

export const isLightBg = (bgColor: string): boolean => {
  if (!bgColor) return true;
  if (bgColor.startsWith('#')) {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  }
  if (bgColor.startsWith('rgb')) {
    const match = bgColor.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
    }
  }
  return true;
};

export const parseGoogleSlidesData = (raw: any): PresentationData => {
  // Extract theme colors from masters
  const themeColorMap = buildThemeColorMap(raw);

  // Determine Master Slide Dimensions in uniform EMU
  const defaultWidthEmu = 9144000; // 720pt in EMU (16:9 standard)
  const defaultHeightEmu = 5143500; // 405pt in EMU

  const pageWidthEmu = toEmu(raw.pageSize?.width) || defaultWidthEmu;
  const pageHeightEmu = toEmu(raw.pageSize?.height) || defaultHeightEmu;

  const slides: SlideData[] = (raw.slides || []).map((slide: any, index: number) => {
    let title = '';
    let subtitle = '';
    let notes = '';
    const rawElements: SlideElement[] = [];

    // Extract Speaker Notes
    if (slide.slideProperties?.notesPage?.pageElements) {
      slide.slideProperties.notesPage.pageElements.forEach((pe: any) => {
        if (pe.shape?.text?.textElements) {
          const noteText = pe.shape.text.textElements
            .map((te: any) => te.textRun?.content || '')
            .join('')
            .trim();
          if (noteText && !noteText.startsWith('Speaker Notes') && !noteText.includes(raw.title || '')) {
            notes += (notes ? ' ' : '') + noteText;
          }
        }
      });
    }

    // Slide Background - Check propertyState explicitly
    let backgroundColor = '#FFFFFF';
    const bgFill = slide.pageProperties?.pageBackgroundFill;
    if (bgFill && bgFill.propertyState !== 'NOT_RENDERED' && bgFill.solidFill?.color) {
      backgroundColor = parseColor(bgFill.solidFill.color, '#FFFFFF', themeColorMap);
    }

    const slideIsLight = isLightBg(backgroundColor);
    const defaultTextColor = slideIsLight ? '#111827' : '#FFFFFF';

    let backgroundImageUrl = undefined;
    if (slide.pageProperties?.pageBackgroundFill?.stretchedPictureFill?.contentUrl) {
      backgroundImageUrl = slide.pageProperties.pageBackgroundFill.stretchedPictureFill.contentUrl;
    }

    let textElementCount = 0;
    let imageElementCount = 0;

    const allPageElements = flattenPageElements(slide.pageElements || []);

    // Parse all page elements with precision transform calculations
    allPageElements.forEach((pe: any, peIndex: number) => {
      const emuTransform = pe.transform || {};
      const emuSize = pe.size || {};

      const scaleX = typeof emuTransform.scaleX === 'number' ? emuTransform.scaleX : 1;
      const scaleY = typeof emuTransform.scaleY === 'number' ? emuTransform.scaleY : 1;

      const rawWidthEmu = toEmu(emuSize.width, emuTransform.unit) * Math.abs(scaleX);
      const rawHeightEmu = toEmu(emuSize.height, emuTransform.unit) * Math.abs(scaleY);
      const rawXEmu = toEmu(emuTransform.translateX, emuTransform.unit);
      const rawYEmu = toEmu(emuTransform.translateY, emuTransform.unit);

      let posX = Math.max(0, Math.min(100, (rawXEmu / pageWidthEmu) * 100));
      let posY = Math.max(0, Math.min(100, (rawYEmu / pageHeightEmu) * 100));
      let width = Math.max(0.01, Math.min(100 - posX, (rawWidthEmu / pageWidthEmu) * 100));
      let height = Math.max(0.01, Math.min(100 - posY, (rawHeightEmu / pageHeightEmu) * 100));

      // Handle Image Elements
      if (pe.image) {
        imageElementCount++;
        const contentUrl = pe.image.contentUrl || pe.image.sourceUrl;
        if (contentUrl) {
          const zoomDirections: Array<'zoom-in-center' | 'zoom-out-center' | 'pan-left-to-right' | 'pan-right-to-left'> = [
            'zoom-in-center',
            'zoom-out-center',
            'pan-left-to-right',
            'pan-right-to-left',
          ];
          const zoomDir = zoomDirections[(index + imageElementCount) % zoomDirections.length];

          // Check if this image occupies the entire or majority of the slide canvas
          const isHero = width >= 70 && height >= 60;

          rawElements.push({
            id: pe.objectId || `img-${peIndex}`,
            type: 'IMAGE',
            imageUrl: contentUrl,
            position: {
              x: Math.round(posX * 10) / 10,
              y: Math.round(posY * 10) / 10,
              width: Math.round(width * 10) / 10,
              height: Math.round(height * 10) / 10,
              zIndex: isHero ? 1 : 6,
            },
            animation: {
              delay: 0.1 + imageElementCount * 0.15,
              duration: 8,
              effect: 'ken-burns',
              zoomDirection: zoomDir,
              scaleRange: [1.02, 1.18],
            },
          });
        }
      }

      // Handle Image inside Shape (e.g. rectangle with picture fill)
      const shapeImgUrl = pe.shape?.shapeProperties?.shapeBackgroundFill?.stretchedPictureFill?.contentUrl;
      if (shapeImgUrl) {
        imageElementCount++;
        const isHero = width >= 70 && height >= 60;
        rawElements.push({
          id: pe.objectId ? `img-${pe.objectId}` : `img-${peIndex}`,
          type: 'IMAGE',
          imageUrl: shapeImgUrl,
          position: {
            x: Math.round(posX * 10) / 10,
            y: Math.round(posY * 10) / 10,
            width: Math.round(width * 10) / 10,
            height: Math.round(height * 10) / 10,
            zIndex: isHero ? 1 : 6,
          },
          animation: {
            delay: 0.1 + imageElementCount * 0.15,
            duration: 8,
            effect: 'ken-burns',
            zoomDirection: 'zoom-in-center',
            scaleRange: [1.02, 1.15],
          },
        });
      }

      // Handle Shape Background and Border Outlines (Recuadros)
      let shapeBgColor: string | undefined = undefined;
      let shapeBorderColor: string | undefined = undefined;
      let shapeBorderWidth: number | undefined = undefined;
      let shapeBorderStyle: 'solid' | 'dashed' | 'dotted' | 'none' = 'solid';
      let shapeBorderRadius: number | undefined = undefined;

      if (pe.shape?.shapeProperties) {
        const sp = pe.shape.shapeProperties;
        if (sp.shapeBackgroundFill?.solidFill?.color && sp.shapeBackgroundFill.propertyState !== 'NOT_RENDERED') {
          const bgParsed = parseColor(sp.shapeBackgroundFill.solidFill.color, 'transparent', themeColorMap);
          if (bgParsed !== 'transparent') {
            shapeBgColor = bgParsed;
          }
        }
        if (sp.outline && sp.outline.propertyState !== 'NOT_RENDERED') {
          const outlineFillColor = sp.outline.outlineFill?.solidFill?.color;
          if (outlineFillColor) {
            shapeBorderColor = parseColor(outlineFillColor, defaultTextColor, themeColorMap);
            const weight = sp.outline.weight;
            if (weight && typeof weight.magnitude === 'number') {
              // Convert EMU or points to pixels (12700 EMU = 1 PT, 1 PT = ~1.33 CSS PX)
              let points = weight.magnitude;
              if (weight.unit === 'EMU' || points > 100) {
                points = points / 12700;
              }
              shapeBorderWidth = Math.max(1, Math.min(10, Math.round(points * 1.33)));
            } else {
              shapeBorderWidth = 1;
            }
            if (sp.outline.dashStyle === 'DOT') shapeBorderStyle = 'dotted';
            else if (sp.outline.dashStyle === 'DASH') shapeBorderStyle = 'dashed';
            else shapeBorderStyle = 'solid';
          }
        }
      }

      if (pe.shape?.shapeType === 'ROUNDED_RECTANGLE') {
        shapeBorderRadius = 8;
      }

      // Handle Text / Shapes
      let hasText = false;
      if (pe.shape?.text?.textElements) {
        const textElements = pe.shape.text.textElements;
        let fullText = '';
        let primaryFontSize = 18;
        let primaryFontFamily: string | undefined = undefined;
        let textColor = defaultTextColor;
        let isBold = false;
        let isItalic = false;
        let textAlign: 'left' | 'center' | 'right' | 'justify' = 'left';
        let currentBulletPrefix = '';
        let isAtLineStart = true;

        textElements.forEach((te: any) => {
          if (te.paragraphMarker) {
            if (te.paragraphMarker.style?.alignment) {
              const align = te.paragraphMarker.style.alignment;
              if (align === 'CENTER') textAlign = 'center';
              else if (align === 'END') textAlign = 'right';
              else if (align === 'JUSTIFIED') textAlign = 'justify';
              else textAlign = 'left';
            }
            if (te.paragraphMarker.bullet) {
              const glyph = te.paragraphMarker.bullet.glyph || '•';
              currentBulletPrefix = `${glyph} `;
            } else {
              currentBulletPrefix = '';
            }
          }

          if (te.textRun?.content) {
            let runText = te.textRun.content;
            if (currentBulletPrefix && isAtLineStart && runText.trim()) {
              if (!/^[*•\-–—✓✔~►▸→■□○●]|\d+[\.\)]/.test(runText.trim())) {
                runText = currentBulletPrefix + runText;
              }
              currentBulletPrefix = '';
            }

            fullText += runText;
            isAtLineStart = runText.endsWith('\n');

            if (te.textRun.style?.fontSize?.magnitude) {
              primaryFontSize = te.textRun.style.fontSize.magnitude;
            }
            if (te.textRun.style?.fontFamily) {
              primaryFontFamily = te.textRun.style.fontFamily;
            }
            if (te.textRun.style?.bold) {
              isBold = true;
            }
            if (te.textRun.style?.italic) {
              isItalic = true;
            }
            if (te.textRun.style?.foregroundColor?.opaqueColor) {
              textColor = parseColor(te.textRun.style.foregroundColor.opaqueColor, defaultTextColor, themeColorMap);
            }
          }
        });

        // Trim leading/trailing blank lines while preserving all internal newlines and double spaces
        const cleanText = fullText.replace(/^[\r\n]+|[\r\n]+$/g, '').trimEnd();
        if (cleanText) {
          hasText = true;
          textElementCount++;
          const isTitle = primaryFontSize >= 26 || (pe.shape.shapeType === 'TEXT_BOX' && textElementCount === 1 && cleanText.length < 80);
          const isSubtitle = !isTitle && (primaryFontSize >= 18 || textElementCount === 2);

          if (isTitle && !title) title = cleanText;
          else if (isSubtitle && !subtitle) subtitle = cleanText;

          const effectType = isTitle ? 'spring-reveal' : 'fade-up';

          rawElements.push({
            id: pe.objectId || `txt-${peIndex}`,
            type: isTitle ? 'TITLE' : isSubtitle ? 'SUBTITLE' : 'BODY',
            content: cleanText,
            position: {
              x: Math.round(posX * 10) / 10,
              y: Math.round(posY * 10) / 10,
              width: Math.round(width * 10) / 10,
              height: Math.round(height * 10) / 10,
              zIndex: 10,
            },
            style: {
              fontSize: primaryFontSize,
              fontFamily: primaryFontFamily,
              fontWeight: isBold ? 700 : (isTitle ? 700 : 400),
              fontStyle: isItalic ? 'italic' : 'normal',
              color: textColor,
              backgroundColor: shapeBgColor,
              borderColor: shapeBorderColor,
              borderWidth: shapeBorderWidth,
              borderStyle: shapeBorderStyle,
              borderRadius: shapeBorderRadius,
              padding: (shapeBgColor || shapeBorderColor) ? 8 : 0,
              textAlign: textAlign,
            },
            animation: {
              delay: 0.15 + textElementCount * 0.15,
              duration: 0.7,
              effect: effectType,
            },
          });
        }
      }

      // Handle standalone shapes (frames, cards, recuadros without text)
      if (pe.shape && !hasText && (shapeBgColor || shapeBorderColor)) {
        rawElements.push({
          id: pe.objectId || `shp-${peIndex}`,
          type: 'SHAPE',
          position: {
            x: Math.round(posX * 10) / 10,
            y: Math.round(posY * 10) / 10,
            width: Math.round(width * 10) / 10,
            height: Math.round(height * 10) / 10,
            zIndex: 3,
          },
          style: {
            backgroundColor: shapeBgColor,
            borderColor: shapeBorderColor,
            borderWidth: shapeBorderWidth,
            borderStyle: shapeBorderStyle,
            borderRadius: shapeBorderRadius,
          },
          animation: {
            delay: 0.1,
            duration: 0.5,
            effect: 'fade-up',
          },
        });
      }
    });

    // Maintain strict 1:1 fidelity to original Google Slides layout
    const elements: SlideElement[] = rawElements;

    // Auto-calculate autonomous duration based on text reading speed
    const totalWords = (title + ' ' + subtitle + ' ' + elements.map(e => e.content || '').join(' '))
      .split(/\s+/)
      .filter(Boolean).length;
    
    // Base 4.5s for visuals + 0.35s per word for natural reading intake
    const computedDuration = Math.max(5.5, Math.min(14, 4.5 + totalWords * 0.35));

    const cameraMoves: Array<'ken-burns-zoom' | 'pan-horizontal' | 'pan-vertical' | 'subtle-pulse'> = [
      'ken-burns-zoom',
      'pan-horizontal',
      'subtle-pulse',
      'pan-vertical',
    ];
    const transitions: Array<'crossfade' | 'slide-left' | 'zoom-through' | 'blur-dissolve'> = [
      'crossfade',
      'slide-left',
      'zoom-through',
      'blur-dissolve',
    ];

    // Narration fallback: notes, or comprehensive slide narration from title + all content
    const allSlideText = [title, subtitle, ...elements.map((e) => e.content)]
      .filter(Boolean)
      .map((txt) => txt!.trim())
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join('\n');

    const narrationScript = (notes && notes.trim().length > 0)
      ? notes.trim()
      : (allSlideText.trim() || title || `Diapositiva ${index + 1}`);

    return {
      id: slide.objectId || `slide-${index}`,
      index: index,
      title: title || `Diapositiva ${index + 1}`,
      subtitle: subtitle,
      notes: notes,
      duration: Math.round(computedDuration * 10) / 10,
      backgroundColor: backgroundColor,
      backgroundImageUrl: backgroundImageUrl,
      elements: elements,
      narrationScript: narrationScript,
      directorCue: {
        cameraMove: cameraMoves[index % cameraMoves.length],
        pacingTone: 'cinematic',
        transitionOut: transitions[index % transitions.length],
        accentColor: '#A855F7',
        keyHighlightWords: title ? title.split(' ').slice(0, 3) : [],
      },
    };
  });

  const totalDuration = slides.reduce((acc, s) => acc + s.duration, 0);

  return {
    id: raw.presentationId || 'presentation-loaded',
    title: raw.title || 'Presentación sin título',
    slideWidth: pageWidthEmu,
    slideHeight: pageHeightEmu,
    slides: slides,
    totalDuration: Math.round(totalDuration * 10) / 10,
  };
};

