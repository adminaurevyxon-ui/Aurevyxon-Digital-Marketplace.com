/**
 * Client-Side Image Processing Pipeline
 * Converts image files to sanitized, cropped, compressed WebP/JPEG blobs,
 * strips EXIF metadata via canvas re-drawing, and generates thumbnail variants.
 */

export interface ProcessedImageResult {
  fullBlob: Blob;
  thumbBlob: Blob;
  fullWidth: number;
  fullHeight: number;
  mimeType: string;
}

/**
 * Processes an Image element or file using HTML Canvas.
 * Automatically resizes, strips EXIF metadata, converts to WebP/JPEG,
 * and generates a 400x400 full avatar and 100x100 thumbnail.
 */
export async function processAndCropAvatar(
  imageSource: File | HTMLImageElement | string,
  cropArea: { x: number; y: number; width: number; height: number },
  targetSize: number = 400,
  thumbSize: number = 100,
  rotation: number = 0
): Promise<ProcessedImageResult> {
  let img: HTMLImageElement;

  if (typeof imageSource === "string") {
    img = await loadImageFromUrl(imageSource);
  } else if (imageSource instanceof File) {
    const url = URL.createObjectURL(imageSource);
    img = await loadImageFromUrl(url);
    URL.revokeObjectURL(url);
  } else {
    img = imageSource;
  }

  // Handle optional rotation by drawing onto an intermediate canvas
  let sourceElement: HTMLImageElement | HTMLCanvasElement = img;
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (normalizedRotation !== 0) {
    const rotCanvas = document.createElement("canvas");
    if (normalizedRotation === 90 || normalizedRotation === 270) {
      rotCanvas.width = img.height;
      rotCanvas.height = img.width;
    } else {
      rotCanvas.width = img.width;
      rotCanvas.height = img.height;
    }
    const rotCtx = rotCanvas.getContext("2d");
    if (rotCtx) {
      rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rotCtx.rotate((normalizedRotation * Math.PI) / 180);
      rotCtx.drawImage(img, -img.width / 2, -img.height / 2);
      sourceElement = rotCanvas;
    }
  }

  // 1. Create Main Canvas (e.g. 400x400)
  const mainCanvas = document.createElement("canvas");
  mainCanvas.width = targetSize;
  mainCanvas.height = targetSize;
  const mainCtx = mainCanvas.getContext("2d");

  if (!mainCtx) {
    throw new Error("Failed to initialize HTML Canvas 2D Context.");
  }

  // Smooth rendering settings
  mainCtx.imageSmoothingEnabled = true;
  mainCtx.imageSmoothingQuality = "high";

  // Draw cropped region from source image or rotated canvas
  mainCtx.drawImage(
    sourceElement,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    targetSize,
    targetSize
  );

  // 2. Create Thumbnail Canvas (e.g. 100x100)
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = thumbSize;
  thumbCanvas.height = thumbSize;
  const thumbCtx = thumbCanvas.getContext("2d");

  if (!thumbCtx) {
    throw new Error("Failed to initialize Thumbnail Canvas 2D Context.");
  }

  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = "high";
  thumbCtx.drawImage(mainCanvas, 0, 0, targetSize, targetSize, 0, 0, thumbSize, thumbSize);

  // Export to WebP with JPEG fallback if WebP is unsupported
  const mimeType = supportsWebP() ? "image/webp" : "image/jpeg";

  const fullBlob = await canvasToBlob(mainCanvas, mimeType, 0.92);
  const thumbBlob = await canvasToBlob(thumbCanvas, mimeType, 0.85);

  return {
    fullBlob,
    thumbBlob,
    fullWidth: targetSize,
    fullHeight: targetSize,
    mimeType
  };
}

/**
 * Simple Helper to convert a file to a center-cropped 400x400 avatar directly if no manual cropping needed.
 */
export async function autoProcessAvatar(
  file: File,
  targetSize: number = 400,
  thumbSize: number = 100
): Promise<ProcessedImageResult> {
  const url = URL.createObjectURL(file);
  const img = await loadImageFromUrl(url);
  URL.revokeObjectURL(url);

  // Determine center square crop
  const minDim = Math.min(img.width, img.height);
  const cropX = (img.width - minDim) / 2;
  const cropY = (img.height - minDim) / 2;

  return processAndCropAvatar(
    img,
    { x: cropX, y: cropY, width: minDim, height: minDim },
    targetSize,
    thumbSize
  );
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Failed to load image for processing: " + err));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export to Blob failed."));
      },
      mimeType,
      quality
    );
  });
}

function supportsWebP(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    return false;
  }
}
