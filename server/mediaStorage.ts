import fs from "fs";
import path from "path";
import { ulid } from "ulid";
import db, { firestore } from "./db.ts";

export interface MediaDoc {
  id: string;
  filename: string;
  contentType: string;
  data?: string; // Base64 encoded buffer
  isChunked?: boolean;
  totalChunks?: number;
  size: number;
  created_at: string;
  url?: string;
}

const MAX_SINGLE_DOC_BASE64 = 600000; // 600KB base64 string comfortably fits in 1MB Firestore doc
const CHUNK_SIZE = 450000; // 450KB base64 chars per chunk (~330KB binary per chunk)

function ensureLocalDir(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (e) {
    // Ignore error if directory already exists
  }
}

/**
 * Persists an image/asset buffer safely to Cloud Firestore and local filesystem.
 * Handles files of ANY size by transparently chunking data exceeding 600KB.
 * Returns the permanent endpoint URL: `/api/media/:id`
 */
export async function saveMediaBuffer(
  buffer: Buffer,
  originalname: string,
  mimetype?: string,
  customId?: string
): Promise<{ id: string; url: string; size: number; contentType: string }> {
  const id = customId || `img_${ulid()}`;
  const cleanName = (originalname || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = path.extname(cleanName).toLowerCase();
  
  let contentType = mimetype || "image/png";
  if (!mimetype || mimetype === "application/octet-stream") {
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".svg") contentType = "image/svg+xml";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".pdf") contentType = "application/pdf";
  }

  // 1. Save local copy on disk for high-speed zero-latency streaming
  try {
    const uploadDir = path.join(process.cwd(), "uploads", "images");
    ensureLocalDir(uploadDir);
    fs.writeFileSync(path.join(uploadDir, id), buffer);
    fs.writeFileSync(path.join(uploadDir, cleanName), buffer);
  } catch (diskErr) {
    console.warn("Notice: Local disk cache write:", diskErr);
  }

  // 2. Encode to base64 for Cloud Firestore persistence
  const base64Data = buffer.toString("base64");

  if (base64Data.length <= MAX_SINGLE_DOC_BASE64) {
    // Single document fits in Cloud Firestore
    const docPayload: MediaDoc = {
      id,
      filename: cleanName,
      contentType,
      data: base64Data,
      isChunked: false,
      size: buffer.length,
      created_at: new Date().toISOString(),
      url: `/api/media/${id}`
    };

    await db.set("media_files", id, docPayload);
  } else {
    // Large file: chunk into Firestore media_chunks collection
    const chunks: string[] = [];
    for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
      chunks.push(base64Data.substring(i, i + CHUNK_SIZE));
    }

    await Promise.all(chunks.map((chunkStr, idx) => {
      return firestore.collection("media_chunks").doc(`${id}_${idx}`).set({
        mediaId: id,
        index: idx,
        data: chunkStr,
        created_at: new Date().toISOString()
      });
    }));

    const docPayload: MediaDoc = {
      id,
      filename: cleanName,
      contentType,
      isChunked: true,
      totalChunks: chunks.length,
      size: buffer.length,
      created_at: new Date().toISOString(),
      url: `/api/media/${id}`
    };

    await db.set("media_files", id, docPayload);
  }

  return {
    id,
    url: `/api/media/${id}`,
    size: buffer.length,
    contentType
  };
}

/**
 * Retrieves a media file doc by ID or filename from memory, disk, or Firestore
 */
