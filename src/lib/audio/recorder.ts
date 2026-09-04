"use client";

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4", "audio/ogg;codecs=opus", "audio/aac",
  ];
  for (const candidate of candidates) {
    try { if (MediaRecorder.isTypeSupported(candidate)) return candidate; } catch {}
  }
  return "";
}

export interface RecordingResult { blob: Blob; mimeType: string; duration: number }

export class SegmentRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private endedAt = 0;
  private stopping = false;
  mimeType = "";

  get recording() { return !!this.recorder && this.recorder.state === "recording"; }
  get paused() { return !!this.recorder && this.recorder.state === "paused"; }
  get elapsed() {
    if (!this.startedAt) return 0;
    const end = this.recording || this.paused ? Date.now() : this.endedAt || Date.now();
    return Math.max(0, (end - this.startedAt) / 1000);
  }

  start(stream: MediaStream): boolean {
    if (this.recorder) return false;
    try {
      this.mimeType = pickMimeType();
      const options: MediaRecorderOptions = this.mimeType
        ? { mimeType: this.mimeType, audioBitsPerSecond: 64000 }
        : {};
      this.recorder = new MediaRecorder(stream, options);
      this.chunks = [];
      this.stopping = false;
      this.recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => { this.recorder = null; };
      this.startedAt = Date.now();
      this.recorder.start(1000);
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  pause() { try { if (this.recorder?.state === "recording") this.recorder.pause(); } catch {} }
  resume() { try { if (this.recorder?.state === "paused") this.recorder.resume(); } catch {} }

  async stop(): Promise<RecordingResult | null> {
    const recorder = this.recorder;
    if (!recorder || this.stopping) return null;
    this.stopping = true;
    this.endedAt = Date.now();
    return new Promise((resolve) => {
      const finish = () => {
        try {
          const type = this.chunks[0]?.type || this.mimeType || "audio/webm";
          const blob = new Blob(this.chunks, { type });
          const duration = Math.max(0, (this.endedAt - this.startedAt) / 1000);
          this.recorder = null;
          this.stopping = false;
          resolve({ blob, mimeType: type, duration });
        } catch {
          this.recorder = null;
          this.stopping = false;
          resolve(null);
        }
      };
      recorder.onstop = finish;
      try { recorder.state !== "inactive" ? recorder.stop() : finish(); } catch { finish(); }
    });
  }

  abort() {
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.onstop = null;
        this.recorder.stop();
      }
    } catch {}
    this.recorder = null;
    this.stopping = false;
  }
}

export class MasterRecorder {
  private rec: SegmentRecorder | null = null;
  private clockStart = 0;
  private pausedTotal = 0;
  private pauseStartedAt = 0;

  async start(stream: MediaStream) {
    this.rec = new SegmentRecorder();
    const ok = this.rec.start(stream);
    if (ok) {
      this.clockStart = Date.now();
      this.pausedTotal = 0;
      this.pauseStartedAt = 0;
    }
    return ok;
  }
  pause() {
    this.rec?.pause();
    if (!this.pauseStartedAt) this.pauseStartedAt = Date.now();
  }
  resume() {
    if (this.pauseStartedAt) {
      this.pausedTotal += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.rec?.resume();
  }
  get running() { return !!this.rec && (this.rec.recording || this.rec.paused); }
  now() {
    if (!this.clockStart) return 0;
    const now = this.pauseStartedAt || Date.now();
    return Math.max(0, (now - this.clockStart - this.pausedTotal) / 1000);
  }
  async stop() {
    if (this.pauseStartedAt) {
      this.pausedTotal += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    const result = await this.rec?.stop();
    this.rec = null;
    this.clockStart = 0;
    return result || null;
  }
  abort() {
    this.rec?.abort();
    this.rec = null;
    this.clockStart = 0;
  }
}
