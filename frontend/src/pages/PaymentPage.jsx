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

const loadStoredAddress = () => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const rawValue = window.localStorage.getItem("limeCheckoutAddress");
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
  const { items, subtotal, totalItems, clearCart } = useCart();
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const storedContact = useMemo(() => loadStoredContact(), []);
  const storedAddress = useMemo(() => loadStoredAddress(), []);

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

  const handlePayNow = useCallback(async () => {
    if (!orderItems.length) {
      setPaymentError("Your cart is empty. Add items before paying.");
      return;
    }

    setIsPaying(true);
    setPaymentError(null);

    const shippingAddressPayload =
      storedAddress && Object.keys(storedAddress).length > 0
        ? storedAddress
        : undefined;

    try {
      const payload = {
        items: orderItems,
        customer: {
          name: customerName,
          email: customerEmail || undefined,
        },
        shippingAddress: shippingAddressPayload,
      };

      // Call the real SumUp endpoint
      const { data } = await apiClient.post(
        "/api/payments/sumup/create_checkout",
        payload
      );

      // Redirect to SumUp Hosted Checkout
      const checkoutId = data.checkout_id;
      const nextUrl = data.sumup_data?.next_step?.url ||
        data.sumup_data?.redirect_url ||
        data.sumup_data?.hosted_checkout_url ||
        `https://checkout.sumup.com/page/${checkoutId}`;

      if (nextUrl) {
        // Clear cart and storage before redirecting
        try {
          window.localStorage.removeItem("limeCheckoutContact");
          window.localStorage.removeItem("limeCheckoutAddress");
        } catch {
          // Ignore storage clean-up errors.
        }
        clearCart();

        window.location.href = nextUrl;
      } else {
        throw new Error("Could not determine payment URL.");
      }

    } catch (err) {
      console.error("Payment error:", err);
      setPaymentError(
        err.response?.data?.error ??
        err.response?.data?.message ??
        "Unable to process your payment right now. Please try again."
      );
    } finally {
      setIsPaying(false);
    }
  }, [
    clearCart,
    customerEmail,
    customerName,
    navigate,
    orderItems,
    storedAddress,
    total,
  ]);

  return (
    <section className="page checkout-page payment-page">
      <header className="page__intro">
        <p className="eyebrow">Payment</p>
        <h1 className="page__title">Confirm your order</h1>
        <p className="page__subtitle">
          This is a test checkout. We will create your order instantly and send a
          confirmation email.
        </p>
      </header>

      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-section">
            <div>
              <p className="eyebrow eyebrow--muted">Final step</p>
              <h2>Review and confirm</h2>
              <p className="checkout-section__subtitle">
                No real payment is processed. Clicking the button below will
                mark your order as paid and trigger the receipt email.
              </p>
            </div>

            <div className="checkout-card checkout-card__note">
              <p>Ready to finish? We&apos;ll place your order right away.</p>
              {customerEmail ? (
                <p className="checkout-section__subtitle">
                  Receipt will be sent to <strong>{customerEmail}</strong>.
                </p>
              ) : (
                <p className="checkout-section__subtitle">
                  Add an email in the checkout step to receive your receipt.
                </p>
              )}
            </div>
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
                const lineTotal = formatEuro(item.price * item.quantity);
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
              You will be redirected to SumUp to complete your payment securely.
            </p>

            <button
              type="button"
              className="button button--gradient"
              onClick={handlePayNow}
              disabled={isPaying}
              style={{ marginTop: "1rem" }}
            >
              {isPaying ? "Redirecting..." : "Proceed to Payment"}
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
