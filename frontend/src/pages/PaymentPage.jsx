import { useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";

const PaymentPage = () => {
  const { items, subtotal, totalItems } = useCart();
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Calculate values
  const shippingAmount = useMemo(
    () => (items.length > 0 ? 4.95 : 0),
    [items.length]
  );

  const subtotalValue = Number.isFinite(subtotal) ? subtotal : 0;
  const total = subtotalValue + shippingAmount;

  // --- HANDLE PAYMENT ---
  const handlePayNow = async () => {
    try {
      setIsPaying(true);
      setPaymentError(null);

      // Prevent duplicate mounts
      const widgetContainer = document.getElementById("sumup-card");
      widgetContainer.innerHTML = "";

      // 1️⃣ Create checkout in backend
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/payments/sumup/create_checkout`,
        {
          amount: total,
          email: "customer@example.com", // Replace later with real data
          name: "Web Customer",
        }
      );

      const checkoutId = res.data.checkout_id;

      if (!checkoutId) {
        setPaymentError("No checkout ID returned from the server.");
        return;
      }

      // 2️⃣ Ensure SumUp widget loaded
      if (!window.SumUpCard) {
        setPaymentError("Could not load SumUp payment widget.");
        return;
      }

      // 3️⃣ Mount widget
      window.SumUpCard.mount({
        id: "sumup-card",
        checkoutId,
        onResponse: (type, body) => {
          console.log("SUMUP RESPONSE:", type, body);

          if (type === "success") {
            window.location.href = "/payment/success";
            return;
          }

          const message =
            body?.message ||
            body?.error_message ||
            body?.errors?.[0]?.message ||
            "Payment failed. Please check your card details.";

          setPaymentError(message);
        },
      });
    } catch (err) {
      console.error("Payment error:", err);
      setPaymentError("Unable to start payment.");
    } finally {
      setIsPaying(false);
    }
  };

  // Format labels
  const cartSubtotalLabel = formatEuro(subtotalValue);
  const shippingLabel = shippingAmount ? formatEuro(shippingAmount) : "Free";
  const totalLabel = formatEuro(total);

  return (
    <section className="page checkout-page payment-page">
      <header className="page__intro">
        <p className="eyebrow">Payment</p>
        <h1 className="page__title">Confirm your payment details</h1>
        <p className="page__subtitle">
          Enter your card details securely with SumUp to finish your order.
        </p>
      </header>

      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-section">
            <div>
              <p className="eyebrow eyebrow--muted">Step 3</p>
              <h2>Payment details</h2>
              <p className="checkout-section__subtitle">
                Use the SumUp card widget below to complete your purchase.
              </p>
            </div>

            <div className="checkout-card checkout-card__note">
              <p>All payments are processed securely via SumUp.</p>
            </div>

            <label className="checkout-save">
              <input
                type="checkbox"
                checked={billingSameAsDelivery}
                onChange={() =>
                  setBillingSameAsDelivery((prev) => !prev)
                }
              />
              <span>Billing address matches delivery</span>
            </label>
          </div>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-summary__header">
            <h2>Order summary</h2>
            <p>
              {totalItems} item{totalItems === 1 ? "" : "s"}
            </p>
          </div>

          {items.length === 0 ? (
            <p className="checkout-summary__empty-note">
              Your cart is currently empty.{" "}
              <Link to="/products" className="link-highlight">
                Browse the collection.
              </Link>
            </p>
          ) : (
            <ul className="checkout-summary__list">
              {items.map((item) => {
                const lineTotal = formatEuro(
                  item.price * item.quantity
                );
                return (
                  <li
                    key={`${item.id}-${item.variationId || "base"}`}
                    className="checkout-summary__item"
                  >
                    <div className="checkout-summary__item-info">
                      <p className="checkout-summary__item-name">
                        {item.name}
                      </p>
                      {item.variationName && (
                        <p className="checkout-summary__item-variation">
                          Variation: {item.variationName}
                        </p>
                      )}
                      <p className="checkout-summary__item-meta">
                        Qty {item.quantity} &middot;{" "}
                        {formatEuro(item.price)}
                      </p>
                    </div>
                    <span className="checkout-summary__item-total">
                      {lineTotal}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="checkout-summary__row">
            <span>Subtotal</span>
            <span>{cartSubtotalLabel}</span>
          </div>

          <div className="checkout-summary__row">
            <span>Shipping</span>
            <span>{shippingLabel}</span>
          </div>

          <div className="checkout-summary__row checkout-summary__row--total">
            <span>Total</span>
            <span>{totalLabel}</span>
          </div>

          <p className="checkout-summary__footnote">
            Need to adjust your bag?{" "}
            <Link to="/cart" className="link-highlight">
              Return to cart.
            </Link>
          </p>

          <div className="checkout-section">
            <h3>Payment</h3>
            <p className="checkout-section__subtitle">
              The SumUp card widget will load below after you start
              payment.
            </p>

            {/* 4️⃣ SUMUP CARD WIDGET MOUNTS HERE */}
            <div id="sumup-card" style={{ marginTop: "20px" }}></div>

            <button
              type="button"
              className="button button--gradient"
              onClick={handlePayNow}
              disabled={isPaying}
              style={{ marginTop: "1rem" }}
            >
              {isPaying ? "Processing..." : "PAY NOW"}
            </button>

            {paymentError && (
              <p style={{ color: "red", marginTop: "10px" }}>
                {paymentError}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
};

export default PaymentPage;
