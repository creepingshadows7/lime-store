import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

const TOKEN_STORAGE_KEY = "limeShopToken";
const USER_STORAGE_KEY = "limeShopUser";

const getStoredItem = (key) => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
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
  const [token, setToken] = useState(() => getStoredItem(TOKEN_STORAGE_KEY));
  const [profile, setProfile] = useState(() =>
    parseStoredProfile(getStoredItem(USER_STORAGE_KEY))
  );

  const updateCredentials = (nextToken, nextProfile) => {
    if (typeof window === "undefined") {
      return;
    }

    if (nextToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      setToken(nextToken);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
    }

    if (nextProfile) {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
    } else {
      window.localStorage.removeItem(USER_STORAGE_KEY);
      setProfile(null);
    }
  };

  const login = (nextToken, nextProfile) => {
    updateCredentials(nextToken, nextProfile);
  };

  const logout = () => {
    updateCredentials(null, null);
  };

  const value = useMemo(
    () => ({
      token,
      profile,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, profile]
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
