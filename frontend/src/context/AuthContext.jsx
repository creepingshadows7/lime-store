import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AUTH_EXPIRED_EVENT } from "../constants";

const AuthContext = createContext(null);

const TOKEN_STORAGE_KEY = "limeShopToken";
const USER_STORAGE_KEY = "limeShopUser";

const getStoredItem = (key) => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
};

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== "string" || typeof atob !== "function") {
    return null;
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }

  const payloadSegment = segments[1];
  const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const paddingRemainder = normalized.length % 4;
  const padded =
    paddingRemainder === 2
      ? `${normalized}==`
      : paddingRemainder === 3
      ? `${normalized}=`
      : normalized;

  try {
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
};

const getTokenExpirationMs = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return null;
  }
  return payload.exp * 1000;
};

const hasTokenExpired = (token) => {
  const expirationMs = getTokenExpirationMs(token);
  if (!expirationMs) {
    return false;
  }
  return expirationMs <= Date.now();
};

const parseStoredProfile = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    return { name: rawValue };
  }

  return null;
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => {
    const storedToken = getStoredItem(TOKEN_STORAGE_KEY);
    if (storedToken && hasTokenExpired(storedToken)) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
      return { token: null, profile: null };
    }

    return {
      token: storedToken,
      profile: parseStoredProfile(getStoredItem(USER_STORAGE_KEY)),
    };
  });

  const { token, profile } = authState;

  const updateCredentials = useCallback((nextToken, nextProfile) => {
    if (typeof window !== "undefined") {
      if (nextToken) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }

      if (nextProfile) {
        window.localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify(nextProfile)
        );
      } else {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
    }

    setAuthState({
      token: nextToken || null,
      profile: nextProfile || null,
    });
  }, []);

  const login = useCallback(
    (nextToken, nextProfile) => {
      updateCredentials(nextToken, nextProfile);
    },
    [updateCredentials]
  );

  const logout = useCallback(() => {
    updateCredentials(null, null);
  }, [updateCredentials]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const expirationMs = getTokenExpirationMs(token);
    if (!expirationMs) {
      return;
    }

    const timeoutMs = expirationMs - Date.now();
    if (timeoutMs <= 0) {
      logout();
      return;
    }

    const timerId = window.setTimeout(() => {
      logout();
    }, timeoutMs);

    return () => window.clearTimeout(timerId);
  }, [logout, token]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleAuthExpired = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      token,
      profile,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [login, logout, profile, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
