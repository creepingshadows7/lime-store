import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatEuro } from "../utils/currency";

const MyOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { next: `/my-orders/${orderId}` },
      });
      return;
    }

    const fetchOrder = async () => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get(`/api/orders/${orderId}`);
        if (data?.order) {
          setOrder(data.order);
          setStatus("success");
        } else {
          setStatus("error");
          setFeedback("Order not found.");
        }
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "We could not load that order. Please try again.";
        setFeedback(message);
        setStatus("error");
      }
    };

    fetchOrder();
  }, [isAuthenticated, navigate, orderId]);

  const createdAtLabel = useMemo(() => {
    if (!order?.createdAt) {
      return "--";
    }
    const parsed = new Date(order.createdAt);
    return Number.isNaN(parsed.getTime())
      ? order.createdAt
      : parsed.toLocaleString();
  }, [order?.createdAt]);

  if (status === "loading") {
    return (
      <section className="page">
        <header className="page__intro">
          <p className="eyebrow">Order</p>
          <h1 className="page__title">Loading order...</h1>
        </header>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="page">
        <header className="page__intro">
          <p className="eyebrow">Order</p>
          <h1 className="page__title">We could not find that order</h1>
          <p className="page__subtitle">{feedback}</p>
        </header>
        <Link to="/my-orders" className="button button--outline">
          Back to my orders
        </Link>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page__intro">
        <p className="eyebrow">Order detail</p>
        <h1 className="page__title">{order?.orderId || order?.id}</h1>
        <p className="page__subtitle">
          Placed on {createdAtLabel} &middot;{" "}
          {(order?.paymentStatus || "Paid").toUpperCase()}
        </p>
      </header>

      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-card">
            <p className="eyebrow eyebrow--muted">Order ID</p>
            <p className="checkout-section__subtitle">
              {order?.orderId || order?.id}
            </p>
            <p className="checkout-section__subtitle">
              Currency: {order?.currency || "EUR"}
            </p>
          </div>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-summary__header">
            <h2>Items</h2>
            <p>
              {order?.itemCount ?? order?.items?.length ?? 0} item
              {(order?.itemCount ?? order?.items?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>

          {!order?.items?.length ? (
            <p className="checkout-summary__empty-note">
              No items found for this order.
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
                    {item.variationName && (
                      <p className="checkout-summary__item-variation">
                        Option: {item.variationName}
                      </p>
                    )}
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
            <span>Total</span>
            <span>{formatEuro(order?.total ?? 0)}</span>
          </div>

          <div className="checkout-summary__row">
            <span>Placed</span>
            <span>{createdAtLabel}</span>
          </div>

          <div className="checkout-actions" style={{ marginTop: "12px" }}>
            <Link to="/my-orders" className="button button--outline">
              Back to my orders
            </Link>
            <Link to="/products" className="button button--gradient">
              Keep shopping
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default MyOrderDetail;
