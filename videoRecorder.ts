export interface ExportProgress {
  currentSlide: number;
  totalSlides: number;
  percentage: number;
  status: 'initializing' | 'recording' | 'encoding' | 'completed' | 'error';
  errorMessage?: string;
  downloadUrl?: string;
}

export class VideoExportManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private selectedMime: string = 'video/webm';

  public getMimeType(): string {
    return this.selectedMime;
  }

  public startRecording(
    canvas: HTMLCanvasElement,
    audioStream?: MediaStream | null,
    fps: number = 30
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const canvasStream = canvas.captureStream(fps);
        const combinedStream = new MediaStream();

        // Add video tracks
        const videoTracks = canvasStream.getVideoTracks();
        if (videoTracks.length === 0) {
          return reject(new Error('No se pudo capturar el flujo de video del lienzo Canvas'));
        }
        videoTracks.forEach(track => combinedStream.addTrack(track));

        const hasAudio = !!(audioStream && audioStream.getAudioTracks().length > 0);

        // Add audio tracks if available
        if (hasAudio && audioStream) {
          audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        }

        // Prioritize MP4 if supported for universal seekability in Windows Media Player & QuickTime,
        // with robust WebM (VP9/VP8) fallback
        const candidateMimes = hasAudio
          ? [
              'video/mp4;codecs=avc1,mp4a.40.2',
              'video/mp4',
              'video/webm;codecs=vp9,opus',
              'video/webm;codecs=vp8,opus',
              'video/webm',
            ]
          : [
              'video/mp4;codecs=avc1',
              'video/mp4',
              'video/webm;codecs=vp9',
              'video/webm;codecs=vp8',
              'video/webm',
            ];

        this.selectedMime = 'video/webm';
        for (const mime of candidateMimes) {
          if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
            this.selectedMime = mime;
            break;
          }
        }

        this.recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType: this.selectedMime,
          videoBitsPerSecond: 4000000,
        });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onerror = (event: any) => {
          console.error('MediaRecorder error:', event);
        };

        this.mediaRecorder.start(200); // Flush chunks every 200ms
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  public stopRecording(_durationMs?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('MediaRecorder no fue iniciado'));
      }

      const recorder = this.mediaRecorder;

      recorder.onstop = () => {
        try {
          const finalMime = recorder.mimeType || this.selectedMime || 'video/webm';
          const rawBlob = new Blob(this.recordedChunks, { type: finalMime });
          resolve(rawBlob);
        } catch (err) {
          reject(err);
        }
      };

      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch (e) {
          // ignore
        }
        recorder.stop();
      } else {
        const finalMime = recorder.mimeType || this.selectedMime || 'video/webm';
        resolve(new Blob(this.recordedChunks, { type: finalMime }));
      }
    });
  }
}

export const videoExporter = new VideoExportManager();
