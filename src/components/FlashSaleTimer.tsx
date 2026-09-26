import React, { useState, useEffect } from "react";
import { Clock, Zap } from "lucide-react";

interface FlashSaleTimerProps {
  endsAt: string | number | Date;
  discountPercentage: number;
  onExpire?: () => void;
  compact?: boolean;
}

export function FlashSaleTimer({ endsAt, discountPercentage, onExpire, compact = false }: FlashSaleTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    if (!endsAt) return;

    const calculate = () => {
      const target = new Date(endsAt).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        if (onExpire) onExpire();
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (timeLeft.isExpired || !endsAt) return null;

  const pad = (num: number) => String(num).padStart(2, "0");

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-semibold">
        <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" />
        <span>{discountPercentage}% OFF</span>
        <span className="text-gray-500">|</span>
        <Clock className="w-3 h-3 text-amber-400" />
        <span>
          {timeLeft.days > 0 ? `${timeLeft.days}d ` : ""}
          {pad(timeLeft.hours)}h:{pad(timeLeft.minutes)}m:{pad(timeLeft.seconds)}s
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/40 rounded-xl p-3.5 shadow-[0_0_25px_rgba(245,158,11,0.2)]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs uppercase tracking-wider">
          <Zap className="w-4 h-4 fill-amber-400 text-amber-400 animate-bounce" />
          <span>⚡ Flash Sale Special ({discountPercentage}% OFF)</span>
        </div>
        <span className="text-[10px] text-amber-200/80 font-mono">Offer Ends In</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-black/60 border border-amber-500/30 rounded-lg p-2 shadow-inner">
          <span className="block font-mono font-bold text-xl text-amber-300">{pad(timeLeft.days)}</span>
          <span className="text-[9px] text-gray-400 uppercase font-sans font-semibold">Days</span>
        </div>
        <div className="bg-black/60 border border-amber-500/30 rounded-lg p-2 shadow-inner">
          <span className="block font-mono font-bold text-xl text-amber-300">{pad(timeLeft.hours)}</span>
          <span className="text-[9px] text-gray-400 uppercase font-sans font-semibold">Hours</span>
        </div>
        <div className="bg-black/60 border border-amber-500/30 rounded-lg p-2 shadow-inner">
          <span className="block font-mono font-bold text-xl text-amber-300">{pad(timeLeft.minutes)}</span>
          <span className="text-[9px] text-gray-400 uppercase font-sans font-semibold">Mins</span>
        </div>
        <div className="bg-black/60 border border-amber-500/30 rounded-lg p-2 shadow-inner">
          <span className="block font-mono font-bold text-xl text-amber-300">{pad(timeLeft.seconds)}</span>
          <span className="text-[9px] text-gray-400 uppercase font-sans font-semibold">Secs</span>
        </div>
      </div>
    </div>
  );
}
