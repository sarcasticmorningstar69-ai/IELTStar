/**
 * Hybrid Audio Storage:
 * 1. Local IndexedDB: Instant 0ms offline-first playback and waveform rendering on the current device.
 * 2. Cloudflare R2: Automatic background backup and multi-device streaming with $0 egress fees.
 */

const DB_NAME = "ieltstar-audio";
const DB_VERSION = 1;
const STORE = "recordings";

export interface StoredAudio {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  r2Synced?: boolean;
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

/**
 * Upload an audio blob to Cloudflare R2 in the background via the server-side upload endpoint.
 */
export async function syncAudioToR2(id: string, blob: Blob, mimeType: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("recordingId", id);
    formData.append("mimeType", mimeType);
    formData.append("audio", blob, `${id}.webm`);

    const res = await fetch("/api/audio/upload", {
      method: "POST",
      body: formData,
    }).catch(() => null);

    if (!res || !res.ok) return null;
    const data = (await res.json().catch(() => null)) as { key?: string } | null;
    return data?.key ?? null;
  } catch (err) {
    console.debug("Background R2 sync deferred or offline:", err);
    return null;
  }
}

export async function putAudio(id: string, blob: Blob, mimeType: string): Promise<void> {
  // 1. Instant local persistence in IndexedDB for 0ms lag
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
    console.warn("IELTStar: could not persist audio to local IndexedDB", id);
  }

  // 2. Asynchronous background sync to Cloudflare R2
  if (typeof window !== "undefined") {
    syncAudioToR2(id, blob, mimeType).catch(() => {});
  }
}

export async function getAudio(id: string): Promise<StoredAudio | null> {
  // 1. First priority: Check local IndexedDB (instant, 0 network latency)
  try {
    const db = await openDB();
    const result = await new Promise<StoredAudio | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as StoredAudio) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result) return result;
  } catch {
    /* ignore IndexedDB read error and try R2 fallback */
  }

  // 2. Second priority: If on a different device or cache was cleared, fetch from Cloudflare R2
  try {
    const res = await fetch(`/api/audio/playback-url?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        const audioRes = await fetch(data.url);
        if (audioRes.ok) {
          const blob = await audioRes.blob();
          const mimeType = blob.type || "audio/webm";
          const restored: StoredAudio = {
            id,
            blob,
            mimeType,
            createdAt: Date.now(),
            r2Synced: true,
          };
          // Cache restored audio in IndexedDB for subsequent zero-latency reads
          putAudio(id, blob, mimeType).catch(() => {});
          return restored;
        }
      }
    }
  } catch (err) {
    console.warn("Could not retrieve audio from R2 fallback for id:", id, err);
  }

  return null;
}

export async function getAudioURL(id: string): Promise<string | null> {
  // Check local IndexedDB or R2 fallback via getAudio
  const rec = await getAudio(id);
  if (rec) return URL.createObjectURL(rec.blob);

  // Direct URL fallback if blob couldn't be loaded into memory
  try {
    const res = await fetch(`/api/audio/playback-url?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch {
    /* ignore network error */
  }

  return null;
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
    let arrayBuffer: ArrayBuffer | null = null;

    if (rec) {
      arrayBuffer = await rec.blob.arrayBuffer();
    } else {
      // Fallback: load audio from Cloudflare R2 if not cached in local IndexedDB
      const url = await getAudioURL(recordingId);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      arrayBuffer = await res.arrayBuffer();
    }

    if (!arrayBuffer) return null;

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
      const offset = i * block;
      for (let j = 0; j < block; j++) {
        const val = Math.abs(channel[offset + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    await ctx.close();
    return peaks;
  } catch {
    return null;
  }
}
