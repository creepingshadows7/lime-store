import { useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";

const Cart = () => {
  const { isAuthenticated } = useAuth();
  const { items, updateQuantity, removeItem, clearCart, subtotal, totalItems } =
    useCart();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const hasItems = items.length > 0;
  const formattedSubtotal = formatEuro(subtotal);
  const checkoutDisabled =
    status === "loading" || !hasItems || !isAuthenticated;

  const resetFeedback = () => {
    if (status !== "idle") {
      setStatus("idle");
    }
    if (message) {
      setMessage("");
    }
  };

  const handleQuantityInput = (productId, value) => {
    if (!productId) {
      return;
    }
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) {
      return;
    }
    resetFeedback();
    updateQuantity(productId, parsed);
  };

  const handleAdjustQuantity = (productId, nextQuantity) => {
    if (!productId) {
      return;
    }
    resetFeedback();
    updateQuantity(productId, nextQuantity);
  };

  const handleRemoveItem = (productId) => {
    if (!productId) {
      return;
    }
    resetFeedback();
    removeItem(productId);
  };

  const handleCheckout = async () => {
    if (!hasItems) {
      setStatus("error");
      setMessage("Add at least one item before checking out.");
      return;
    }
    if (!isAuthenticated) {
      setStatus("error");
      setMessage("Please log in to complete your order.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const payloadItems = items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
      }));
      const { data } = await apiClient.post("/api/checkout", {
        items: payloadItems,
      });
      setMessage(data?.message ?? "Checkout successful.");
      setStatus("success");
      clearCart();
    } catch (err) {
      const nextMessage =
        err.response?.status === 401
          ? "You need to log in before checking out."
          : err.response?.data?.message ?? "Checkout failed. Try again later.";
      setMessage(nextMessage);
      setStatus("error");
    }
  };

  return (
    <section className="page cart-page">
      <header className="page__intro">
        <p className="eyebrow">Curate Your Selection</p>
        <h1 className="page__title">Cart</h1>
        <p className="page__subtitle">
          Review your indulgent lime delicacies. When you are ready, proceed to
          finalize your purchase with concierge-level care.
        </p>
      </header>

      <div className="checkout-card">
        <div className="checkout-card__items">
          <h2>Your Cart</h2>
          {!hasItems ? (
            <div className="cart-empty">
              <p>Your cart is currently empty.</p>
              <Link to="/products" className="button button--outline">
                Discover products
              </Link>
            </div>
          ) : (
            <ul className="cart-items">
              {items.map((item) => {
                const unitPriceLabel = formatEuro(item.price);
                const lineTotalLabel = formatEuro(item.price * item.quantity);
                return (
                  <li key={item.id} className="cart-item">
                    <div className="cart-item__media" aria-hidden="true">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          className="cart-item__image"
                        />
                      ) : (
                        <span className="cart-item__placeholder">Lime</span>
                      )}
                    </div>
                    <div className="cart-item__details">
                      <h3>{item.name}</h3>
                      <p className="cart-item__price">{unitPriceLabel} each</p>
                      <button
                        type="button"
                        className="cart-item__remove"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="cart-item__quantity">
                      <button
                        type="button"
                        className="cart-item__control"
                        onClick={() =>
                          handleAdjustQuantity(item.id, item.quantity - 1)
                        }
                        aria-label={`Decrease quantity for ${item.name}`}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={item.quantity}
                        onChange={(event) =>
                          handleQuantityInput(item.id, event.target.value)
                        }
                        aria-label={`Quantity for ${item.name}`}
                      />
                      <button
                        type="button"
                        className="cart-item__control"
                        onClick={() =>
                          handleAdjustQuantity(item.id, item.quantity + 1)
                        }
                        aria-label={`Increase quantity for ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                    <div className="cart-item__line-total">
                      {lineTotalLabel}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="checkout-card__note">
            To add more items, visit the{" "}
            <Link to="/products" className="link-highlight">
              product collection.
            </Link>
          </p>
        </div>
        <aside className="cart-summary">
          <div className="cart-summary__row">
            <span>Items</span>
            <span>{totalItems}</span>
          </div>
          <div className="cart-summary__row cart-summary__row--total">
            <span>Total</span>
            <span>{formattedSubtotal}</span>
          </div>
          <button
            type="button"
            className="button button--gradient checkout-card__cta"
            onClick={handleCheckout}
            disabled={checkoutDisabled}
          >
            {status === "loading" ? "Processing..." : "Complete Purchase"}
          </button>
          {!isAuthenticated && (
            <p className="form-feedback form-feedback--warning">
              Please log in to complete your order.
            </p>
          )}
          {message && (
            <p
              className={`form-feedback${
                status === "error"
                  ? " form-feedback--error"
                  : status === "success"
                  ? " form-feedback--success"
                  : ""
              }`}
            >
              {message}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
};

export default Cart;
