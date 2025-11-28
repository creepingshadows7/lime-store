import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatEuro } from "../utils/currency";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { getPricingDetails } from "../utils/pricing";

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
  const { addItem } = useCart();
  const {
    items: wishlistItems,
    status: wishlistStatus,
    error: wishlistError,
    loadWishlist,
    removeItem: removeWishlistItem,
  } = useWishlist();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [wishlistFeedback, setWishlistFeedback] = useState("");
  const [wishlistBusyId, setWishlistBusyId] = useState("");
  const [activeTab, setActiveTab] = useState("orders");

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true, state: { next: "/my-orders" } });
      return;
    }

    const fetchOrders = async () => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get("/api/orders/me");
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
    if (wishlistStatus === "idle") {
      loadWishlist();
    }
  }, [isAuthenticated, navigate, loadWishlist, wishlistStatus]);

  const handleViewOrder = (orderId) => {
    navigate(`/my-orders/${encodeURIComponent(orderId)}`);
  };

  const resolveWishlistPrice = (item) => {
    const basePrice =
      item?.product && item.product.price !== undefined && item.product.price !== null
        ? item.product.price
        : item?.price;
    if (basePrice === undefined || basePrice === null || basePrice === "") {
      return "--";
    }
    const pricing = getPricingDetails(
      basePrice,
      item?.product?.discount_price
    );
    return pricing.currentLabel;
  };

  const handleAddWishlistItemToCart = (item) => {
    if (!item) {
      return;
    }
    if (!item.product && !item.price) {
      setWishlistFeedback("That item is no longer available to add to cart.");
      return;
    }
    const pricing = getPricingDetails(
      item?.product?.price ?? item?.price ?? 0,
      item?.product?.discount_price
    );
    const displayName =
      item?.product?.name || item?.name || "Wishlist item";
    const imageUrl =
      item?.product?.image_url ||
      (Array.isArray(item?.product?.image_urls)
        ? item.product.image_urls[0]
        : "") ||
      item?.imageUrl ||
      "";

    addItem(
      {
        id: item.productId,
        name: displayName,
        price: pricing.currentValue,
        listPrice: pricing.baseValue,
        imageUrl,
        variationId: item.variationId || "",
        variationName: item.variationName || "",
      },
      1
    );
    setWishlistFeedback(`${displayName} added to your cart.`);
  };

  const handleRemoveWishlistItem = async (item) => {
    if (!item?.productId) {
      return;
    }
    const signature = `${item.productId}-${item.variationId || "default"}`;
    setWishlistBusyId(signature);
    try {
      const result = await removeWishlistItem(
        item.productId,
        item.variationId || ""
      );
      setWishlistFeedback(
        result.message || "Item removed from your wishlist."
      );
    } catch (err) {
      setWishlistFeedback(
        "We could not update your wishlist. Please try again."
      );
    } finally {
      setWishlistBusyId("");
    }
  };

  const renderOrdersSection = () => {
    if (status === "loading") {
      return <p className="page__status">Fetching your orders...</p>;
    }

    if (status === "error") {
      return <p className="form-feedback form-feedback--error">{feedback}</p>;
    }

    if (orders.length === 0) {
      return (
        <div className="checkout-card checkout-card__note">
          <p>You have not placed any orders yet.</p>
          <div style={{ marginTop: "10px" }}>
            <Link to="/products" className="button button--gradient">
              Start shopping
            </Link>
          </div>
        </div>
      );
    }

    return (
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
                    onClick={() => handleViewOrder(order.orderId || order.id)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderWishlistSection = () => {
    if (wishlistStatus === "loading") {
      return <p className="page__status">Loading your wishlist...</p>;
    }

    if (wishlistStatus === "error") {
      return (
        <p className="form-feedback form-feedback--error">
          {wishlistError ||
            "We could not load your wishlist. Please try again."}
        </p>
      );
    }

    if (wishlistItems.length === 0) {
      return (
        <div className="checkout-card checkout-card__note">
          <p>Your wishlist is empty. Add items to revisit them later.</p>
          <div style={{ marginTop: "10px" }}>
            <Link to="/products" className="button button--outline">
              Browse products
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-table__wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {wishlistItems.map((item) => {
              const signature = `${item.productId}-${item.variationId || "default"}`;
              const productName =
                item?.product?.name || item?.name || "Wishlist item";
              const variationLabel = item?.variationName
                ? `Option: ${item.variationName}`
                : "";
              const isUnavailable = !item?.product;
              return (
                <tr key={signature}>
                  <td>
                    <div className="wishlist-item__details">
                      <div className="wishlist-item__meta">
                        <p className="wishlist-item__name">{productName}</p>
                        {variationLabel && (
                          <p className="wishlist-item__variation">
                            {variationLabel}
                          </p>
                        )}
                        {isUnavailable && (
                          <p className="wishlist-item__status">
                            No longer available
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{resolveWishlistPrice(item)}</td>
                  <td>{formatDateTime(item.addedAt)}</td>
                  <td>
                    <div className="wishlist-item__actions">
                      <button
                        type="button"
                        className="button button--outline"
                        onClick={() => handleAddWishlistItemToCart(item)}
                        disabled={isUnavailable}
                      >
                        Add to cart
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => handleRemoveWishlistItem(item)}
                        disabled={wishlistBusyId === signature}
                      >
                        {wishlistBusyId === signature ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="page">
      <header className="page__intro">
        <p className="eyebrow">My orders</p>
        <h1 className="page__title">
          {profile?.name ? `${profile.name},` : "Here"} are your recent orders
        </h1>
        <p className="page__subtitle">
          Track every purchase, view receipts, and keep a shortlist of what you
          want next.
        </p>
      </header>

      <div className="my-orders__tabs" role="tablist" aria-label="Orders navigation">
        <button
          type="button"
          className={`my-orders__tab${activeTab === "orders" ? " my-orders__tab--active" : ""}`}
          onClick={() => setActiveTab("orders")}
          role="tab"
          aria-selected={activeTab === "orders"}
        >
          Orders
        </button>
        <button
          type="button"
          className={`my-orders__tab${activeTab === "wishlist" ? " my-orders__tab--active" : ""}`}
          onClick={() => setActiveTab("wishlist")}
          role="tab"
          aria-selected={activeTab === "wishlist"}
        >
          Wishlist
        </button>
      </div>

      <section className="my-orders__panel" role="tabpanel">
        {activeTab === "orders" ? renderOrdersSection() : renderWishlistSection()}
        {activeTab === "wishlist" && wishlistFeedback && (
          <p className="form-feedback" style={{ marginTop: "0.4rem" }}>
            {wishlistFeedback}
          </p>
        )}
      </section>
    </section>
  );
};

export default MyOrders;
