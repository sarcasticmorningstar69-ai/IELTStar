/**
 * Topic Wheel audio effects.
 *
 * A single shared AudioContext drives two sounds:
 *  - tick(): a soft wooden click while the picker moves. Pitch rises with
 *    spin velocity and the click is filtered so it reads as a mechanism
 *    rather than a beep.
 *  - land(): a short two-note resolve when the wheel settles.
 */

type Ctx = AudioContext | null;

export class WheelAudio {
  private ctx: Ctx = null;
  private bus: GainNode | null = null;
  private lastTick = 0;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 0.9;
        this.bus.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** @param velocity 0..1 — how fast the picker is currently moving. */
  tick(velocity: number) {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;
    // Never machine-gun the click, even at peak speed.
    if (now - this.lastTick < 0.028) return;
    this.lastTick = now;

    const v = Math.max(0, Math.min(1, velocity));
    const body = ctx.createOscillator();
    const click = ctx.createOscillator();
    const gain = ctx.createGain();
    const tone = ctx.createBiquadFilter();

    tone.type = "lowpass";
    tone.frequency.value = 1250 + v * 900;
    tone.Q.value = 0.7;

    body.type = "triangle";
    body.frequency.setValueAtTime(300 + v * 190, now);
    body.frequency.exponentialRampToValueAtTime(180 + v * 90, now + 0.045);

    click.type = "sine";
    click.frequency.setValueAtTime(1500 + v * 700, now);
    click.frequency.exponentialRampToValueAtTime(700, now + 0.02);

    const peak = 0.02 + v * 0.03;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    body.connect(tone);
    click.connect(tone);
    tone.connect(gain);
    gain.connect(this.bus);

    body.start(now);
    click.start(now);
    body.stop(now + 0.07);
    click.stop(now + 0.07);
  }

  /** Warm resolve when the spin lands on the final topic. */
  land() {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;
    [
      { f: 523.25, t: 0, g: 0.05 },
      { f: 783.99, t: 0.085, g: 0.042 },
    ].forEach(({ f, t, g }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2600;
      osc.type = "sine";
      osc.frequency.value = f;
      const at = now + t;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(g, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      osc.connect(tone);
      tone.connect(gain);
      gain.connect(this.bus!);
      osc.start(at);
      osc.stop(at + 0.36);
    });
  }

  dispose() {
    try {
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.bus = null;
  }
}
