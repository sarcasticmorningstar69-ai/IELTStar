/**
 * IndexedDB storage for audio blobs.
 * Audio NEVER goes to localStorage and never leaves the device.
 */

const DB_NAME = "ieltstar-audio";
const DB_VERSION = 1;
const STORE = "recordings";

export interface StoredAudio {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAudio(id: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, blob, mimeType, createdAt: Date.now() } satisfies StoredAudio);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // storage may be full or unavailable — recording metadata stays usable
    console.warn("IELTStar: could not persist audio blob", id);
  }
}

export async function getAudio(id: string): Promise<StoredAudio | null> {
  try {
    const db = await openDB();
    const result = await new Promise<StoredAudio | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as StoredAudio) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function getAudioURL(id: string): Promise<string | null> {
  const rec = await getAudio(id);
  return rec ? URL.createObjectURL(rec.blob) : null;
}

export async function deleteAudio(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function deleteAudioMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function clearAllAudio(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function estimateAudioUsage(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return est.usage || 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Decode a stored audio blob into amplitude peaks for waveform display.
 * Returns null when decoding is not possible.
 */
export async function computePeaks(recordingId: string, bars = 96): Promise<number[] | null> {
  try {
    const rec = await getAudio(recordingId);
    if (!rec) return null;
    const arrayBuffer = await rec.blob.arrayBuffer();
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const block = Math.floor(channel.length / bars) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block; j += Math.max(1, Math.floor(block / 48))) {
        const v = Math.abs(channel[start + j] || 0);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    ctx.close();
    const globalMax = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.min(1, p / globalMax));
  } catch {
    return null;
  }
}
