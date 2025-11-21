import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";

const loadStoredContact = () => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const rawValue = window.localStorage.getItem("limeCheckoutContact");
    if (!rawValue) {
      return {};
    }
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const PaymentPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { items, subtotal, totalItems } = useCart();
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [checkoutId, setCheckoutId] = useState("");
  const [orderTrackingId, setOrderTrackingId] = useState("");

  const storedContact = useMemo(() => loadStoredContact(), []);

  const shippingAmount = useMemo(
    () => (items.length > 0 ? 4.95 : 0),
    [items.length]
  );

  const subtotalValue = Number.isFinite(subtotal) ? subtotal : 0;
  const total = subtotalValue + shippingAmount;

  const orderItems = useMemo(() => {
    const mapped = items.map((item) => ({
      id: item.id,
      productId: item.id,
      quantity: item.quantity,
      name: item.name,
      price: item.price,
      variationId: item.variationId,
      variationName: item.variationName,
      imageUrl: item.imageUrl,
    }));

    if (shippingAmount) {
      mapped.push({
        id: "shipping",
        productId: "shipping",
        quantity: 1,
        name: "Shipping",
        price: shippingAmount,
      });
    }

    return mapped;
  }, [items, shippingAmount]);

  const customerName =
    (profile?.name && profile.name.trim()) ||
    (storedContact.name && storedContact.name.trim()) ||
    "Web Customer";
  const customerEmail =
    (profile?.email && profile.email.trim()) ||
    (storedContact.email && storedContact.email.trim()) ||
    "";

  const cartSubtotalLabel = formatEuro(subtotalValue);
  const shippingLabel = shippingAmount ? formatEuro(shippingAmount) : "Free";
  const totalLabel = formatEuro(total);

  const finalizeOrder = useCallback(
    async (nextCheckoutId, nextOrderId) => {
      setPaymentError(null);
      setIsPaying(true);

      try {
        const payload = {
          checkoutId: nextCheckoutId,
          orderId: nextOrderId,
          items: orderItems,
          total,
          currency: "EUR",
          email: customerEmail || undefined,
          name: customerName,
        };
        const { data } = await apiClient.post("/api/orders/create", payload);
        const persistedOrder =
          data?.order?.orderId || data?.order?.id || nextOrderId || nextCheckoutId;

        try {
          window.localStorage.removeItem("limeCheckoutContact");
          window.localStorage.removeItem("limeCheckoutAddress");
        } catch {
          // Ignore storage clean-up errors.
        }

        const targetOrderId = persistedOrder || nextOrderId || nextCheckoutId;
        navigate(
          `/payment/success?orderId=${encodeURIComponent(targetOrderId)}`,
          {
            replace: true,
            state: { orderId: targetOrderId, order: data?.order },
          }
        );
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "We could not confirm your order yet. Please contact support if this persists.";
        setPaymentError(message);
      } finally {
        setIsPaying(false);
      }
    },
    [customerEmail, customerName, navigate, orderItems, total]
  );

  // --- HANDLE PAYMENT ---
  const handlePayNow = async () => {
    if (!orderItems.length) {
      setPaymentError("Your cart is empty. Add items before paying.");
      return;
    }

    try {
      setIsPaying(true);
      setPaymentError(null);

      const widgetContainer = document.getElementById("sumup-card");
      if (widgetContainer) {
        widgetContainer.innerHTML = "";
      }

      const { data } = await apiClient.post(
        "/api/payments/sumup/create_checkout",
        {
          amount: total,
          currency: "EUR",
          orderId: orderTrackingId || undefined,
          email: customerEmail,
          name: customerName,
        }
      );

      const checkoutIdValue = data?.checkout_id;
      const orderIdentifier =
        data?.order_id || data?.orderId || orderTrackingId || checkoutIdValue;

      if (!checkoutIdValue) {
        setPaymentError("No checkout ID returned from the server.");
        setIsPaying(false);
        return;
      }

      setCheckoutId(checkoutIdValue);
      setOrderTrackingId(orderIdentifier);

      if (!window.SumUpCard) {
        setPaymentError("Could not load SumUp payment widget.");
        setIsPaying(false);
        return;
      }

      window.SumUpCard.mount({
        id: "sumup-card",
        checkoutId: checkoutIdValue,
        onResponse: (type, body) => {
          if (type === "success") {
            finalizeOrder(checkoutIdValue, orderIdentifier);
            return;
          }

          const message =
            body?.message ||
            body?.error_message ||
            body?.errors?.[0]?.message ||
            "Payment failed. Please check your card details.";

          setPaymentError(message);
          setIsPaying(false);
        },
      });
    } catch (err) {
      console.error("Payment error:", err);
      setPaymentError(
        err.response?.data?.message ?? "Unable to start payment right now."
      );
      setIsPaying(false);
    }
  };

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
              {customerEmail ? (
                <p className="checkout-section__subtitle">
                  Receipt will be sent to <strong>{customerEmail}</strong>.
                </p>
              ) : (
                <p className="checkout-section__subtitle">
                  Add an email on the previous step to receive your receipt.
                </p>
              )}
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
            {checkoutId ? (
              <p className="checkout-section__subtitle">
                Checkout ID: {checkoutId}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
};

export default PaymentPage;
