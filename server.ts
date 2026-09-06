import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy Gemini API Client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Image Proxy to prevent Canvas CORS tainting during video recording/export
app.get('/api/proxy/image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image from source' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Error proxying image:', err);
    res.status(500).json({ error: 'Internal error proxying image' });
  }
});

// Helper to wrap Linear PCM 16-bit into a playable standard WAV audio buffer
function pcmToWav(pcmBase64: string, sampleRate = 24000, numChannels = 1): Buffer {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// In-memory TTS audio cache
const ttsCache = new Map<string, Buffer>();

// Text-to-Speech endpoint powered by Gemini 3.1 Flash TTS
app.post('/api/ai/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Aoede' } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    const trimmed = text.trim();
    const cacheKey = `${voiceName}:${trimmed}`;
    if (ttsCache.has(cacheKey)) {
      const cached = ttsCache.get(cacheKey)!;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached);
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: trimmed,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const base64Data = part?.inlineData?.data;
    if (!base64Data) {
      throw new Error('No audio data received from Gemini TTS');
    }

    const wavBuffer = pcmToWav(base64Data, 24000, 1);
    ttsCache.set(cacheKey, wavBuffer);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(wavBuffer);
  } catch (error: any) {
    console.error('Error generating TTS:', error);
    const isQuota = error.status === 429 || error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota');
    res.status(isQuota ? 429 : 500).json({
      error: isQuota ? 'QUOTA_EXCEEDED' : (error.message || 'Error generating TTS audio'),
      fallbackToBrowser: true,
    });
  }
});

// Image Proxy Endpoint for secure, CORS-compliant rendering of Google Slides images
app.get('/api/proxy/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('Image URL is required');
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch remote image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err: any) {
    console.error('Error proxying image:', err);
    res.status(500).send('Error proxying image');
  }
});

// AI Director Endpoint: analyzes presentation structure & crafts autonomous cinematic pacing, narration, and cues
app.post('/api/ai/director', async (req, res) => {
  try {
    const { presentationTitle, slides, style = 'cinematic' } = req.body;

    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ error: 'Missing or invalid slides array' });
    }

    const ai = getGeminiClient();

    const prompt = `Eres un Director de Cine y Productor Audiovisual experto en convertir diapositivas estáticas en videos dinámicos y atractivos.
Analiza la siguiente presentación titulada "${presentationTitle || 'Presentación'}" con estilo "${style}".

Diapositivas recibidas:
${JSON.stringify(
  slides.map((s: any, idx: number) => ({
    slideIndex: idx,
    title: s.title,
    subtitle: s.subtitle,
    notes: s.notes,
    textElements: s.elements?.filter((e: any) => e.type !== 'IMAGE').map((e: any) => e.content),
    hasImage: s.elements?.some((e: any) => e.type === 'IMAGE'),
  })),
  null,
  2
)}

Para CADA diapositiva, genera un plan autónomo con:
1. "narrationScript": Un guión de voz en off natural, conciso y fluido en español (1-2 oraciones cortas que expliquen la idea principal con impacto).
2. "pacingSeconds": Duración óptima recomendada (entre 5.0 y 9.0 segundos).
3. "cameraMove": Una de estas opciones: "ken-burns-zoom", "pan-horizontal", "pan-vertical", "subtle-pulse".
4. "transitionOut": Una de estas transiciones: "crossfade", "slide-left", "zoom-through", "blur-dissolve".
5. "keyHighlightWords": Lista de 1 a 3 palabras clave para destacar visualmente con tipografía cinética.

Responde ÚNICAMENTE en formato JSON con la siguiente estructura:
{
  "summary": "Breve análisis de la narrativa global",
  "recommendedMusicTheme": "ambient" | "tech" | "cinematic" | "acoustic",
  "slidePlans": [
    {
      "slideIndex": 0,
      "narrationScript": "...",
      "pacingSeconds": 6.5,
      "cameraMove": "ken-burns-zoom",
      "transitionOut": "zoom-through",
      "keyHighlightWords": ["Palabra1", "Palabra2"]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const responseText = response.text || '{}';
    const parsed = JSON.parse(responseText);
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error in /api/ai/director:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error processing AI director plan',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !__filename.endsWith('.mjs')) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
