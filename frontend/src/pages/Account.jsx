import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getProfileInitial } from "../utils/profile";
import { formatEuro } from "../utils/currency";
import { formatPublishedDate } from "../utils/dates";

const mapAddressToState = (address = {}) => ({
  addressCountry:
    typeof address.country === "string" ? address.country : "",
  addressPostcode:
    typeof address.postcode === "string" ? address.postcode : "",
  addressCity: typeof address.city === "string" ? address.city : "",
  addressLine1: typeof address.line1 === "string" ? address.line1 : "",
  addressLine2: typeof address.line2 === "string" ? address.line2 : "",
});

const mapFormToAddressPayload = (values) => ({
  country: values.addressCountry.trim(),
  postcode: values.addressPostcode.trim(),
  city: values.addressCity.trim(),
  line1: values.addressLine1.trim(),
  line2: values.addressLine2.trim(),
});

const buildFormValuesFromUser = (user = {}) => ({
  name: typeof user.name === "string" ? user.name : "",
  email: typeof user.email === "string" ? user.email : "",
  phone: typeof user.phone === "string" ? user.phone : "",
  ...mapAddressToState(user.address ?? {}),
});

const initialProfileState = buildFormValuesFromUser();
const buildPasswordFormState = () => ({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const ORDER_DATE_OPTIONS = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const Account = () => {
  const { isAuthenticated, profile, login } = useAuth();
  const [formValues, setFormValues] = useState(initialProfileState);
  const [passwordValues, setPasswordValues] = useState(
    () => buildPasswordFormState()
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("idle");
  const [passwordFeedback, setPasswordFeedback] = useState("");
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
      ...mapAddressToState(profile?.address ?? {}),
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
      setPasswordValues(buildPasswordFormState());
      setPasswordStatus("idle");
      setPasswordFeedback("");
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
        setFormValues(buildFormValuesFromUser(data.user ?? {}));
        setCurrentAvatarUrl(data.user?.avatar_url ?? "");
      } catch (error) {
        const fallbackMessage =
          error.response?.data?.message ??
          "We couldn't refresh your profile details. The view shows your last known information.";
        setFeedback(fallbackMessage);
        setFormValues(buildFormValuesFromUser(profile ?? {}));
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
        setPasswordValues(buildPasswordFormState());
        setPasswordStatus("idle");
        setPasswordFeedback("");
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [fileInputRef, isAuthenticated, profile, sanitizedProfile]);

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
      const rawItems = Array.isArray(order?.items) ? order.items : [];
      const items = rawItems.map((item) => {
        const variationName =
          typeof item?.variationName === "string"
            ? item.variationName.trim()
            : typeof item?.variation_name === "string"
            ? item.variation_name.trim()
            : "";
        return {
          ...item,
          variationName,
        };
      });
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

  const renderOrdersPanel = () => (
    <div className="account-orders account-orders--inline">
      <div className="account-orders__header">
        <div>
          <p className="eyebrow">Your Orders</p>
          <h2>Track every lime indulgence</h2>
          <p className="account-orders__subtitle">
            Review each purchase with itemized details and totals.
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
        <ul className="account-orders__timeline">
          {orderHistory.map((order) => {
            const orderItems = Array.isArray(order.items) ? order.items : [];
            const createdAtLabel =
              order.createdAtLabel || "Awaiting confirmation";
            return (
              <li
                key={order.id || order.orderNumber}
                className="account-orders__timeline-entry"
              >
                <header className="account-orders__timeline-header">
                  <div>
                    <p className="account-orders__number">
                      {order.orderNumber || "Order"}
                    </p>
                    <p className="account-orders__date">{createdAtLabel}</p>
                  </div>
                  <div className="account-orders__totals">
                    <span>
                      {order.totalItems} item
                      {order.totalItems === 1 ? "" : "s"}
                    </span>
                    <strong>{formatEuro(order.subtotal)}</strong>
                  </div>
                </header>
                <div className="account-orders__timeline-items">
                  {orderItems.map((item, index) => {
                    const itemName =
                      typeof item?.name === "string" && item.name.trim()
                        ? item.name.trim()
                        : "Curated Selection";
                    const variationLabel =
                      typeof item?.variationName === "string" &&
                      item.variationName
                        ? item.variationName
                        : "";
                    const displayName = variationLabel
                      ? `${itemName} (${variationLabel})`
                      : itemName;
                    const quantity = Number(item?.quantity) || 0;
                    const unitPrice = formatEuro(Number(item?.price) || 0);
                    const lineTotalValue =
                      Number(item?.lineTotal) ||
                      Number((Number(item?.price) || 0) * quantity);
                    const lineTotal = formatEuro(lineTotalValue);
                    return (
                      <div
                        key={`${order.id || order.orderNumber}-${item?.productId || index}`}
                        className="account-orders__timeline-item"
                      >
                        <div>
                          <p className="account-orders__item-name">
                            {displayName}
                          </p>
                          <p className="account-orders__item-meta">
                            {quantity} x {unitPrice}
                          </p>
                        </div>
                        <span className="account-orders__item-total">
                          {lineTotal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

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

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswordValues((prev) => ({ ...prev, [name]: value }));
    setPasswordStatus("idle");
    setPasswordFeedback("");
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
        address: mapFormToAddressPayload(formValues),
      };

      const { data } = await apiClient.put("/api/account", payload);
      login(data.access_token, data.user);

      setFormValues(buildFormValuesFromUser(data.user ?? {}));
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

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const currentPassword = passwordValues.currentPassword.trim();
    const newPassword = passwordValues.newPassword.trim();
    const confirmPassword = passwordValues.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus("error");
      setPasswordFeedback("Please complete all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus("error");
      setPasswordFeedback("New passwords do not match.");
      return;
    }

    setPasswordStatus("loading");
    setPasswordFeedback("");

    try {
      const { data } = await apiClient.put("/api/account", {
        current_password: currentPassword,
        password: newPassword,
        confirm_password: confirmPassword,
      });
      login(data.access_token, data.user);
      setPasswordValues(buildPasswordFormState());
      setPasswordStatus("success");
      setPasswordFeedback(
        data.message ?? "Password updated successfully."
      );
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't update your password. Please try again.";
      setPasswordStatus("error");
      setPasswordFeedback(message);
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
        {renderOrdersPanel()}
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
              <div className="account-address">
                <div className="account-address__header">
                  <div>
                    <p className="eyebrow eyebrow--muted">Delivery details</p>
                    <h3>Preferred address</h3>
                    <p className="account-address__subtitle">
                      We auto-fill this information during checkout so you can confirm
                      and continue.
                    </p>
                  </div>
                </div>
                <div className="account-address__grid">
                  <label className="input-group">
                    <span>Country</span>
                    <input
                      id="account-country"
                      name="addressCountry"
                      value={formValues.addressCountry}
                      onChange={handleChange}
                      autoComplete="country-name"
                      placeholder="Netherlands"
                    />
                  </label>
                  <label className="input-group">
                    <span>Postcode</span>
                    <input
                      id="account-postcode"
                      name="addressPostcode"
                      value={formValues.addressPostcode}
                      onChange={handleChange}
                      autoComplete="postal-code"
                      placeholder="1234 AB"
                    />
                  </label>
                  <label className="input-group">
                    <span>City</span>
                    <input
                      id="account-city"
                      name="addressCity"
                      value={formValues.addressCity}
                      onChange={handleChange}
                      autoComplete="address-level2"
                      placeholder="Eindhoven"
                    />
                  </label>
                  <label className="input-group input-group--span">
                    <span>Address Line 1</span>
                    <input
                      id="account-line1"
                      name="addressLine1"
                      value={formValues.addressLine1}
                      onChange={handleChange}
                      autoComplete="address-line1"
                      placeholder="Lime Lane 42"
                    />
                  </label>
                  <label className="input-group input-group--span">
                    <span>Address Line 2 (optional)</span>
                    <input
                      id="account-line2"
                      name="addressLine2"
                      value={formValues.addressLine2}
                      onChange={handleChange}
                      autoComplete="address-line2"
                      placeholder="Apartment, suite, etc."
                    />
                  </label>
                </div>
                <p className="account-address__note">
                  Leave fields blank if you prefer to share delivery details later—we’ll
                  remind you at checkout.
                </p>
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
            <div className="account-password">
              <div className="account-password__header">
                <p className="eyebrow eyebrow--muted">Security</p>
                <h3>Reset Password</h3>
                <p className="account-address__subtitle">
                  Update your password in a dedicated space. Enter your current
                  password, choose a new one, and confirm the change.
                </p>
              </div>
              <form
                className="account-form account-form--password"
                onSubmit={handlePasswordSubmit}
              >
                <div className="input-group">
                  <span>Current Password</span>
                  <input
                    id="current-password"
                    name="currentPassword"
                    type="password"
                    value={passwordValues.currentPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="input-group">
                  <span>New Password</span>
                  <input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    value={passwordValues.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Create a new password"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="input-group">
                  <span>Confirm New Password</span>
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    value={passwordValues.confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Type the new password again"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="account-actions">
                  <button
                    type="submit"
                    className="button button--outline"
                    disabled={passwordStatus === "loading"}
                  >
                    {passwordStatus === "loading"
                      ? "Updating..."
                      : "Update Password"}
                  </button>
                </div>
                {passwordFeedback && (
                  <p
                    className={`form-feedback${
                      passwordStatus === "error"
                        ? " form-feedback--error"
                        : passwordStatus === "success"
                        ? " form-feedback--success"
                        : ""
                    }`}
                  >
                    {passwordFeedback}
                  </p>
                )}
              </form>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default Account;
