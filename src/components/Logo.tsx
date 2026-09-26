import React, { useState, useEffect } from "react";
import logoImg from "@/assets/images/market_logo_1784884442864.jpg";
import { safeJson } from "@/lib/utils";

export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  const [currentLogo, setCurrentLogo] = useState<string>(() => {
    return localStorage.getItem("aurevyxon_site_logo") || logoImg;
  });

  useEffect(() => {
    // Sync with server site settings on mount
    fetch("/api/site-settings")
      .then((res) => safeJson(res))
      .then((data) => {
        if (data && data.logo_url) {
          setCurrentLogo(data.logo_url);
          localStorage.setItem("aurevyxon_site_logo", data.logo_url);
        }
      })
      .catch(() => {});

    const handleLogoUpdate = (e: any) => {
      if (e.detail) {
        setCurrentLogo(e.detail);
      } else {
        const stored = localStorage.getItem("aurevyxon_site_logo");
        if (stored) setCurrentLogo(stored);
        else setCurrentLogo(logoImg);
      }
    };

    window.addEventListener("site_logo_updated", handleLogoUpdate);
    return () => window.removeEventListener("site_logo_updated", handleLogoUpdate);
  }, []);

  return (
    <img 
      src={currentLogo} 
      alt="Aurevyxon Logo" 
      onError={() => {
        if (currentLogo !== logoImg) {
          setCurrentLogo(logoImg);
        }
      }}
      className={`object-cover rounded-xl shadow-[0_0_15px_rgba(0,150,255,0.3)] border border-blue-500/30 ${className}`} 
      referrerPolicy="no-referrer"
    />
  );
}

