import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getProfileInitial } from "../utils/profile";
import { formatEuro } from "../utils/currency";
import { formatPublishedDate } from "../utils/dates";

const initialState = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

const ORDER_DATE_OPTIONS = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const Account = () => {
  const { isAuthenticated, profile, login } = useAuth();
  const [formValues, setFormValues] = useState(initialState);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(
    profile?.avatar_url ?? ""
  );
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarStatus, setAvatarStatus] = useState("idle");
  const [avatarFeedback, setAvatarFeedback] = useState("");
  const [orders, setOrders] = useState([]);
  const [ordersStatus, setOrdersStatus] = useState("idle");
  const [ordersFeedback, setOrdersFeedback] = useState("");
  const fileInputRef = useRef(null);

  const sanitizedProfile = useMemo(
    () => ({
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      avatar_url: profile?.avatar_url ?? "",
    }),
    [profile]
  );

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoadingProfile(false);
      setCurrentAvatarUrl("");
      setAvatarFile(null);
      setAvatarPreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
      setAvatarStatus("idle");
      setAvatarFeedback("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setFeedback("");

      try {
        const { data } = await apiClient.get("/api/account");
        setFormValues({
          name: data.user?.name ?? "",
          email: data.user?.email ?? "",
          phone: data.user?.phone ?? "",
          password: "",
        });
        setCurrentAvatarUrl(data.user?.avatar_url ?? "");
      } catch (error) {
        setFeedback(
          "We couldn't refresh your profile details. The view shows your last known information."
        );
        setFormValues((prev) => ({
          ...prev,
          ...sanitizedProfile,
          password: "",
        }));
        setCurrentAvatarUrl(sanitizedProfile.avatar_url ?? "");
      } finally {
        setAvatarFile(null);
        setAvatarPreview((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return "";
        });
        setAvatarStatus("idle");
        setAvatarFeedback("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [fileInputRef, isAuthenticated, sanitizedProfile]);

  const fetchOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      setOrdersStatus("idle");
      setOrdersFeedback("");
      return;
    }

    setOrdersStatus("loading");
    setOrdersFeedback("");

    try {
      const { data } = await apiClient.get("/api/orders");
      const nextOrders = Array.isArray(data?.orders) ? data.orders : [];
      setOrders(nextOrders);
      setOrdersStatus("success");
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't load your orders right now.";
      setOrdersStatus("error");
      setOrdersFeedback(message);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const orderHistory = useMemo(() => {
    return orders.map((order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      const providedSubtotal = Number(order?.subtotal);
      const subtotal = Number.isFinite(providedSubtotal)
        ? providedSubtotal
        : items.reduce((sum, item) => {
            const price = Number(item?.price) || 0;
            const quantity = Number(item?.quantity) || 0;
            return sum + price * quantity;
          }, 0);
      const providedTotalItems = Number(order?.totalItems);
      const totalItems = Number.isFinite(providedTotalItems)
        ? providedTotalItems
        : items.reduce(
            (sum, item) => sum + (Number(item?.quantity) || 0),
            0
          );
      const createdAtRaw =
        typeof order?.createdAt === "string" ? order.createdAt : "";
      const createdAtLabel = createdAtRaw
        ? formatPublishedDate(createdAtRaw, ORDER_DATE_OPTIONS)
        : "";
      return {
        ...order,
        items,
        subtotal,
        totalItems,
        createdAtLabel,
        createdAtRaw,
      };
    });
  }, [orders]);

  const recentPurchases = useMemo(() => {
    const flattened = [];
    orderHistory.forEach((order) => {
      const orderTimestamp = order.createdAtRaw
        ? Date.parse(order.createdAtRaw)
        : 0;
      const readableDate = order.createdAtLabel || "Recently placed";
      order.items.forEach((item, index) => {
        const productId =
          (typeof item?.productId === "string" && item.productId.trim()) ||
          `order-${order.id || order.orderNumber}-${index}`;
        const price = Number(item?.price) || 0;
        const quantity = Number(item?.quantity) || 0;
        const lineTotal =
          Number(item?.lineTotal) || Number((price * quantity).toFixed(2));
        flattened.push({
          id: `${productId}-${index}`,
          name:
            (typeof item?.name === "string" && item.name.trim()) ||
            "Curated Selection",
          imageUrl:
            (typeof item?.imageUrl === "string" && item.imageUrl.trim()) || "",
          quantity,
          price,
          lineTotal,
          orderNumber: order.orderNumber,
          createdAtValue: orderTimestamp || 0,
          createdAtLabel: readableDate,
        });
      });
    });

    return flattened
      .sort((a, b) => b.createdAtValue - a.createdAtValue)
      .slice(0, 6);
  }, [orderHistory]);

  const handleRefreshOrders = () => {
    if (ordersStatus === "loading") {
      return;
    }
    fetchOrders();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (event) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    const [selectedFile] = files;
    if (!selectedFile) {
      return;
    }

    setAvatarFile(selectedFile);
    setAvatarPreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return URL.createObjectURL(selectedFile);
    });
    setAvatarStatus("idle");
    setAvatarFeedback("");

    if (event.target) {
      event.target.value = "";
    }
  };

  const handleAvatarReset = () => {
    setAvatarFile(null);
    setAvatarPreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return "";
    });
    setAvatarStatus("idle");
    setAvatarFeedback("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setAvatarStatus("error");
      setAvatarFeedback("Please choose an image before uploading.");
      return;
    }

    setAvatarStatus("loading");
    setAvatarFeedback("");

    try {
      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const { data } = await apiClient.post("/api/account/avatar", formData);
      login(data.access_token, data.user);

      setCurrentAvatarUrl(data.user?.avatar_url ?? "");
      setAvatarFile(null);
      setAvatarPreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setAvatarStatus("success");
      setAvatarFeedback(
        data.message ?? "Profile picture updated successfully."
      );
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't upload your profile picture. Please try again.";
      setAvatarStatus("error");
      setAvatarFeedback(message);
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarStatus("loading");
    setAvatarFeedback("");
    try {
      const { data } = await apiClient.delete("/api/account/avatar");
      login(data.access_token, data.user);
      setCurrentAvatarUrl(data.user?.avatar_url ?? "");
      setAvatarFile(null);
      setAvatarPreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setAvatarStatus("success");
      setAvatarFeedback(
        data.message ?? "Profile picture removed successfully."
      );
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't remove your profile picture. Please try again.";
      setAvatarStatus("error");
      setAvatarFeedback(message);
      setCurrentAvatarUrl(sanitizedProfile.avatar_url ?? "");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setFeedback("");

    try {
      const payload = {
        name: formValues.name.trim(),
        email: formValues.email.trim(),
        phone: formValues.phone.trim(),
      };

      if (formValues.password.trim()) {
        payload.password = formValues.password.trim();
      }

      const { data } = await apiClient.put("/api/account", payload);
      login(data.access_token, data.user);

      setFormValues({
        name: data.user?.name ?? "",
        email: data.user?.email ?? "",
        phone: data.user?.phone ?? "",
        password: "",
      });
      setCurrentAvatarUrl(data.user?.avatar_url ?? currentAvatarUrl);

      setStatus("success");
      setFeedback(data.message ?? "Account updated successfully.");
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't update your account. Please try again.";
      setStatus("error");
      setFeedback(message);
    }
  };

  const displayedAvatar = avatarPreview || currentAvatarUrl;
  const avatarInitial = getProfileInitial(formValues);
  const isAvatarProcessing = avatarStatus === "loading";

  if (!isAuthenticated) {
    return (
      <section className="page account-page">
        <div className="account-header">
          <p className="eyebrow">Account</p>
          <h1 className="page__title">Let’s Get You Signed In</h1>
          <p className="page__subtitle">
            Access your profile, tailor your preferences, and track bespoke
            orders once you’re logged in.
          </p>
          <div className="account-actions">
            <Link to="/login" className="button button--gradient">
              Log in
            </Link>
            <Link to="/signup" className="button button--outline">
              Create Account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page account-page">
      <div className="account-header">
        <p className="eyebrow">Account</p>
        <h1 className="page__title">Refine Your Lime Store Profile</h1>
        <p className="page__subtitle">
          Keep your contact details polished and stay ready for exclusive drops
          and tailored recommendations.
        </p>
      </div>
      <div className="account-card">
        {isLoadingProfile ? (
          <p className="page__status">Preparing your profile...</p>
        ) : (
          <>
            <div className="account-avatar">
              <div className="account-avatar__preview">
                {displayedAvatar ? (
                  <img
                    src={displayedAvatar}
                    alt="Profile avatar preview"
                    className="account-avatar__image"
                  />
                ) : (
                  <span
                    className="account-avatar__fallback"
                    aria-hidden="true"
                  >
                    {avatarInitial}
                  </span>
                )}
              </div>
              <div className="account-avatar__meta">
                <p className="account-avatar__title">Profile picture</p>
                <p className="account-avatar__hint">
                  Use a square image in PNG, JPG, JPEG, GIF, or WEBP format up
                  to 16&nbsp;MB.
                </p>
                <div className="account-avatar__actions">
                  <label
                    className={`account-avatar__upload button button--outline${
                      isAvatarProcessing
                        ? " account-avatar__upload--disabled"
                        : ""
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      disabled={isAvatarProcessing}
                    />
                    Choose image
                  </label>
                  <button
                    type="button"
                    className="button button--gradient"
                    onClick={handleAvatarUpload}
                    disabled={!avatarFile || isAvatarProcessing}
                  >
                    {isAvatarProcessing ? "Processing..." : "Save picture"}
                  </button>
                  {avatarFile && (
                    <button
                      type="button"
                      className="account-avatar__reset"
                      onClick={handleAvatarReset}
                      disabled={isAvatarProcessing}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    className="account-avatar__remove"
                    onClick={handleAvatarDelete}
                    disabled={isAvatarProcessing || !currentAvatarUrl}
                  >
                    Remove picture
                  </button>
                </div>
                {avatarFeedback && (
                  <p
                    className={`form-feedback${
                      avatarStatus === "error"
                        ? " form-feedback--error"
                        : avatarStatus === "success"
                        ? " form-feedback--success"
                        : ""
                    }`}
                  >
                    {avatarFeedback}
                  </p>
                )}
              </div>
            </div>
            <form className="account-form" onSubmit={handleSubmit}>
              <div className="input-group">
                <span>Full Name</span>
                <input
                  id="name"
                  name="name"
                  value={formValues.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="input-group">
                <span>Email Address</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="input-group">
                <span>Phone Number</span>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formValues.phone}
                  onChange={handleChange}
                  placeholder="+1 555 123 4567"
                  autoComplete="tel"
                />
              </div>
              <div className="input-group">
                <span>New Password</span>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formValues.password}
                  onChange={handleChange}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                />
              </div>
              <div className="account-actions">
                <button
                  type="submit"
                  className="button button--gradient"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "Saving..." : "Save Changes"}
                </button>
              </div>
              {feedback && (
                <p
                  className={`form-feedback${
                    status === "error"
                      ? " form-feedback--error"
                      : status === "success"
                      ? " form-feedback--success"
                      : ""
                  }`}
                >
                  {feedback}
                </p>
              )}
            </form>
          </>
        )}
      </div>
      {ordersStatus === "success" && (
        <div className="account-recent">
          <div className="account-recent__header">
            <div>
              <p className="eyebrow">Recent purchases</p>
              <h2>Your latest lime indulgences</h2>
              <p className="account-recent__subtitle">
                A quick glance at the tastings you selected most recently.
              </p>
            </div>
          </div>
          {recentPurchases.length === 0 ? (
            <p className="page__status account-recent__status">
              Once you complete an order it will be summarized here.
            </p>
          ) : (
            <ul className="account-recent__list">
              {recentPurchases.map((item) => (
                <li key={item.id} className="account-recent__item">
                  <div className="account-recent__media">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="account-recent__image"
                      />
                    ) : (
                      <span className="account-recent__placeholder">LS</span>
                    )}
                  </div>
                  <div className="account-recent__details">
                    <p className="account-recent__name">{item.name}</p>
                    <p className="account-recent__meta">
                      {item.quantity} × {formatEuro(item.price)} •{" "}
                      {item.createdAtLabel}
                    </p>
                  </div>
                  <div className="account-recent__total">
                    {formatEuro(item.lineTotal)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="account-orders">
        <div className="account-orders__header">
          <div>
            <p className="eyebrow">Order history</p>
            <h2>Every lime indulgence you have secured</h2>
            <p className="account-orders__subtitle">
              Track confirmations, quantities, and totals for each checkout.
            </p>
          </div>
          <button
            type="button"
            className="button button--outline account-orders__refresh"
            onClick={handleRefreshOrders}
            disabled={ordersStatus === "loading"}
          >
            {ordersStatus === "loading" ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {ordersStatus === "loading" && (
          <p className="page__status account-orders__status">
            Fetching your latest orders...
          </p>
        )}
        {ordersStatus === "error" && (
          <p className="form-feedback form-feedback--error account-orders__status">
            {ordersFeedback}
          </p>
        )}
        {ordersStatus === "success" && orderHistory.length === 0 && (
          <p className="page__status account-orders__status">
            You have not completed a purchase yet. Once you do, it will appear
            here.
          </p>
        )}
        {orderHistory.length > 0 && (
          <ul className="account-orders__list">
            {orderHistory.map((order) => {
              const items = Array.isArray(order.items) ? order.items : [];
              const previewItems = items.slice(0, 3);
              const remainingCount =
                items.length > 3 ? items.length - previewItems.length : 0;
              const normalizedOrderNumber =
                typeof order.orderNumber === "string"
                  ? order.orderNumber.trim()
                  : "";
              const fallbackId =
                typeof order.id === "string" ? order.id : order.orderNumber;
              const orderLabel =
                normalizedOrderNumber ||
                (fallbackId
                  ? `Order ${String(fallbackId).slice(-6).toUpperCase()}`
                  : "Order");
              const createdAtLabel =
                order.createdAtLabel || "Awaiting confirmation";
              return (
                <li
                  key={order.id || order.orderNumber || orderLabel}
                  className="account-orders__item"
                >
                  <div className="account-orders__item-header">
                    <div>
                      <p className="account-orders__number">{orderLabel}</p>
                      <p className="account-orders__date">{createdAtLabel}</p>
                    </div>
                    <div className="account-orders__totals">
                      <span>
                        {order.totalItems} item
                        {order.totalItems === 1 ? "" : "s"}
                      </span>
                      <strong>{formatEuro(order.subtotal)}</strong>
                    </div>
                  </div>
                  <div className="account-orders__products">
                    {previewItems.map((item, index) => {
                      const quantityLabel = Number(item?.quantity) || 0;
                      const name =
                        typeof item?.name === "string" && item.name.trim()
                          ? item.name.trim()
                          : "Lime indulgence";
                      return (
                        <span
                          key={`order-${order.id || order.orderNumber}-${item?.productId || index}`}
                          className="account-orders__product-chip"
                        >
                          {name} × {quantityLabel}
                        </span>
                      );
                    })}
                    {remainingCount > 0 && (
                      <span className="account-orders__product-chip account-orders__product-chip--muted">
                        +{remainingCount} more
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default Account;
