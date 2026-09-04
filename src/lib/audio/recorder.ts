"use client";

/**
 * MediaRecorder wrapper with cross-browser format detection.
 * Never assumes webm/opus — Safari gets mp4/AAC when that's what it supports.
 */

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/aac",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* keep trying */
    }
  }
  return "";
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  duration: number;
}

export class SegmentRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private endedAt = 0;
  private stopping = false;
  mimeType = "";

  get recording(): boolean {
    return !!this.recorder && this.recorder.state === "recording";
  }

  get paused(): boolean {
    return !!this.recorder && this.recorder.state === "paused";
  }

  get elapsed(): number {
    if (!this.startedAt) return 0;
    const end = this.recording || this.paused ? Date.now() : this.endedAt || Date.now();
    return Math.max(0, (end - this.startedAt) / 1000);
  }

  start(stream: MediaStream): boolean {
    if (this.recorder) return false;
    try {
      this.mimeType = pickMimeType();
      // 48 kbps is clear for speech and keeps a 20-minute mock near 7.2 MB,
      // safely below the 10 MB upload ceiling even with container overhead.
      const opts: MediaRecorderOptions = this.mimeType
        ? { mimeType: this.mimeType, audioBitsPerSecond: 48000 }
        : {};
      this.recorder = new MediaRecorder(stream, opts);
      this.chunks = [];
      this.stopping = false;
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onerror = () => {
        this.recorder = null;
      };
      this.startedAt = Date.now();
      this.recorder.start(1000);
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  pause() {
    try {
      if (this.recorder?.state === "recording") this.recorder.pause();
    } catch {
      /* ignore */
    }
  }

  resume() {
    try {
      if (this.recorder?.state === "paused") this.recorder.resume();
    } catch {
      /* ignore */
    }
  }

  async stop(): Promise<RecordingResult | null> {
    const rec = this.recorder;
    if (!rec) return null;
    if (this.stopping) return null;
    this.stopping = true;
    this.endedAt = Date.now();
    return new Promise((resolve) => {
      const finish = () => {
        try {
          const type = this.chunks.length ? this.chunks[0].type || this.mimeType : this.mimeType;
          const blob = new Blob(this.chunks, { type: type || "audio/webm" });
          const duration = Math.max(0, (this.endedAt - this.startedAt) / 1000);
          this.recorder = null;
          this.stopping = false;
          resolve({ blob, mimeType: type || "audio/webm", duration });
        } catch {
          this.recorder = null;
          this.stopping = false;
          resolve(null);
        }
      };
      rec.onstop = finish;
      try {
        if (rec.state !== "inactive") rec.stop();
        else finish();
      } catch {
        finish();
      }
    });
  }

  abort() {
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.onstop = null;
        this.recorder.stop();
      }
    } catch {
      /* ignore */
    }
    this.recorder = null;
    this.stopping = false;
  }
}

/**
 * Master recorder for the Full Mock: one continuous recording for the whole
 * session. Segment boundaries are tracked as wall-clock offsets so the
 * timeline can seek the master recording to any question.
 */
export class MasterRecorder {
  private rec: SegmentRecorder | null = null;
  private clockStart = 0;
  private pausedTotal = 0;
  private pauseStartedAt = 0;

  async start(stream: MediaStream): Promise<boolean> {
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
    if (this.pauseStartedAt === 0) this.pauseStartedAt = Date.now();
  }

  resume() {
    if (this.pauseStartedAt > 0) {
      this.pausedTotal += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.rec?.resume();
  }

  get running(): boolean {
    return !!this.rec && (this.rec.recording || this.rec.paused);
  }

  /** current position inside the master recording, in seconds */
  now(): number {
    if (!this.clockStart) return 0;
    const now = this.pauseStartedAt > 0 ? this.pauseStartedAt : Date.now();
    return Math.max(0, (now - this.clockStart - this.pausedTotal) / 1000);
  }

  async stop(): Promise<RecordingResult | null> {
    if (this.pauseStartedAt > 0) {
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
