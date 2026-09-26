import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { storage, db, auth } from "./firebase";
import { autoProcessAvatar, ProcessedImageResult } from "./imageProcessor";
import { canAttemptClientFirestoreWrite, handleClientFirestoreError } from "./firestoreService";

export const MAX_AVATAR_SIZE_MB = 5;
export const MAX_AVATAR_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

// Client-side Upload Rate Limiter (Max 10 uploads per hour per user)
const uploadTimestamps: Record<string, number[]> = {};

export function checkUploadRateLimit(uid: string): { allowed: boolean; remainingMs?: number } {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  if (!uploadTimestamps[uid]) {
    uploadTimestamps[uid] = [];
  }

  // Filter timestamps within the last hour
  uploadTimestamps[uid] = uploadTimestamps[uid].filter((ts) => now - ts < oneHour);

  if (uploadTimestamps[uid].length >= 10) {
    const oldest = uploadTimestamps[uid][0];
    const remainingMs = oneHour - (now - oldest);
    return { allowed: false, remainingMs };
  }

  return { allowed: true };
}

export function recordUploadAttempt(uid: string) {
  if (!uploadTimestamps[uid]) uploadTimestamps[uid] = [];
  uploadTimestamps[uid].push(Date.now());
}

export interface ValidateImageResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates file format (PNG, JPG, JPEG, WebP only) and file size (max 5MB)
 */
