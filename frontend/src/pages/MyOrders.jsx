import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatEuro } from "../utils/currency";

const formatDateTime = (timestamp) => {
  if (!timestamp) {
    return "--";
  }
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? String(timestamp)
    : parsed.toLocaleString();
};

const MyOrders = () => {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true, state: { next: "/my-orders" } });
      return;
    }

    const fetchOrders = async () => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get("/api/orders/user");
        const receivedOrders = Array.isArray(data?.orders) ? data.orders : [];
        setOrders(receivedOrders);
        setStatus("success");
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "We could not load your orders right now.";
        setFeedback(message);
        setStatus("error");
      }
    };

    fetchOrders();
  }, [isAuthenticated, navigate]);

  const handleViewOrder = (orderId) => {
    navigate(`/my-orders/${encodeURIComponent(orderId)}`);
  };

  return (
    <section className="page">
      <header className="page__intro">
        <p className="eyebrow">My orders</p>
        <h1 className="page__title">
          {profile?.name ? `${profile.name},` : "Here"} are your recent orders
        </h1>
        <p className="page__subtitle">
          Track every purchase, view receipts, and revisit what you bought.
        </p>
      </header>

      {status === "loading" ? (
        <p className="page__status">Fetching your orders...</p>
      ) : status === "error" ? (
        <p className="form-feedback form-feedback--error">{feedback}</p>
      ) : orders.length === 0 ? (
        <div className="checkout-card checkout-card__note">
          <p>You have not placed any orders yet.</p>
          <div style={{ marginTop: "10px" }}>
            <Link to="/products" className="button button--gradient">
              Start shopping
            </Link>
          </div>
        </div>
      ) : (
        <div className="admin-table__wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Items</th>
                <th>Total</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id || order.orderId}>
                  <td>{order.orderId || order.id}</td>
                  <td>{order.itemCount ?? order.items?.length ?? 0}</td>
                  <td>{formatEuro(order.total)}</td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{(order.paymentStatus || "Paid").toUpperCase()}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--outline"
                      onClick={() =>
                        handleViewOrder(order.orderId || order.id)
                      }
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default MyOrders;
