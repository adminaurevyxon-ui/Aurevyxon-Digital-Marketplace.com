import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { safeJson } from "./utils";
import { onAuthStateChanged, signInWithPopup, getRedirectResult, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "./firebase";
import { persistUserToFirestore } from "./firestoreService";
import { useNavigate } from "react-router-dom";

type User = { 
  id: string; 
  name: string; 
  email: string; 
  role?: string; 
  photoURL?: string; 
  avatar_url?: string; 
  seller_profile?: any; 
  country?: string;
  status?: string;
  deletion_reason?: string;
  deleted_at?: string;
  deleted_by?: string;
  is_banned?: number;
  is_suspended?: number;
  is_deleted?: boolean;
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  authError: string | null;
  login: () => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<User>;
  registerWithCredentials: (name: string, email: string, password: string, country?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  authError: null,
  login: async () => {},
  loginWithCredentials: async () => ({} as any),
  registerWithCredentials: async () => ({} as any),
  logout: async () => {},
  refreshUser: async () => {},
  clearError: () => {},
  isAuthenticated: false,
  isLoading: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  
  // Initialize state immediately from localStorage cache for instant, zero-flicker loading
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aurevyxon_token") || null;
    } catch (e) {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem("aurevyxon_user");
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setAuthSession = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    try {
      localStorage.setItem("aurevyxon_token", newToken);
      localStorage.setItem("aurevyxon_user", JSON.stringify(newUser));
    } catch (e) {}
  };

  const clearAuthSession = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("aurevyxon_token");
      localStorage.removeItem("aurevyxon_user");
    } catch (e) {}
  };

  const refreshUser = async () => {
    const currentToken = token || localStorage.getItem("aurevyxon_token");
    if (!currentToken) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data && data.user) {
          setAuthSession(currentToken, data.user);
        }
      }
    } catch (e) {
      console.warn("Failed to refresh user profile:", e);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Firebase Auth persistence initialization error:", err);
    });

    const checkRedirect = async () => {
      try {
        await getRedirectResult(auth);
      } catch (err: any) {
        console.error("Redirect login error:", err);
        setAuthError(err.message);
      }
    };
    checkRedirect();

    // Verify current session with server in background
    const localToken = localStorage.getItem("aurevyxon_token");
    if (localToken) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${localToken}` }
      })
        .then(res => res.ok ? safeJson(res) : null)
        .then(data => {
          if (data && data.user) {
            setAuthSession(localToken, data.user);
          }
        })
        .catch(err => console.warn("Initial session fetch error:", err));
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch("/api/auth/firebase-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
          });
          
          if (!res.ok) { 
            const text = await res.text().catch(() => "");
            throw new Error(`Backend authentication failed: ${res.status} ${text}`); 
          }
          
          const data = await safeJson(res);
          if (data && data.token && data.user) {
            setAuthSession(data.token, data.user);
          }
        } catch (err: any) {
          console.warn("Auth sync error:", err);
          if (err?.message && !err.message.toLowerCase().includes("fetch")) {
            setAuthError(err.message || "Failed to sync with backend");
          }
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithCredentials = async (email: string, password: string): Promise<User> => {
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Login failed. Please check your credentials.");
      }
      setAuthSession(data.token, data.user);
      return data.user;
    } catch (err: any) {
      setAuthError(err.message || "Login failed");
      throw err;
    }
  };

  const registerWithCredentials = async (name: string, email: string, password: string, country?: string): Promise<User> => {
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, country })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Registration failed");
      }
      setAuthSession(data.token, data.user);
      return data.user;
    } catch (err: any) {
      setAuthError(err.message || "Registration failed");
      throw err;
    }
  };

  const login = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login Error:", error);
      setAuthError(error.message || "Failed to sign in");
      throw error;
    }
  };

  const logout = async () => {
    try {
      clearAuthSession();
      setAuthError(null);
      await signOut(auth).catch(() => {});
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      navigate("/", { replace: true });
    }
  };

  const clearError = () => setAuthError(null);

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      authError, 
      login, 
      loginWithCredentials,
      registerWithCredentials,
      logout, 
      refreshUser, 
      clearError, 
      isAuthenticated: !!user, 
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