export async function getMediaDoc(idOrFilename: string): Promise<MediaDoc | null> {
  if (!idOrFilename) return null;
  let cleanKey = String(idOrFilename).trim();
  if (cleanKey.startsWith("/api/media/")) {
    cleanKey = cleanKey.replace("/api/media/", "");
  } else if (cleanKey.startsWith("/uploads/images/")) {
    cleanKey = cleanKey.replace("/uploads/images/", "");
  } else if (cleanKey.startsWith("uploads/images/")) {
    cleanKey = cleanKey.replace("uploads/images/", "");
  }

  const uploadDir = path.join(process.cwd(), "uploads", "images");

  // 1. Check in-memory database cache ONLY if it has actual data and is not truncated
  let doc = db.getSync("media_files", cleanKey);
  if (doc && doc.data && !doc.isChunked) {
    return doc;
  }

  // 2. Fetch directly from Cloud Firestore
  try {
    let rawSnap = await firestore.collection("media_files").doc(cleanKey).get();
    if (!rawSnap.exists) {
      // Query by filename
      const fnSnap = await firestore.collection("media_files").where("filename", "==", cleanKey).limit(1).get();
      if (!fnSnap.empty) {
        rawSnap = fnSnap.docs[0];
      }
    }

    if (rawSnap.exists) {
      doc = rawSnap.data() as MediaDoc;
      if (doc) {
        // If chunked, fetch all chunks
        if (doc.isChunked && doc.totalChunks) {
          const chunkPromises = [];
          for (let i = 0; i < doc.totalChunks; i++) {
            chunkPromises.push(firestore.collection("media_chunks").doc(`${doc.id}_${i}`).get());
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          doc.data = chunkSnaps.map(s => s.data()?.data || "").join("");
        }

        // Cache on local disk for high-speed streaming
        if (doc.data) {
          try {
            ensureLocalDir(uploadDir);
            const buf = Buffer.from(doc.data, "base64");
            fs.writeFileSync(path.join(uploadDir, doc.id), buf);
            if (doc.filename) {
              fs.writeFileSync(path.join(uploadDir, doc.filename), buf);
            }
          } catch (e) {}

          // Update memory cache
          db.set("media_files", cleanKey, doc).catch(() => {});
          return doc;
        }
      }
    }
  } catch (err) {
    console.warn("[MediaStorage] Firestore retrieval warning:", err);
  }

  // 3. If doc was found on disk directly
  const diskById = path.join(uploadDir, cleanKey);
  if (fs.existsSync(diskById)) {
    try {
      const buf = fs.readFileSync(diskById);
      const ext = path.extname(cleanKey).toLowerCase();
      let ct = "image/png";
      if (ext === ".jpg" || ext === ".jpeg") ct = "image/jpeg";
      else if (ext === ".webp") ct = "image/webp";
      return {
        id: cleanKey,
        filename: cleanKey,
        contentType: ct,
        data: buf.toString("base64"),
        size: buf.length,
        created_at: new Date().toISOString(),
        url: `/api/media/${cleanKey}`
      };
    } catch(e) {}
  }

  // 4. Self-healing fallback: If this media id belongs to a product that has valid screenshots
  try {
    const listingSnap = await firestore.collection("listings").where("image_url", "in", [`/api/media/${cleanKey}`, cleanKey]).limit(1).get();
    if (!listingSnap.empty) {
      const listingData = listingSnap.docs[0].data();
      let screenshots: string[] = [];
      try {
        screenshots = typeof listingData.screenshots === "string" ? JSON.parse(listingData.screenshots) : (listingData.screenshots || []);
      } catch(e) {}
      
      for (const sUrl of screenshots) {
        if (sUrl && sUrl !== `/api/media/${cleanKey}` && sUrl !== cleanKey) {
          const sKey = sUrl.replace("/api/media/", "");
          const subDoc = await getMediaDoc(sKey);
          if (subDoc && subDoc.data) {
            const healedDoc: MediaDoc = {
              id: cleanKey,
              filename: doc?.filename || `${cleanKey}.jpg`,
              contentType: subDoc.contentType || "image/jpeg",
              data: subDoc.data,
              size: subDoc.size || Buffer.from(subDoc.data, "base64").length,
              created_at: new Date().toISOString(),
              url: `/api/media/${cleanKey}`
            };
            await firestore.collection("media_files").doc(cleanKey).set(healedDoc, { merge: true });
            await db.set("media_files", cleanKey, healedDoc);
            try {
              ensureLocalDir(uploadDir);
              const buf = Buffer.from(subDoc.data, "base64");
              fs.writeFileSync(path.join(uploadDir, cleanKey), buf);
            } catch(e) {}
            return healedDoc;
          }
        }
      }
    }
  } catch (healErr) {
    console.warn("[MediaStorage] Self-heal check warning:", healErr);
  }

  return null;
}

/**
 * Migrates any legacy images from local `uploads/images/` directory to database metadata.
 */
export async function migrateLocalImagesToFirestore(): Promise<number> {
  let migratedCount = 0;
  const imgDir = path.join(process.cwd(), "uploads", "images");
  if (!fs.existsSync(imgDir)) return 0;

  try {
    const files = fs.readdirSync(imgDir);
    for (const filename of files) {
      const filePath = path.join(imgDir, filename);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const existing = db.getSync("media_files", filename);
        if (existing) {
          continue; // Already recorded
        }

        const ext = path.extname(filename).toLowerCase();
        let contentType = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
        else if (ext === ".webp") contentType = "image/webp";
        else if (ext === ".svg") contentType = "image/svg+xml";

        const docPayload: MediaDoc = {
          id: filename,
          filename,
          contentType,
          size: stat.size,
          created_at: new Date().toISOString(),
          url: `/api/media/${filename}`
        };
        await db.set("media_files", filename, docPayload);
        migratedCount++;
      }
    }
  } catch (err) {
    console.error("Notice: Local image metadata migration error:", err);
  }

  return migratedCount;
}

/**
 * Deletes a media file from memory, Firestore, and disk
 */
export async function deleteMediaDoc(idOrUrlOrFilename: string): Promise<boolean> {
  if (!idOrUrlOrFilename) return false;
  try {
    let cleanKey = String(idOrUrlOrFilename).trim();
    if (cleanKey.startsWith("/api/media/")) {
      cleanKey = cleanKey.replace("/api/media/", "");
    } else if (cleanKey.includes("/")) {
      cleanKey = cleanKey.split("/").pop() || cleanKey;
    }
    // Delete from Firestore / memory
    try {
      await db.delete("media_files", cleanKey);
    } catch (e) {}

    // Delete from local uploads/images if exists
    try {
      const uploadDir = path.join(process.cwd(), "uploads", "images");
      const diskPath = path.join(uploadDir, cleanKey);
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("deleteMediaDoc error:", err);
    return false;
  }
}

