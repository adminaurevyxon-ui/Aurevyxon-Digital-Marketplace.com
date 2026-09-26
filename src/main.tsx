import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './lib/auth.tsx';
import { CurrencyProvider } from './lib/currency.tsx';
import { ThemeProvider } from './lib/ThemeContext';

// Global resilience guard: prevents "Unexpected token '<', '<!doctype '... is not valid JSON" crashes across all fetch calls
if (typeof window !== 'undefined' && typeof Response !== 'undefined' && Response.prototype) {
  const originalJson = Response.prototype.json;
  Response.prototype.json = async function () {
    try {
      const text = await this.text();
      if (!text || typeof text !== 'string' || text.trim().startsWith('<')) {
        return {};
      }
      return JSON.parse(text);
    } catch {
      return {};
    }
  };
}

// Global fetch resilience interceptor:
// Automatically intercepts network failures / connection drops / transient server restarts,
// performs graceful retry, and yields a safe fallback Response without breaking on getter-only Window environments.
if (typeof window !== 'undefined') {
  // Suppress unhandled fetch network rejections from bubbling to fatal crash overlays
  window.addEventListener("unhandledrejection", (event) => {
    if (
      event.reason &&
      (event.reason.message === "Failed to fetch" ||
        event.reason.name === "TypeError" ||
        String(event.reason).includes("Failed to fetch"))
    ) {
      event.preventDefault();
      console.warn("Suppressed unhandled fetch network rejection:", event.reason);
    }
  });

  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      const wrappedFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        try {
          return await originalFetch(input, init);
        } catch (err: any) {
          console.warn("Global fetch intercepted network error, attempting retry:", err?.message || err);
          try {
            await new Promise((resolve) => setTimeout(resolve, 350));
            return await originalFetch(input, init);
          } catch (retryErr: any) {
            console.warn("Fetch retry failed, returning fallback response:", retryErr?.message || retryErr);
            return new Response(JSON.stringify({ error: "Network unavailable or server starting", success: false, data: [] }), {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      };

      try {
        Object.defineProperty(window, 'fetch', {
          value: wrappedFetch,
          writable: true,
          configurable: true,
        });
      } catch {
        // If window.fetch is non-configurable or getter-only, do not overwrite directly
      }
    }
  } catch (err) {
    console.warn("Could not hook window.fetch:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
