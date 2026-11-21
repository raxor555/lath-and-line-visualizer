"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Sparkles } from "lucide-react";

export default function AppHeader() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (installed PWA)
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert("To install on iOS / Safari: Tap 'Share' button and select 'Add to Home Screen' 📲\n\nTo install on Chrome / Edge: Click the install icon in the URL bar.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 sm:px-6 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#181412]/85 px-4 py-2 backdrop-blur-md border border-white/10 shadow-lg text-white">
        <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-medium text-[13px] tracking-tight">Lath &amp; Line</span>
        <span className="rounded-full bg-[#e06d3b]/20 px-2 py-0.5 font-mono text-[10px] text-[#e06d3b] uppercase font-semibold">
          3D Studio
        </span>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {!isInstalled && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-medium text-black transition hover:bg-[#e3dbd1] shadow-lg cursor-pointer"
            title="Install as desktop app or add to phone home screen"
          >
            <Download className="size-3.5 text-[#e06d3b]" />
            <span className="hidden sm:inline">Install App</span>
            <span className="sm:hidden">Install</span>
          </button>
        )}

        <a
          href="https://lath-and-line-studio.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-[#181412]/85 px-3.5 py-2 text-[12px] font-medium text-white/80 transition hover:text-white hover:bg-[#251f1b] border border-white/10 backdrop-blur-md shadow-lg"
          title="Visit Lath & Line Catalog Store"
        >
          <span>Store</span>
          <ExternalLink className="size-3 opacity-60" />
        </a>
      </div>
    </header>
  );
}
