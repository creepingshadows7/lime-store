import { useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

const Cart = () => {
  const { isAuthenticated } = useAuth();
  const [items] = useState(["lime-ade"]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const handleCheckout = async () => {
    setStatus("loading");
    setMessage("");

    try {
      const { data } = await apiClient.post("/api/checkout", { items });
      setMessage(data.message);
      setStatus("success");
    } catch (err) {
      if (err.response?.status === 401) {
        setMessage("You need to log in before checking out.");
      } else {
        setMessage("Checkout failed. Try again later.");
      }
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
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="checkout-card__note">
            To add more items, visit the{" "}
            <Link to="/products" className="link-highlight">
              product collection.
            </Link>
          </p>
        </div>
        <button
          type="button"
          className="button button--gradient checkout-card__cta"
          onClick={handleCheckout}
          disabled={status === "loading" || !isAuthenticated}
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
                : " form-feedback--success"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
};

export default Cart;
