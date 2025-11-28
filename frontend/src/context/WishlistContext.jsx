import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import apiClient from "../api/client";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);

export const WishlistProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const loadWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setStatus("idle");
      setError("");
      return {
        success: false,
        message: "Please sign in to view your wishlist.",
      };
    }

    setStatus("loading");
    setError("");
    try {
      const { data } = await apiClient.get("/api/wishlist");
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);
      setStatus("success");
      return { success: true, items: nextItems };
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not load your wishlist right now.";
      setError(message);
      setStatus("error");
      return { success: false, message };
    }
  }, [isAuthenticated]);

  const addItem = useCallback(
    async ({ productId, variationId = "", variationName = "" }) => {
      if (!productId || !isAuthenticated) {
        return {
          success: false,
          message: isAuthenticated
            ? "Choose a product to save."
            : "Sign in to save items to your wishlist.",
        };
      }

      try {
        const { data } = await apiClient.post("/api/wishlist", {
          productId,
          variationId,
          variationName,
        });
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);
        setStatus("success");
        return { success: true, items: nextItems, message: data?.message };
      } catch (err) {
        const message =
          err.response?.data?.message ??
          "We could not save that item to your wishlist.";
        setError(message);
        setStatus((prev) => (prev === "idle" ? "error" : prev));
        return { success: false, message };
      }
    },
    [isAuthenticated]
  );

  const removeItem = useCallback(
    async (productId, variationId = "") => {
      if (!productId || !isAuthenticated) {
        return {
          success: false,
          message: isAuthenticated
            ? "Select an item to remove."
            : "Sign in to manage your wishlist.",
        };
      }

      const config =
        variationId && variationId.trim()
          ? { data: { variationId: variationId.trim() } }
          : {};

      try {
        const { data } = await apiClient.delete(
          `/api/wishlist/${productId}`,
          config
        );
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);
        setStatus("success");
        return { success: true, items: nextItems, message: data?.message };
      } catch (err) {
        const message =
          err.response?.data?.message ??
          "We could not update your wishlist right now.";
        setError(message);
        setStatus((prev) => (prev === "idle" ? "error" : prev));
        return { success: false, message };
      }
    },
    [isAuthenticated]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setStatus("idle");
      setError("");
      return;
    }
    loadWishlist();
  }, [isAuthenticated, loadWishlist]);

  const value = useMemo(
    () => ({
      items,
      status,
      error,
      loadWishlist,
      addItem,
      removeItem,
    }),
    [items, status, error, loadWishlist, addItem, removeItem]
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
};
