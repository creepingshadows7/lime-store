import { useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";
import { getPricingDetails } from "../utils/pricing";

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

  const handleQuantityInput = (productId, variationId, variationName, value) => {
    if (!productId) {
      return;
    }
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) {
      return;
    }
    resetFeedback();
    updateQuantity(productId, parsed, variationId, variationName);
  };

  const handleAdjustQuantity = (productId, variationId, variationName, nextQuantity) => {
    if (!productId) {
      return;
    }
    resetFeedback();
    updateQuantity(productId, nextQuantity, variationId, variationName);
  };

  const handleRemoveItem = (productId, variationId, variationName) => {
    if (!productId) {
      return;
    }
    resetFeedback();
    removeItem(productId, variationId, variationName);
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
        listPrice: item.listPrice,
        imageUrl: item.imageUrl,
        variationId: item.variationId,
        variationName: item.variationName,
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
                const pricing = getPricingDetails(
                  item.listPrice ?? item.price,
                  item.price
                );
                const unitPriceLabel = pricing.currentLabel;
                const originalPriceLabel = pricing.hasDiscount
                  ? pricing.baseLabel
                  : null;
                const lineTotalLabel = formatEuro(pricing.currentValue * item.quantity);
                return (
                  <li
                    key={`${item.id}-${item.variationId || item.variationName || "default"}`}
                    className="cart-item"
                  >
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
                      <div className="cart-item__price">
                        <div className="price-stack price-stack--compact price-stack--vertical">
                          <span className="price-stack__current">{unitPriceLabel}</span>
                          {pricing.hasDiscount && originalPriceLabel && (
                            <>
                              <span className="price-stack__original">
                                {originalPriceLabel}
                              </span>
                              {pricing.savingsPercent && (
                                <span className="price-stack__badge">
                                  Save {pricing.savingsPercent}%
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <span className="cart-item__price-note">per item</span>
                      </div>
                      {item.variationName && (
                        <p className="cart-item__variation">
                          Variation: {item.variationName}
                        </p>
                      )}
                      <button
                        type="button"
                        className="cart-item__remove"
                        onClick={() =>
                          handleRemoveItem(
                            item.id,
                            item.variationId,
                            item.variationName
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="cart-item__quantity">
                      <button
                        type="button"
                        className="cart-item__control"
                        onClick={() =>
                          handleAdjustQuantity(
                            item.id,
                            item.variationId,
                            item.variationName,
                            item.quantity - 1
                          )
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
                          handleQuantityInput(
                            item.id,
                            item.variationId,
                            item.variationName,
                            event.target.value
                          )
                        }
                        aria-label={`Quantity for ${item.name}`}
                      />
                      <button
                        type="button"
                        className="cart-item__control"
                        onClick={() =>
                          handleAdjustQuantity(
                            item.id,
                            item.variationId,
                            item.variationName,
                            item.quantity + 1
                          )
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
