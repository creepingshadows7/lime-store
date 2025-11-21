import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatEuro } from "../utils/currency";

const AdminOrderDetail = () => {
  const { orderId } = useParams();
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate("/", { replace: true });
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
          "Unable to load that order. Please try again.";
        setFeedback(message);
        setStatus("error");
      }
    };

    fetchOrder();
  }, [isAdmin, isAuthenticated, navigate, orderId]);

  const createdAtLabel = useMemo(() => {
    if (!order?.createdAt) {
      return "--";
    }
    const parsed = new Date(order.createdAt);
    return Number.isNaN(parsed.getTime())
      ? order.createdAt
      : parsed.toLocaleString();
  }, [order?.createdAt]);

  if (!isAdmin) {
    return null;
  }

  if (status === "loading") {
    return (
      <section className="page admin-page">
        <header className="page__intro">
          <p className="eyebrow">Order</p>
          <h1 className="page__title">Loading order...</h1>
        </header>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="page admin-page">
        <header className="page__intro">
          <p className="eyebrow">Order</p>
          <h1 className="page__title">Could not load order</h1>
          <p className="page__subtitle">{feedback}</p>
        </header>
        <Link to="/admin/orders" className="button button--outline">
          Back to orders
        </Link>
      </section>
    );
  }

  return (
    <section className="page admin-page">
      <div className="admin-page__header">
        <p className="eyebrow">Admin</p>
        <h1 className="page__title">Order {order?.orderId || order?.id}</h1>
        <p className="page__subtitle">
          Payment status: {(order?.paymentStatus || "Paid").toUpperCase()}
        </p>
      </div>

      <div className="admin-tabs">
        <Link to="/admin" className="admin-tab">
          Members
        </Link>
        <Link to="/admin/orders" className="admin-tab admin-tab--active">
          Orders
        </Link>
      </div>

      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-card">
            <p className="eyebrow eyebrow--muted">Customer</p>
            <p className="checkout-section__subtitle">
              Email: {order?.customerEmail || "—"}
            </p>
            <p className="checkout-section__subtitle">
              Name: {order?.customerName || "—"}
            </p>
            <p className="checkout-section__subtitle">
              Created: {createdAtLabel}
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
              No items recorded for this order.
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
            <span>Total</span>
            <span>{formatEuro(order?.total ?? 0)}</span>
          </div>
          <div className="checkout-summary__row">
            <span>Order ID</span>
            <span>{order?.orderId || order?.id}</span>
          </div>
          <div className="checkout-summary__row">
            <span>Currency</span>
            <span>{order?.currency || "EUR"}</span>
          </div>

          <div className="checkout-actions" style={{ marginTop: "12px" }}>
            <Link to="/admin/orders" className="button button--outline">
              Back to orders
            </Link>
            <Link to="/products" className="button button--gradient">
              View catalog
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default AdminOrderDetail;
