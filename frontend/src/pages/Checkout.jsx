import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatEuro } from "../utils/currency";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const buildContactState = (profile) => ({
  name: profile?.name ?? "",
  email: profile?.email ?? "",
  phone: profile?.phone ?? "",
});

const buildAddressState = (profile) => ({
  country: profile?.address?.country ?? "",
  postcode: profile?.address?.postcode ?? "",
  city: profile?.address?.city ?? "",
  line1: profile?.address?.line1 ?? "",
  line2: profile?.address?.line2 ?? "",
});

const profileHasAddress = (profile) => {
  const address = profile?.address;
  if (!address) {
    return false;
  }
  return ["country", "postcode", "city", "line1", "line2"].some(
    (field) => typeof address[field] === "string" && address[field].trim().length > 0
  );
};

const Checkout = () => {
  const { isAuthenticated, profile, login } = useAuth();
  const { items, subtotal, totalItems } = useCart();
  const navigate = useNavigate();
  const [contactValues, setContactValues] = useState(() => buildContactState(profile));
  const [addressValues, setAddressValues] = useState(() => buildAddressState(profile));
  const [saveAddress, setSaveAddress] = useState(
    () => isAuthenticated && !profileHasAddress(profile)
  );
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  const hasItems = items.length > 0;
  const profileAddressExists = profileHasAddress(profile);

  useEffect(() => {
    setContactValues(buildContactState(profile));
    setAddressValues(buildAddressState(profile));
    setSaveAddress(isAuthenticated && !profileHasAddress(profile));
  }, [profile, isAuthenticated]);

  const checkoutItems = useMemo(
    () =>
      items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        name: item.name,
        price: item.price,
        listPrice: item.listPrice,
        imageUrl: item.imageUrl,
        variationId: item.variationId,
        variationName: item.variationName,
      })),
    [items]
  );

  const cartSubtotalLabel = formatEuro(subtotal);

  const handleContactChange = (event) => {
    const { name, value } = event.target;
    setContactValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setAddressValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateCheckout = () => {
    const trimmedContact = {
      name: contactValues.name.trim(),
      email: contactValues.email.trim(),
      phone: contactValues.phone.trim(),
    };
    const trimmedAddress = {
      country: addressValues.country.trim(),
      postcode: addressValues.postcode.trim(),
      city: addressValues.city.trim(),
      line1: addressValues.line1.trim(),
      line2: addressValues.line2.trim(),
    };

    if (!trimmedContact.name) {
      return { ok: false, message: "Please share who we're delivering to." };
    }
    if (!emailPattern.test(trimmedContact.email.toLowerCase())) {
      return { ok: false, message: "Enter a valid email so we can send updates." };
    }
    const missingAddressField = ["country", "postcode", "city", "line1"].find(
      (field) => !trimmedAddress[field]
    );
    if (missingAddressField) {
      return { ok: false, message: "Fill in your full delivery address to continue." };
    }

    return { ok: true, contact: trimmedContact, address: trimmedAddress };
  };

  const handleProceed = async () => {
    if (!hasItems) {
      if (status !== "success") {
        setStatus("error");
        setFeedback("Add at least one item to your cart before checking out.");
      }
      return;
    }
    const validation = validateCheckout();
    if (!validation.ok) {
      setStatus("error");
      setFeedback(validation.message);
      return;
    }

    setStatus("loading");
    setFeedback("");

    try {
      const payload = {
        items: checkoutItems,
        customer: validation.contact,
        address: validation.address,
        ...(isAuthenticated ? { saveAddress } : {}),
      };
      const { data } = await apiClient.post("/api/checkout", payload);
      if (isAuthenticated && data?.access_token && data?.user) {
        login(data.access_token, data.user);
      }
      setStatus("success");
      setFeedback(
        data?.message ??
          "Delivery details confirmed. Continue to payment to place your order."
      );
      navigate("/payment");
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't open the payment step right now. Please try again.";
      setStatus("error");
      setFeedback(message);
    }
  };

  if (!hasItems && status !== "success") {
    return (
      <section className="page checkout-page">
        <header className="page__intro">
          <p className="eyebrow">Checkout</p>
          <h1 className="page__title">Your cart is waiting</h1>
          <p className="page__subtitle">
            Add your favorite lime creations to the cart before entering delivery details.
          </p>
        </header>
        <div className="checkout-empty">
          <p>Your cart is currently empty.</p>
          <div className="checkout-empty__actions">
            <Link to="/products" className="button button--gradient">
              Browse products
            </Link>
            <Link to="/cart" className="button button--outline">
              Back to cart
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page checkout-page">
      <header className="page__intro">
        <p className="eyebrow">Checkout</p>
        <h1 className="page__title">Confirm your delivery details</h1>
        <p className="page__subtitle">
          We'll use this information for shipment updates and to pre-fill payment details.
        </p>
      </header>
      {!isAuthenticated && (
        <div className="checkout-account">
          <div>
            <p className="checkout-account__title">Have an account?</p>
            <p className="checkout-account__subtitle">
              Log in to auto-fill your information or continue as a guest and save it for later.
            </p>
          </div>
          <div className="checkout-account__actions">
            <Link to="/login" className="button button--outline">
              Log in
            </Link>
            <Link to="/signup" className="button button--gradient">
              Create account
            </Link>
          </div>
        </div>
      )}
      <div className="checkout-layout">
        <div className="checkout-panel">
          <div className="checkout-section">
            <div>
              <p className="eyebrow eyebrow--muted">Step 1</p>
              <h2>Contact information</h2>
              <p className="checkout-section__subtitle">
                We'll send order confirmations and courier updates here.
              </p>
            </div>
            <div className="checkout-section__grid">
              <label className="input-group">
                <span>Full Name</span>
                <input
                  id="checkout-name"
                  name="name"
                  value={contactValues.name}
                  onChange={handleContactChange}
                  autoComplete="name"
                />
              </label>
              <label className="input-group">
                <span>Email</span>
                <input
                  id="checkout-email"
                  name="email"
                  type="email"
                  value={contactValues.email}
                  onChange={handleContactChange}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="input-group">
                <span>Phone (optional)</span>
                <input
                  id="checkout-phone"
                  name="phone"
                  type="tel"
                  value={contactValues.phone}
                  onChange={handleContactChange}
                  autoComplete="tel"
                  placeholder="+31 6 1234 5678"
                />
              </label>
            </div>
          </div>
          <div className="checkout-section">
            <div>
              <p className="eyebrow eyebrow--muted">Step 2</p>
              <h2>Delivery address</h2>
              <p className="checkout-section__subtitle">
                {isAuthenticated && !profileAddressExists
                  ? "We don't have an address on file yet--save it now for effortless future checkouts."
                  : "Confirm where we should deliver your order."}
              </p>
            </div>
            <div className="checkout-section__grid checkout-section__grid--address">
              <label className="input-group">
                <span>Country</span>
                <input
                  id="checkout-country"
                  name="country"
                  value={addressValues.country}
                  onChange={handleAddressChange}
                  autoComplete="country-name"
                  placeholder="Netherlands"
                />
              </label>
              <label className="input-group">
                <span>Postcode</span>
                <input
                  id="checkout-postcode"
                  name="postcode"
                  value={addressValues.postcode}
                  onChange={handleAddressChange}
                  autoComplete="postal-code"
                  placeholder="1234 AB"
                />
              </label>
              <label className="input-group">
                <span>City</span>
                <input
                  id="checkout-city"
                  name="city"
                  value={addressValues.city}
                  onChange={handleAddressChange}
                  autoComplete="address-level2"
                  placeholder="Eindhoven"
                />
              </label>
              <label className="input-group input-group--span">
                <span>Address Line 1</span>
                <input
                  id="checkout-line1"
                  name="line1"
                  value={addressValues.line1}
                  onChange={handleAddressChange}
                  autoComplete="address-line1"
                  placeholder="Lime Lane 42"
                />
              </label>
              <label className="input-group input-group--span">
                <span>Address Line 2 (optional)</span>
                <input
                  id="checkout-line2"
                  name="line2"
                  value={addressValues.line2}
                  onChange={handleAddressChange}
                  autoComplete="address-line2"
                  placeholder="Apartment, suite, etc."
                />
              </label>
            </div>
            {isAuthenticated && (
              <label className="checkout-save">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={() => setSaveAddress((prev) => !prev)}
                />
                <span>Save this address to my profile</span>
              </label>
            )}
          </div>
          <div className="checkout-actions">
            <button
              type="button"
              className="button button--gradient"
              onClick={handleProceed}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Preparing..." : "Proceed to payment"}
            </button>
            <p className="checkout-actions__hint">
              Payment happens on the next step--no charges yet.
            </p>
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
          </div>
        </div>
        <aside className="checkout-summary">
          <div className="checkout-summary__header">
            <h2>Order summary</h2>
            <p>{totalItems} item{totalItems === 1 ? "" : "s"}</p>
          </div>
          {items.length === 0 ? (
            <p className="checkout-summary__empty-note">
              Your cart is cleared for this order. Add new items anytime.
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
                      <p className="checkout-summary__item-name">{item.name}</p>
                      {item.variationName && (
                        <p className="checkout-summary__item-variation">
                          Variation: {item.variationName}
                        </p>
                      )}
                      <p className="checkout-summary__item-meta">
                        Qty {item.quantity} &middot; {formatEuro(item.price)}
                      </p>
                    </div>
                    <span className="checkout-summary__item-total">{lineTotal}</span>
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
            <span>Calculated after payment</span>
          </div>
          <div className="checkout-summary__row checkout-summary__row--total">
            <span>Estimated total</span>
            <span>{cartSubtotalLabel}</span>
          </div>
          <p className="checkout-summary__footnote">
            Need to make changes?{" "}
            <Link to="/cart" className="link-highlight">
              Return to cart.
            </Link>
          </p>
        </aside>
      </div>
    </section>
  );
};

export default Checkout;
