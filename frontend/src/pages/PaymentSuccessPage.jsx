import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";

const PaymentSuccessPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const initialOrderState = location.state?.order || null;
  const initialOrderId =
    location.state?.orderId ||
    location.state?.order?.orderId ||
    new URLSearchParams(location.search).get("orderId") ||
    "";

  const [orderId, setOrderId] = useState(initialOrderId);
  const [order, setOrder] = useState(initialOrderState);
  const [status, setStatus] = useState(initialOrderState ? "success" : "idle");
  const [feedback, setFeedback] = useState("");
  const hasClearedCart = useRef(false);

  useEffect(() => {
    const queryOrderId =
      new URLSearchParams(location.search).get("orderId") || "";
    if (!orderId && queryOrderId) {
      setOrderId(queryOrderId);
    }
  }, [location.search, orderId]);

  useEffect(() => {
    const fetchOrder = async (identifier) => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get(`/api/orders/${identifier}`);
        if (data?.order) {
          setOrder(data.order);
          setStatus("success");
        } else {
          setStatus("error");
          setFeedback("We could not load your order details.");
        }
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "We could not find that order. Please contact support.";
        setStatus("error");
        setFeedback(message);
      }
    };

    if (orderId && (!order || order.orderId !== orderId)) {
      fetchOrder(orderId);
    } else if (orderId && order) {
      setStatus("success");
    } else if (!orderId) {
      setStatus("error");
      setFeedback("No order was found for this payment.");
    }
  }, [order, orderId]);

  useEffect(() => {
    if (
      status === "success" &&
      order &&
      !hasClearedCart.current &&
      (order.paymentStatus || "paid").toLowerCase() === "paid"
    ) {
      clearCart();
      hasClearedCart.current = true;
    }
  }, [clearCart, order, status]);

  const createdAtLabel = useMemo(() => {
    if (!order?.createdAt) {
      return "--";
    }
    const parsed = new Date(order.createdAt);
    return Number.isNaN(parsed.getTime())
      ? order.createdAt
      : parsed.toLocaleString();
  }, [order?.createdAt]);

  const orderTotalLabel = formatEuro(order?.total ?? 0);

  const resolvedOrderId = order?.orderId || orderId || order?.id || "";

  if (status === "loading") {
    return (
      <section className="page payment-page">
        <header className="page__intro">
          <p className="eyebrow">Payment success</p>
          <h1 className="page__title">Retrieving your order...</h1>
        </header>
        <p className="page__status">Loading your order details.</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="page payment-page">
        <header className="page__intro">
          <p className="eyebrow">Payment</p>
          <h1 className="page__title">We could not confirm the order</h1>
          <p className="page__subtitle">{feedback}</p>
        </header>
        <div className="checkout-card checkout-card__note">
          <p>
            If you were charged, please reach out to{" "}
            <a href="mailto:orders@limeshop.store" className="link-highlight">
              orders@limeshop.store
            </a>{" "}
            with your receipt and this order ID: {resolvedOrderId || "N/A"}.
          </p>
          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="button button--outline"
              onClick={() => navigate("/cart")}
            >
              Return to cart
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page payment-page">
      <header className="page__intro">
        <p className="eyebrow">Payment success</p>
        <h1 className="page__title">Thank you for your order!</h1>
        <p className="page__subtitle">
          Your purchase has been processed. A receipt has been sent to your
          email if one was provided.
        </p>
      </header>

      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-section">
            <div className="checkout-card">
              <p className="eyebrow eyebrow--muted">Order ID</p>
              <h3 style={{ wordBreak: "break-all" }}>{resolvedOrderId}</h3>
              <p className="checkout-section__subtitle">Placed on {createdAtLabel}</p>
              <p className="checkout-section__subtitle">
                Payment status:{" "}
                <strong>{(order?.paymentStatus || "Paid").toUpperCase()}</strong>
              </p>
            </div>
          </div>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-summary__header">
            <h2>What you purchased</h2>
            <p>
              {order?.itemCount || order?.items?.length || 0} item
              {(order?.itemCount || order?.items?.length || 0) === 1 ? "" : "s"}
            </p>
          </div>

          {!order?.items?.length ? (
            <p className="checkout-summary__empty-note">
              We could not find the items for this order.
            </p>
          ) : (
            <ul className="checkout-summary__list">
              {order.items.map((item, index) => (
                <li
                  key={`${item.productId || item.name}-${index}`}
                  className="checkout-summary__item"
                >
                  <div className="checkout-summary__item-info">
                    <p className="checkout-summary__item-name">
                      {item.name}
                    </p>
                    {item.variationName ? (
                      <p className="checkout-summary__item-variation">
                        Option: {item.variationName}
                      </p>
                    ) : null}
                    <p className="checkout-summary__item-meta">
                      Qty {item.quantity} &middot;{" "}
                      {formatEuro(item.price ?? 0)}
                    </p>
                  </div>
                  <span className="checkout-summary__item-total">
                    {formatEuro((item.price ?? 0) * (item.quantity ?? 1))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="checkout-summary__row checkout-summary__row--total">
            <span>Total paid</span>
            <span>{orderTotalLabel}</span>
          </div>

          <div className="checkout-summary__row">
            <span>Placed</span>
            <span>{createdAtLabel}</span>
          </div>

          <div className="checkout-summary__row">
            <span>Order ID</span>
            <span>{resolvedOrderId}</span>
          </div>

          <div className="checkout-summary__row">
            <span>Currency</span>
            <span>{order?.currency || "EUR"}</span>
          </div>

          <div className="checkout-actions" style={{ marginTop: "18px" }}>
            <Link to="/products" className="button button--gradient">
              Continue shopping
            </Link>
            <Link to="/my-orders" className="button button--outline">
              View my orders
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default PaymentSuccessPage;
