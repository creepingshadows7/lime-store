import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "limeShopCartItems";
const CART_QTY_MIN = 1;
const CART_QTY_MAX = 99;

const isBrowser = () => typeof window !== "undefined";

const clampQuantity = (quantity) =>
  Math.min(CART_QTY_MAX, Math.max(CART_QTY_MIN, quantity));

const normalizeCartProduct = (product) => {
  if (!product) {
    return null;
  }

  const rawId =
    product.id ??
    product.productId ??
    product._id ??
    (typeof product.slug === "string" ? product.slug : null);
  const id =
    typeof rawId === "string"
      ? rawId.trim()
      : typeof rawId === "number"
      ? String(rawId)
      : "";
  const name =
    typeof product.name === "string" ? product.name.trim() : product.title ?? "";
  const price = Number(product.price);
  const imageUrl =
    typeof product.imageUrl === "string"
      ? product.imageUrl.trim()
      : typeof product.image_url === "string"
      ? product.image_url.trim()
      : typeof product.primaryImageUrl === "string"
      ? product.primaryImageUrl.trim()
      : "";

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    price: Number.isFinite(price) ? price : 0,
    imageUrl,
  };
};

const normalizeStoredCartItems = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = [];
  value.forEach((item) => {
    const normalized = normalizeCartProduct(item);
    const quantity = Number(item?.quantity);
    if (!normalized) {
      return;
    }
    const normalizedQuantity = Number.isFinite(quantity)
      ? clampQuantity(Math.round(quantity) || CART_QTY_MIN)
      : CART_QTY_MIN;
    items.push({
      ...normalized,
      quantity: normalizedQuantity,
    });
  });
  return items;
};

const loadStoredCart = () => {
  if (!isBrowser()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }
    const parsed = JSON.parse(rawValue);
    return normalizeStoredCartItems(parsed);
  } catch {
    return [];
  }
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case "ADD_ITEM": {
      const normalizedProduct = normalizeCartProduct(action.payload.product);
      const quantityFromPayload = Number(action.payload.quantity) || 1;
      const normalizedQuantity = clampQuantity(
        Math.round(quantityFromPayload) || CART_QTY_MIN
      );

      if (!normalizedProduct) {
        return state;
      }

      const existingIndex = state.findIndex(
        (item) => item.id === normalizedProduct.id
      );

      if (existingIndex === -1) {
        return [
          ...state,
          { ...normalizedProduct, quantity: normalizedQuantity },
        ];
      }

      return state.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              quantity: clampQuantity(item.quantity + normalizedQuantity),
            }
          : item
      );
    }

    case "UPDATE_QUANTITY": {
      const productId = action.payload.productId?.toString().trim();
      if (!productId) {
        return state;
      }
      const requestedQuantity = Number(action.payload.quantity);
      if (!Number.isFinite(requestedQuantity)) {
        return state;
      }
      if (requestedQuantity < CART_QTY_MIN) {
        return state.filter((item) => item.id !== productId);
      }
      return state.map((item) =>
        item.id === productId
          ? { ...item, quantity: clampQuantity(Math.round(requestedQuantity)) }
          : item
      );
    }

    case "REMOVE_ITEM": {
      const productId = action.payload.productId?.toString().trim();
      if (!productId) {
        return state;
      }
      return state.filter((item) => item.id !== productId);
    }

    case "CLEAR_CART":
      return [];

    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [items, dispatch] = useReducer(cartReducer, [], loadStoredCart);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage failures.
    }
  }, [items]);

  const addItem = useCallback(
    (product, quantity = 1) => {
      dispatch({ type: "ADD_ITEM", payload: { product, quantity } });
    },
    [dispatch]
  );

  const updateQuantity = useCallback(
    (productId, quantity) => {
      dispatch({ type: "UPDATE_QUANTITY", payload: { productId, quantity } });
    },
    [dispatch]
  );

  const removeItem = useCallback(
    (productId) => {
      dispatch({ type: "REMOVE_ITEM", payload: { productId } });
    },
    [dispatch]
  );

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" });
  }, [dispatch]);

  const totals = useMemo(() => {
    return items.reduce(
      (accumulator, item) => {
        const lineTotal = Number(item.price) * item.quantity;
        accumulator.subtotal += Number.isFinite(lineTotal) ? lineTotal : 0;
        accumulator.quantity += item.quantity;
        return accumulator;
      },
      { subtotal: 0, quantity: 0 }
    );
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      subtotal: totals.subtotal,
      totalItems: totals.quantity,
    }),
    [items, addItem, updateQuantity, removeItem, clearCart, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
