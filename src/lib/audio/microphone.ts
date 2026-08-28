"use client";

/**
 * Microphone manager — the reliability core of IELTStar.
 *
 * Rules honoured here:
 * - getUserMedia is ONLY called from an explicit user gesture (never on load).
 * - Secure context / API support is detected and explained, never assumed.
 * - One persistent stream is reused; tracks are only stopped when the user
 *   fully exits recording mode.
 * - AudioContext is created/resumed during the user gesture (mobile Safari).
 * - Permission states (unknown/requesting/granted/denied/blocked/unavailable/
 *   insecure/unsupported/error/recovering) each get friendly guidance.
 */

export type MicStatus =
  | "unknown"
  | "unsupported"
  | "insecure"
  | "requesting"
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable"
  | "error"
  | "recovering";

export interface SupportCheck {
  ok: boolean;
  reason?: "insecure" | "unsupported" | "no-media-devices" | "no-recorder" | "server";
  message?: string;
}

type Listener = (status: MicStatus, detail: string) => void;

class MicManager {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private listeners = new Set<Listener>();
  private _status: MicStatus = "unknown";
  private _detail = "";

  get status() {
    return this._status;
  }
  get detail() {
    return this._detail;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this._status, this._detail);
    return () => { this.listeners.delete(fn); };
  }

  private set(status: MicStatus, detail = "") {
    this._status = status;
    this._detail = detail;
    for (const fn of this.listeners) fn(status, detail);
  }

  checkSupport(): SupportCheck {
    if (typeof window === "undefined") return { ok: false, reason: "server" };
    if (!window.isSecureContext)
      return {
        ok: false,
        reason: "insecure",
        message:
          "Microphone access requires a secure connection. Open IELTStar using HTTPS or a supported localhost environment.",
      };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return {
        ok: false,
        reason: "unsupported",
        message: "This browser does not support microphone capture.",
      };
    if (typeof MediaRecorder === "undefined")
      return {
        ok: false,
        reason: "no-recorder",
        message: "This browser cannot record audio (MediaRecorder unavailable).",
      };
    return { ok: true };
  }

  hasLiveStream(): boolean {
    return (
      !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === "live")
    );
  }

  /** Reuse the live stream when possible; caller must handle null. */
  getLiveStream(): MediaStream | null {
    if (this.hasLiveStream()) return this.stream;
    return null;
  }

  /** Must be invoked from a user gesture (click/tap). */
  async request(): Promise<MediaStream | null> {
    const support = this.checkSupport();
    if (!support.ok) {
      this.set(
        support.reason === "insecure"
          ? "insecure"
          : support.reason === "unsupported" || support.reason === "no-media-devices"
            ? "unsupported"
            : "unsupported",
        support.message || ""
      );
      return null;
    }
    if (this.hasLiveStream()) {
      this.set("granted");
      return this.stream;
    }
    this.set("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.attach(stream);
      this.set("granted");
      return stream;
    } catch (err) {
      const name = err instanceof Error ? err.name : String(err);
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
        // Distinguish "blocked by browser settings" from an active denial
        try {
          const perm = await navigator.permissions?.query({
            name: "microphone" as PermissionName,
          });
          if (perm && perm.state === "denied") {
            this.set(
              "blocked",
              "Your browser has blocked microphone access for this site."
            );
            return null;
          }
        } catch {
          /* permissions API not available — fall through */
        }
        this.set("denied", "Microphone permission was declined.");
        return null;
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        this.set("unavailable", "No microphone input was detected.");
        return null;
      }
      if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        this.set(
          "error",
          "Your microphone could not be started. Another app may be using it."
        );
        return null;
      }
      this.set("error", name || "Unknown microphone error.");
      return null;
    }
  }

  private attach(stream: MediaStream) {
    // clean up previous
    this.teardownAudioGraph();
    if (this.stream && this.stream !== stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
    this.stream = stream;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.source.connect(this.analyser);
      this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    } catch {
      // analysis is optional — recording can still proceed
    }
    // monitor track ending (device unplugged / system reset)
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (!this.hasLiveStream()) {
          this.set(
            "error",
            "Your microphone connection was interrupted."
          );
        }
      });
    });
  }

  private teardownAudioGraph() {
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.analyser = null;
    this.ctx = null;
    this.timeData = null;
  }

  /** Attempt to recover after an interruption — still needs a user gesture. */
  async reconnect(): Promise<MediaStream | null> {
    this.set("recovering");
    return this.request();
  }

  /** Stop tracks entirely — only when the user exits recording mode/session. */
  release() {
    this.teardownAudioGraph();
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    // permission itself usually persists; status stays granted
  }

  /** RMS level 0..1 */
  getLevel(): number {
    if (!this.analyser || !this.timeData) return 0;
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.timeData.length);
  }

  /** Downsampled waveform bars (0..1) for live display */
  getWaveform(bars: number): number[] {
    if (!this.analyser || !this.timeData) return new Array(bars).fill(0);
    this.analyser.getByteTimeDomainData(this.timeData);
    const out: number[] = [];
    const block = Math.floor(this.timeData.length / bars) || 1;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs((this.timeData[i * block + j] - 128) / 128);
        if (v > peak) peak = v;
      }
      out.push(Math.min(1, peak * 1.4));
    }
    return out;
  }

  /** Count audio input devices (after permission granted). */
  async countInputDevices(): Promise<number> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput").length;
    } catch {
      return -1;
    }
  }
}

export const micManager = new MicManager();
