import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Zap, Clock, X, AlertCircle, Sparkles, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlashSaleTimer } from "./FlashSaleTimer";

interface ProductListing {
  id: string;
  title: string;
  price: number;
  image_url?: string;
  flash_discount_percentage?: number;
  flash_discount_ends_at?: string;
}

interface FlashDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductListing[];
  selectedProduct?: ProductListing | null;
  token?: string;
  onSuccess?: () => void;
}

export function FlashDiscountModal({
  isOpen,
  onClose,
  products,
  selectedProduct,
  token,
  onSuccess
}: FlashDiscountModalProps) {
  const [targetProductId, setTargetProductId] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [days, setDays] = useState<number>(1);
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (selectedProduct) {
      setTargetProductId(selectedProduct.id);
      if (selectedProduct.flash_discount_percentage) {
        setDiscountPercent(selectedProduct.flash_discount_percentage);
      }
    } else if (products.length > 0) {
      setTargetProductId(products[0].id);
    }
  }, [selectedProduct, products]);

  if (!isOpen) return null;

  const currentProduct = products.find(p => p.id === targetProductId) || selectedProduct;

  const calculateTargetTime = () => {
    const now = Date.now();
    const totalSecs = (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
    return new Date(now + totalSecs * 1000);
  };

  const targetDate = calculateTargetTime();
  const calculatedPrice = currentProduct ? Math.max(0, currentProduct.price * (1 - discountPercent / 100)) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProductId) {
      toast.error("Please select a product for the flash sale.");
      return;
    }

    const totalSeconds = (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
    if (totalSeconds <= 0) {
      toast.error("Please set a valid duration greater than 0 seconds.");
      return;
    }

    setSubmitting(true);
    try {
      const authToken = token || localStorage.getItem("aurevyxon_token");
      const res = await fetch("/api/seller/flash-discount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          listing_id: targetProductId,
          discount_percentage: discountPercent,
          days,
          hours,
          minutes,
          seconds
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "⚡ Flash discount activated!");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(data.error || "Failed to set flash discount.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelFlashSale = async () => {
    if (!targetProductId) return;
    setSubmitting(true);
    try {
      const authToken = token || localStorage.getItem("aurevyxon_token");
      const res = await fetch(`/api/seller/flash-discount/${targetProductId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Flash discount cancelled.");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(data.error || "Failed to cancel flash discount.");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-amber-500/30 rounded-2xl shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Zap className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                Flash Sale & Timer
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  Time-Limited
                </span>
              </h3>
              <p className="text-xs text-zinc-400">Set a live counting discount timer for your product</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Product Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-300 font-semibold">Select Product</label>
            <select
              value={targetProductId}
              onChange={(e) => setTargetProductId(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (${p.price})
                </option>
              ))}
            </select>
          </div>

          {/* Discount Percentage Slider & Field */}
          <div className="space-y-2 bg-zinc-900/60 p-3.5 border border-zinc-800 rounded-xl">
            <div className="flex justify-between items-center">
              <label className="block text-xs text-zinc-300 font-semibold">Discount Percentage (% OFF)</label>
              <span className="text-amber-400 font-mono font-bold text-base">{discountPercent}% OFF</span>
            </div>
            <input
              type="range"
              min="1"
              max="95"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
              <span>5%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>90%</span>
            </div>
          </div>

          {/* Duration Selector: Days, Hours, Minutes, Seconds */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Set Duration (Days, Hours, Minutes, Seconds)
            </label>
            
            <div className="grid grid-cols-4 gap-2.5">
              <div>
                <span className="block text-[10px] text-zinc-400 mb-1 text-center font-mono uppercase">Days</span>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={days}
                  onChange={(e) => setDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="bg-zinc-900 border-zinc-700 text-center text-amber-300 font-mono font-bold"
                />
              </div>
              <div>
                <span className="block text-[10px] text-zinc-400 mb-1 text-center font-mono uppercase">Hours</span>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  className="bg-zinc-900 border-zinc-700 text-center text-amber-300 font-mono font-bold"
                />
              </div>
              <div>
                <span className="block text-[10px] text-zinc-400 mb-1 text-center font-mono uppercase">Minutes</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="bg-zinc-900 border-zinc-700 text-center text-amber-300 font-mono font-bold"
                />
              </div>
              <div>
                <span className="block text-[10px] text-zinc-400 mb-1 text-center font-mono uppercase">Seconds</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="bg-zinc-900 border-zinc-700 text-center text-amber-300 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="bg-zinc-900/80 border border-amber-500/20 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs text-zinc-400 border-b border-zinc-800 pb-2">
              <span>Original Price: <strong className="text-zinc-200">${currentProduct?.price}</strong></span>
              <span>Sale Price: <strong className="text-emerald-400 font-mono font-bold text-sm">${calculatedPrice.toFixed(2)}</strong></span>
            </div>
            
            <div className="text-[11px] text-amber-200/90 flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Ends on: {targetDate.toLocaleString()}</span>
            </div>

            <FlashSaleTimer
              endsAt={targetDate.toISOString()}
              discountPercentage={discountPercent}
              compact={false}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            {currentProduct?.flash_discount_percentage && currentProduct.flash_discount_percentage > 0 ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancelFlashSale}
                disabled={submitting}
                className="text-xs"
              >
                Cancel Active Sale
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="border-zinc-700 text-zinc-300"
            >
              Close
            </Button>

            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold flex items-center gap-2"
            >
              <Zap className="w-4 h-4 fill-black" />
              {submitting ? "Activating..." : "⚡ Activate Flash Sale"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
