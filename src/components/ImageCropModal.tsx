import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Check, 
  X, 
  Crop, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  Target, 
  Circle, 
  Square 
} from "lucide-react";
import { processAndCropAvatar, ProcessedImageResult } from "@/lib/imageProcessor";

interface ImageCropModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onCropComplete: (processed: ProcessedImageResult) => void;
}

const BOX_SIZE = 280; // Size of crop viewport in pixels

export function ImageCropModal({
  isOpen,
  file,
  onClose,
  onCropComplete
}: ImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [isCircleMask, setIsCircleMask] = useState<boolean>(true);
  
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);

      // Pre-load image to get natural dimensions
      const img = new Image();
      img.onload = () => {
        setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = url;

      return () => URL.revokeObjectURL(url);
    } else {
      setImageSrc(null);
      setImgNaturalSize(null);
    }
  }, [file]);

  // Calculate effective dimensions based on rotation
  const isRotated90 = rotation === 90 || rotation === 270;
  const naturalWidth = imgNaturalSize ? (isRotated90 ? imgNaturalSize.height : imgNaturalSize.width) : 1;
  const naturalHeight = imgNaturalSize ? (isRotated90 ? imgNaturalSize.width : imgNaturalSize.height) : 1;

  // Scale to cover BOX_SIZE at zoom = 1
  const coverScale = Math.max(BOX_SIZE / naturalWidth, BOX_SIZE / naturalHeight);
  const displayW = naturalWidth * coverScale * zoom;
  const displayH = naturalHeight * coverScale * zoom;

  // Calculate pan limits to keep image covering the crop box
  const maxPanX = Math.max(BOX_SIZE / 2, (displayW - BOX_SIZE) / 2);
  const maxPanY = Math.max(BOX_SIZE / 2, (displayH - BOX_SIZE) / 2);

  // Helper to extract client position from Mouse or Touch event
  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ("clientX" in e) {
      return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    }
    return { x: 0, y: 0 };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const pos = getPos(e);
    setDragStart({ x: pos.x - pan.x, y: pos.y - pan.y });
  };

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const pos = getPos(e);
    const rawX = pos.x - dragStart.x;
    const rawY = pos.y - dragStart.y;

    // Soft clamp within bounds
    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, rawX));
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, rawY));
    setPan({ x: clampedX, y: clampedY });
  }, [isDragging, dragStart, maxPanX, maxPanY]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Window event listeners for seamless drag outside container
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Nudge / Arrow Button handlers for precise centering ("sarkana" controls)
  const nudge = (dx: number, dy: number) => {
    setPan((p) => ({
      x: Math.max(-maxPanX, Math.min(maxPanX, p.x + dx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, p.y + dy))
    }));
  };

  const handleResetCenter = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
    setPan({ x: 0, y: 0 }); // Reset pan on rotation to maintain alignment
  };

  const handleApplyCrop = async () => {
    if (!imgNaturalSize || !file) return;
    setProcessing(true);

    try {
      // Calculate crop coordinates relative to the natural image
      const srcW = imgNaturalSize.width;
      const srcH = imgNaturalSize.height;

      const isRot = rotation === 90 || rotation === 270;
      const effSrcW = isRot ? srcH : srcW;
      const effSrcH = isRot ? srcW : srcH;

      const scale = Math.max(BOX_SIZE / effSrcW, BOX_SIZE / effSrcH) * zoom;
      const curDisplayW = effSrcW * scale;
      const curDisplayH = effSrcH * scale;

      // Crop viewport top-left relative to image display top-left
      const cropDisplayX = curDisplayW / 2 - BOX_SIZE / 2 - pan.x;
      const cropDisplayY = curDisplayH / 2 - BOX_SIZE / 2 - pan.y;

      const scaleFactor = effSrcW / curDisplayW;

      const cropX = Math.max(0, Math.min(effSrcW - 10, cropDisplayX * scaleFactor));
      const cropY = Math.max(0, Math.min(effSrcH - 10, cropDisplayY * scaleFactor));
      const cropW = Math.min(effSrcW - cropX, BOX_SIZE * scaleFactor);
      const cropH = Math.min(effSrcH - cropY, BOX_SIZE * scaleFactor);

      const result = await processAndCropAvatar(
        file,
        {
          x: Math.round(cropX),
          y: Math.round(cropY),
          width: Math.round(cropW),
          height: Math.round(cropH)
        },
        400,
        100,
        rotation
      );

      onCropComplete(result);
      onClose();
    } catch (err) {
      console.error("Cropping failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen || !imageSrc || !file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#101022] border-border text-white sm:max-w-lg p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-white text-base">
            <span className="flex items-center gap-2">
              <Crop className="w-5 h-5 text-indigo-400" />
              Adjust & Center Image / Photo
            </span>

            {/* Shape Toggle */}
            <div className="flex items-center bg-white/10 rounded-lg p-1 gap-1">
              <button
                type="button"
                onClick={() => setIsCircleMask(true)}
                className={`p-1 rounded text-xs flex items-center gap-1 transition-all ${
                  isCircleMask ? "bg-indigo-600 text-white font-semibold" : "text-gray-400 hover:text-white"
                }`}
                title="Circular Profile Mask"
              >
                <Circle className="w-3.5 h-3.5" />
                Circle
              </button>
              <button
                type="button"
                onClick={() => setIsCircleMask(false)}
                className={`p-1 rounded text-xs flex items-center gap-1 transition-all ${
                  !isCircleMask ? "bg-indigo-600 text-white font-semibold" : "text-gray-400 hover:text-white"
                }`}
                title="Square Logo Mask"
              >
                <Square className="w-3.5 h-3.5" />
                Square
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Instructions */}
          <div className="text-center text-xs text-indigo-200/80 bg-indigo-500/10 border border-indigo-500/20 py-1.5 px-3 rounded-lg">
            🖱️ <strong>Drag with mouse/finger</strong> or use arrow buttons below to move & center photo
          </div>

          {/* Crop Viewport Box */}
          <div className="relative flex items-center justify-center py-2">
            <div
              style={{ width: BOX_SIZE, height: BOX_SIZE }}
              className={`relative overflow-hidden bg-black/80 border-2 border-indigo-500 cursor-grab active:cursor-grabbing shadow-2xl transition-all ${
                isCircleMask ? "rounded-full" : "rounded-2xl"
              }`}
              onMouseDown={handleStart}
              onTouchStart={handleStart}
            >
              {/* Grid Guide Overlay */}
              <div className="absolute inset-0 border border-white/10 pointer-events-none z-10 grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/10"></div>
                <div className="border-r border-b border-white/10"></div>
                <div className="border-b border-white/10"></div>
                <div className="border-r border-b border-white/10"></div>
                <div className="border-r border-b border-white/10"></div>
                <div className="border-b border-white/10"></div>
                <div className="border-r border-white/10"></div>
                <div className="border-r border-white/10"></div>
                <div></div>
              </div>

              {/* Displayed Image */}
              {imageSrc && (
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop Preview"
                  draggable={false}
                  style={{
                    width: `${displayW}px`,
                    height: `${displayH}px`,
                    maxWidth: "none",
                    maxHeight: "none",
                    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
                    transition: isDragging ? "none" : "transform 0.15s ease-out"
                  }}
                  className="absolute top-1/2 left-1/2 pointer-events-none select-none object-contain"
                />
              )}
            </div>
          </div>

          {/* Precise Adjustment Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
            {/* Directional Arrow Controls ("Sarkana" buttons) */}
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase font-mono text-gray-400 mb-1">Position / Align</span>
              <div className="grid grid-cols-3 gap-1 w-28">
                <div></div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => nudge(0, -15)}
                  className="h-8 w-8 bg-black/40 border-white/20 text-gray-200 hover:bg-indigo-600 hover:text-white"
                  title="Move Up"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <div></div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => nudge(-15, 0)}
                  className="h-8 w-8 bg-black/40 border-white/20 text-gray-200 hover:bg-indigo-600 hover:text-white"
                  title="Move Left"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleResetCenter}
                  className="h-8 w-8 bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600 hover:text-white"
                  title="Center Reset"
                >
                  <Target className="w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => nudge(15, 0)}
                  className="h-8 w-8 bg-black/40 border-white/20 text-gray-200 hover:bg-indigo-600 hover:text-white"
                  title="Move Right"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <div></div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => nudge(0, 15)}
                  className="h-8 w-8 bg-black/40 border-white/20 text-gray-200 hover:bg-indigo-600 hover:text-white"
                  title="Move Down"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <div></div>
              </div>
            </div>

            {/* Zoom & Rotation Controls */}
            <div className="flex flex-col justify-center space-y-3 pl-0 sm:pl-2 sm:border-l border-white/10">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                  <span>Zoom Level</span>
                  <span className="font-mono text-indigo-400">{zoom.toFixed(2)}x</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                    disabled={zoom <= 1}
                    className="h-7 w-7 text-gray-300 hover:text-white hover:bg-white/10"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                    disabled={zoom >= 4}
                    className="h-7 w-7 text-gray-300 hover:text-white hover:bg-white/10"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotate}
                  className="bg-black/30 border-white/20 text-xs text-gray-300 hover:bg-white/10 hover:text-white gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                  Rotate 90° ({rotation}°)
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetCenter}
                  className="text-xs text-gray-400 hover:text-indigo-300"
                >
                  Reset All
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs"
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApplyCrop}
            disabled={processing}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 gap-1.5 shadow-lg shadow-indigo-600/30"
          >
            <Check className="w-4 h-4" />
            {processing ? "Processing..." : "Apply & Save Crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
