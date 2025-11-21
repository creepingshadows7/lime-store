import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
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

const AdminOrders = () => {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
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

    const fetchOrders = async () => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get("/api/orders/all");
        const received = Array.isArray(data?.orders) ? data.orders : [];
        setOrders(received);
        setStatus("success");
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "Unable to load orders. Please try again.";
        setFeedback(message);
        setStatus("error");
      }
    };

    fetchOrders();
  }, [isAdmin, isAuthenticated, navigate]);

  const handleViewOrder = (orderId) => {
    navigate(`/admin/orders/${encodeURIComponent(orderId)}`);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="page admin-page">
      <div className="admin-page__header">
        <p className="eyebrow">Admin</p>
        <h1 className="page__title">Orders</h1>
        <p className="page__subtitle">
          Review every order, customer email, payment status, and total.
        </p>
      </div>

      <div className="admin-tabs">
        <Link to="/admin" className="admin-tab">
          Members
        </Link>
        <button type="button" className="admin-tab admin-tab--active">
          Orders
        </button>
      </div>

      {status === "loading" ? (
        <p className="page__status">Loading all orders...</p>
      ) : status === "error" ? (
        <p className="form-feedback form-feedback--error">{feedback}</p>
      ) : orders.length === 0 ? (
        <p className="page__status">No orders have been placed yet.</p>
      ) : (
        <div className="admin-table__wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer email</th>
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
                  <td>{order.customerEmail || "—"}</td>
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

export default AdminOrders;