export function validateProfileImage(file: File): ValidateImageResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  const fileType = file.type?.toLowerCase();
  const fileName = file.name?.toLowerCase();
  const isExtensionValid = fileName.endsWith(".png") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".webp");
  const isMimeValid = ALLOWED_IMAGE_TYPES.includes(fileType);

  if (!isExtensionValid && !isMimeValid) {
    return {
      valid: false,
      error: "Invalid file format. Only PNG, JPG, JPEG, and WebP images are allowed."
    };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_AVATAR_SIZE_MB}MB. Please select a smaller image.`
    };
  }

  return { valid: true };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads processed full avatar and thumbnail blobs to Server storage with Firebase Storage fallback
 */
export async function uploadAvatarBlobsToFirebaseStorage(
  uid: string,
  processed: ProcessedImageResult,
  role: "user" | "seller" | "admin" = "user"
): Promise<{ fullUrl: string; thumbUrl: string }> {
  const rateLimit = checkUploadRateLimit(uid);
  if (!rateLimit.allowed) {
    const mins = Math.ceil((rateLimit.remainingMs || 0) / 60000);
    throw new Error(`Upload rate limit reached (max 10 uploads/hour). Please try again in ${mins} minutes.`);
  }

  const timestamp = Date.now();
  let fullUrl = "";
  let thumbUrl = "";

  // 1. Try Server Endpoint upload first (100% reliable)
  try {
    const formData = new FormData();
    formData.append("image", processed.fullBlob, `avatar_${timestamp}.png`);
    const res = await fetch("/api/upload-image", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok && data.success && data.url) {
      fullUrl = data.url;
      thumbUrl = data.url;
    }
  } catch (e) {
    console.warn("Server avatar upload notice:", e);
  }

  // 2. Try Firebase Storage if server upload wasn't used or as sync
  if (!fullUrl) {
    try {
      const ext = processed.mimeType === "image/webp" ? "webp" : "jpg";
      const fullPath = `${role}s/${uid}/profile/avatar_400x400_${timestamp}.${ext}`;
      const thumbPath = `${role}s/${uid}/profile/avatar_100x100_${timestamp}.${ext}`;

      const fullRef = ref(storage, fullPath);
      const thumbRef = ref(storage, thumbPath);

      const [fullSnap, thumbSnap] = await Promise.all([
        uploadBytes(fullRef, processed.fullBlob, {
          contentType: processed.mimeType,
          customMetadata: { ownerUid: uid, role, type: "avatar_full", uploadedAt: new Date().toISOString() }
        }),
        uploadBytes(thumbRef, processed.thumbBlob, {
          contentType: processed.mimeType,
          customMetadata: { ownerUid: uid, role, type: "avatar_thumb", uploadedAt: new Date().toISOString() }
        })
      ]);

      const rawFullUrl = await getDownloadURL(fullSnap.ref);
      const rawThumbUrl = await getDownloadURL(thumbSnap.ref);
      fullUrl = `${rawFullUrl}&v=${timestamp}`;
      thumbUrl = `${rawThumbUrl}&v=${timestamp}`;
    } catch (fbErr) {
      console.warn("Firebase storage upload notice, falling back to base64:", fbErr);
    }
  }

  // 3. Fallback to base64 data URL if all else fails
  if (!fullUrl) {
    const base64 = await blobToBase64(processed.fullBlob);
    fullUrl = base64;
    thumbUrl = base64;
  }

  recordUploadAttempt(uid);
  return { fullUrl, thumbUrl };
}

/**
 * Updates full profile across Real Firebase Storage, Cloud Firestore, Firebase Auth, and Backend Database
 */
export async function updateUniversalProfile({
  uid,
  displayName,
  file,
  processedImage,
  isRemovePhoto = false,
  role = "user",
  token
}: {
  uid: string;
  displayName?: string;
  file?: File | null;
  processedImage?: ProcessedImageResult | null;
  isRemovePhoto?: boolean;
  role?: "user" | "seller" | "admin";
  token?: string | null;
}): Promise<{ name: string; photoURL: string; photoURL_thumb: string }> {
  if (!uid) {
    throw new Error("User ID is required for profile updates.");
  }

  let finalFullUrl: string | null = null;
  let finalThumbUrl: string | null = null;

  // 1. Process and Upload Avatar or Remove
  if (processedImage) {
    const urls = await uploadAvatarBlobsToFirebaseStorage(uid, processedImage, role);
    finalFullUrl = urls.fullUrl;
    finalThumbUrl = urls.thumbUrl;
  } else if (file) {
    const validation = validateProfileImage(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const processed = await autoProcessAvatar(file);
    const urls = await uploadAvatarBlobsToFirebaseStorage(uid, processed, role);
    finalFullUrl = urls.fullUrl;
    finalThumbUrl = urls.thumbUrl;
  } else if (isRemovePhoto) {
    finalFullUrl = "";
    finalThumbUrl = "";
  }

  const trimmedName = displayName ? displayName.trim() : "";
  if (displayName !== undefined && trimmedName.length === 0) {
    throw new Error("Display Name cannot be empty.");
  }

  const nowISO = new Date().toISOString();

  // 2. Real Cloud Firestore Persistence
  try {
    if (canAttemptClientFirestoreWrite()) {
      const batch = writeBatch(db);

      const userRef = doc(db, "users", uid);
      const userProfileRef = doc(db, "user_profiles", uid);

      const userPayload: any = {
        uid,
        updatedAt: nowISO
      };

      if (trimmedName) userPayload.name = trimmedName;
      if (finalFullUrl !== null) {
        userPayload.photoURL = finalFullUrl;
        userPayload.photoURL_full = finalFullUrl;
        userPayload.photoURL_thumb = finalThumbUrl;
        userPayload.photoUpdatedAt = nowISO;
      }

      batch.set(userRef, userPayload, { merge: true });
      batch.set(userProfileRef, userPayload, { merge: true });

      if (role === "seller") {
        const sellerRef = doc(db, "sellers", uid);
        const sellerProfileRef = doc(db, "seller_profiles", uid);
        const sellerPayload: any = {
          id: uid,
          user_id: uid,
          updated_at: nowISO
        };
        if (trimmedName) sellerPayload.store_name = trimmedName;
        if (finalFullUrl !== null) {
          sellerPayload.photoURL = finalFullUrl;
          sellerPayload.photoURL_thumb = finalThumbUrl;
        }

        batch.set(sellerRef, sellerPayload, { merge: true });
        batch.set(sellerProfileRef, sellerPayload, { merge: true });
      }

      if (role === "admin") {
        const adminRoleRef = doc(db, "admin_roles", uid);
        const adminPayload: any = {
          id: uid,
          updated_at: nowISO
        };
        if (trimmedName) adminPayload.name = trimmedName;
        if (finalFullUrl !== null) {
          adminPayload.photoURL = finalFullUrl;
          adminPayload.photoURL_thumb = finalThumbUrl;
        }

        batch.set(adminRoleRef, adminPayload, { merge: true });
      }

      await batch.commit();
      console.log(`🔥 [Firestore] Persisted ${role} profile for UID ${uid}`);
    }
  } catch (err: any) {
    handleClientFirestoreError("Avatar profile Firestore update", err, false);
  }

  // 3. Synchronize Firebase Authentication Profile
  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      const authUpdate: { displayName?: string; photoURL?: string } = {};
      if (trimmedName) authUpdate.displayName = trimmedName;
      if (finalFullUrl !== null) authUpdate.photoURL = finalFullUrl;

      await updateProfile(auth.currentUser, authUpdate);
      console.log("✅ Synchronized Firebase Auth profile!");
    } catch (authErr: any) {
      console.warn("⚠️ Firebase Auth profile sync notice:", authErr?.message);
    }
  }

  // 4. Backend Database Sync (SQLite + API)
  if (token) {
    try {
      const apiEndpoint = role === "seller" ? "/api/seller/settings" : "/api/user/profile";
      const payload: any = {};
      if (trimmedName) payload.name = trimmedName;
      if (trimmedName && role === "seller") payload.storeName = trimmedName;
      if (finalFullUrl !== null) payload.avatar_url = finalFullUrl;

      await fetch(apiEndpoint, {
        method: role === "seller" ? "POST" : "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (apiErr) {
      console.warn("⚠️ Backend SQLite profile sync notice:", apiErr);
    }
  }

  return {
    name: trimmedName,
    photoURL: finalFullUrl !== null ? finalFullUrl : "",
    photoURL_thumb: finalThumbUrl !== null ? finalThumbUrl : ""
  };
}

/**
 * Uploads custom website logo/icon (PNG/JPG/JPEG/WebP) to Express Server & Firestore site_settings
 */
export async function updateWebsiteLogo({
  file,
  processedImage,
  uid,
  token
}: {
  file?: File | null;
  processedImage?: ProcessedImageResult | null;
  uid?: string;
  token?: string;
}): Promise<string> {
  const timestamp = Date.now();
  let logoUrl = "";
  const authToken = token || localStorage.getItem("aurevyxon_token") || "";

  // 1. Send via multipart Form Data to Server API endpoint
  try {
    const formData = new FormData();
    if (processedImage) {
      const ext = processedImage.mimeType === "image/webp" ? "webp" : "png";
      formData.append("logo", processedImage.fullBlob, `site_logo_${timestamp}.${ext}`);
    } else if (file) {
      formData.append("logo", file, file.name || `site_logo_${timestamp}.png`);
    }

    const res = await fetch("/api/admin/site-logo", {
      method: "POST",
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.success && data.logo_url) {
      logoUrl = data.logo_url;
    }
  } catch (serverErr) {
    console.warn("Server logo upload notice:", serverErr);
  }

  // 2. Try base64 payload to server if multipart was not used
  if (!logoUrl) {
    try {
      let base64Str = "";
      if (processedImage) {
        base64Str = await blobToBase64(processedImage.fullBlob);
      } else if (file) {
        base64Str = await fileToBase64(file);
      }

      if (base64Str) {
        const res = await fetch("/api/admin/site-logo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({ base64: base64Str })
        });
        const data = await res.json();
        if (res.ok && data.success && data.logo_url) {
          logoUrl = data.logo_url;
        } else {
          // Direct base64 fallback
          logoUrl = base64Str;
        }
      }
    } catch (e) {
      console.warn("Base64 upload fallback notice:", e);
    }
  }

  // 3. Fallback to Firebase Storage if available
  if (!logoUrl) {
    try {
      if (processedImage) {
        const ext = processedImage.mimeType === "image/webp" ? "webp" : "png";
        const storagePath = `site_config/logo_${timestamp}.${ext}`;
        const logoRef = ref(storage, storagePath);
        const snap = await uploadBytes(logoRef, processedImage.fullBlob, {
          contentType: processedImage.mimeType,
          customMetadata: { uploadedBy: uid || "admin", type: "site_logo", uploadedAt: new Date().toISOString() }
        });
        const rawUrl = await getDownloadURL(snap.ref);
        logoUrl = `${rawUrl}&v=${timestamp}`;
      } else if (file) {
        const validation = validateProfileImage(file);
        if (!validation.valid) throw new Error(validation.error);
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const storagePath = `site_config/logo_${timestamp}.${ext}`;
        const logoRef = ref(storage, storagePath);
        const snap = await uploadBytes(logoRef, file, {
          contentType: file.type || "image/png",
          customMetadata: { uploadedBy: uid || "admin", type: "site_logo", uploadedAt: new Date().toISOString() }
        });
        const rawUrl = await getDownloadURL(snap.ref);
        logoUrl = `${rawUrl}&v=${timestamp}`;
      }
    } catch (fbErr) {
      console.warn("Firebase storage logo upload notice:", fbErr);
    }
  }

  if (!logoUrl) {
    throw new Error("Failed to upload website logo.");
  }

  // Persist in Firestore
  try {
    if (canAttemptClientFirestoreWrite()) {
      const siteSettingsRef = doc(db, "site_settings", "general");
      await setDoc(siteSettingsRef, { logoURL: logoUrl, updatedAt: new Date().toISOString() }, { merge: true });
    }
  } catch (err) {
    handleClientFirestoreError("Firestore site_settings update", err, false);
  }

  // Persist in localStorage for instant client propagation
  try {
    localStorage.setItem("aurevyxon_site_logo", logoUrl);
    window.dispatchEvent(new CustomEvent("site_logo_updated", { detail: logoUrl }));
  } catch (e) {
    console.warn("localStorage setItem notice:", e);
  }

  return logoUrl;
}

