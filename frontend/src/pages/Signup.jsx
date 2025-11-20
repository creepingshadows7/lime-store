import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

const Signup = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [addressValues, setAddressValues] = useState({
    country: "",
    postcode: "",
    city: "",
    line1: "",
    line2: "",
  });
  const [collectAddress, setCollectAddress] = useState(true);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStatus, setOtpStatus] = useState("idle");
  const [otpMessage, setOtpMessage] = useState("");
  const [otpMeta, setOtpMeta] = useState(null);
  const [resendStatus, setResendStatus] = useState("idle");

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const safeName = name.trim();
      const safePhone = phone.trim();
      const trimmedAddress = Object.fromEntries(
        Object.entries(addressValues).map(([key, value]) => [key, value.trim()])
      );
      const hasAddressInput =
        collectAddress && Object.values(trimmedAddress).some(Boolean);

      const payload = {
        name: safeName,
        email: normalizedEmail,
        password,
        ...(safePhone ? { phone: safePhone } : {}),
        ...(hasAddressInput ? { address: trimmedAddress } : {}),
      };

      const { data } = await apiClient.post("/api/register", payload);

      setPendingEmail(normalizedEmail);
      setPhase("verify");
      setStatus("awaiting_verification");
      setMessage(
        data?.message ??
          "We sent a verification code to your inbox. Enter it below to complete signup."
      );
      setOtpMeta({
        expiresInSeconds: data?.expires_in_seconds ?? 300,
        otpLength: data?.otp_length ?? 6,
        expiresAt: data?.expires_at ?? null,
      });
      setOtpCode("");
      setOtpStatus("idle");
      setOtpMessage("");
    } catch (err) {
      setStatus("error");
      if (err.response?.status === 400) {
        setMessage(err.response.data?.message ?? "That email is already registered.");
      } else {
        setMessage(
          err.response?.data?.message ??
            "We could not create your account. Please try again."
        );
      }
    }
  };

  const handleAddressChange = (event) => {
    const { name: fieldName, value } = event.target;
    setAddressValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSkipAddress = () => {
    setCollectAddress(false);
  };

  const handleEnableAddress = () => {
    setCollectAddress(true);
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    setOtpStatus("loading");
    setOtpMessage("");

    try {
      await apiClient.post("/api/verify-email", {
        email: pendingEmail,
        otp: otpCode.trim(),
      });

      setOtpStatus("success");
      setOtpMessage("Email verified! Fetching your account...");

      const { data } = await apiClient.post("/api/login", {
        email: pendingEmail,
        password,
      });

      login(data.access_token, data.user);
      setOtpMessage("All set! Redirecting you to the collection...");
      navigate("/products");
    } catch (err) {
      setOtpStatus("error");
      if (err.response?.status === 400) {
        setOtpMessage(err.response.data?.message ?? "That code didn't work.");
      } else if (err.response?.status === 403) {
        setOtpMessage(
          err.response?.data?.message ??
            "Please verify your email before logging in."
        );
      } else {
        setOtpMessage("We couldn't verify that code. Try again in a moment.");
      }
    }
  };

  const handleResendCode = async () => {
    if (!pendingEmail || resendStatus === "loading") return;
    setResendStatus("loading");
    setOtpMessage("");

    try {
      await apiClient.post("/api/resend-code", { email: pendingEmail });
      setResendStatus("success");
      setOtpMessage("Sent! Check your inbox for the latest code.");
    } catch (err) {
      setResendStatus("error");
      setOtpMessage(
        err.response?.data?.message ??
          "We couldn't resend the code right now. Please try again."
      );
    } finally {
      setTimeout(() => setResendStatus("idle"), 4000);
    }
  };

  const renderSignupForm = () => (
    <form className="auth-card__form" onSubmit={handleRegisterSubmit}>
      <label className="input-group">
        <span>Full Name</span>
        <input
          id="name"
          name="name"
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="input-group">
        <span>Email</span>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="input-group">
        <span>Phone (optional)</span>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={phone}
          autoComplete="tel"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+1 555 123 4567"
        />
      </label>
      <div className="auth-address">
        <div className="auth-address__header">
          <div>
            <p className="eyebrow eyebrow--muted">Delivery address</p>
            <h3>Tell us where to deliver</h3>
            <p className="auth-address__subtitle">
              Add your preferred address now or save it later from your profile.
            </p>
          </div>
          {collectAddress ? (
            <button
              type="button"
              className="auth-address__toggle"
              onClick={handleSkipAddress}
            >
              Skip for now
            </button>
          ) : (
            <button
              type="button"
              className="auth-address__toggle auth-address__toggle--primary"
              onClick={handleEnableAddress}
            >
              Add address
            </button>
          )}
        </div>
        {collectAddress ? (
          <>
            <div className="auth-address__grid">
              <label className="input-group">
                <span>Country</span>
                <input
                  id="signup-country"
                  name="country"
                  value={addressValues.country}
                  autoComplete="country-name"
                  onChange={handleAddressChange}
                  placeholder="Netherlands"
                />
              </label>
              <label className="input-group">
                <span>Postcode</span>
                <input
                  id="signup-postcode"
                  name="postcode"
                  value={addressValues.postcode}
                  autoComplete="postal-code"
                  onChange={handleAddressChange}
                  placeholder="1234 AB"
                />
              </label>
              <label className="input-group">
                <span>City</span>
                <input
                  id="signup-city"
                  name="city"
                  value={addressValues.city}
                  autoComplete="address-level2"
                  onChange={handleAddressChange}
                  placeholder="Eindhoven"
                />
              </label>
              <label className="input-group input-group--span">
                <span>Address Line 1</span>
                <input
                  id="signup-line1"
                  name="line1"
                  value={addressValues.line1}
                  autoComplete="address-line1"
                  onChange={handleAddressChange}
                  placeholder="Lime Lane 42"
                />
              </label>
              <label className="input-group input-group--span">
                <span>Address Line 2 (optional)</span>
                <input
                  id="signup-line2"
                  name="line2"
                  value={addressValues.line2}
                  autoComplete="address-line2"
                  onChange={handleAddressChange}
                  placeholder="Apartment, suite, etc."
                />
              </label>
            </div>
            <p className="auth-address__note">
              We will reuse this address during checkout so you can breeze through
              delivery details.
            </p>
          </>
        ) : (
          <div className="auth-address__placeholder">
            <p>
              Prefer to add it later? No problem—you can save it from your
              profile page.
            </p>
            <button
              type="button"
              className="button button--ghost"
              onClick={handleEnableAddress}
            >
              Add delivery address now
            </button>
          </div>
        )}
      </div>
      <label className="input-group">
        <span>Password</span>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button
        type="submit"
        className="button button--gradient"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Creating account..." : "Join the Club"}
      </button>
      {message && (
        <p
          className={`form-feedback${
            status === "error"
              ? " form-feedback--error"
              : status === "awaiting_verification"
              ? " form-feedback--success"
              : ""
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );

  const renderVerificationForm = () => (
    <form className="auth-card__form" onSubmit={handleVerifySubmit}>
      <div className="verification-banner">
        <p className="eyebrow">Verify &amp; Unlock</p>
        <h3>Enter the code we sent to {pendingEmail}</h3>
        {otpMeta?.expiresInSeconds && (
          <p className="verification-banner__hint">
            Codes stay fresh for {Math.round(otpMeta.expiresInSeconds / 60)} minutes.
          </p>
        )}
      </div>
      <label className="input-group">
        <span>
          Verification Code{" "}
          {otpMeta?.otpLength ? `( ${otpMeta.otpLength} digits )` : ""}
        </span>
        <input
          id="otp"
          name="otp"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={otpMeta?.otpLength ?? 6}
          value={otpCode}
          onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          required
        />
      </label>
      <button
        type="submit"
        className="button button--gradient"
        disabled={otpStatus === "loading"}
      >
        {otpStatus === "loading" ? "Verifying..." : "Confirm & Continue"}
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={handleResendCode}
        disabled={resendStatus === "loading"}
      >
        {resendStatus === "loading" ? "Resending..." : "Resend code"}
      </button>
      {otpMessage && (
        <p
          className={`form-feedback${
            otpStatus === "error"
              ? " form-feedback--error"
              : otpStatus === "success"
              ? " form-feedback--success"
              : ""
          }`}
        >
          {otpMessage}
        </p>
      )}
      <p className="auth-card__hint">
        Need help? Double-check spam folders or{" "}
        <span className="link-highlight" onClick={handleResendCode}>
          send another code
        </span>
        .
      </p>
    </form>
  );

  return (
    <section className="page auth-page">
      <div className="auth-page__panel">
        <p className="eyebrow">Join the Collective</p>
        <h1 className="page__title">Become a Lime Store Insider</h1>
        <p className="page__subtitle">
          Unlock private tastings, curated recommendations, and invitation-only
          releases crafted with our signature citrus artistry.
        </p>
      </div>
      <div className="auth-card">
        <h2 className="auth-card__title">
          {phase === "form" ? "Sign Up" : "Enter Verification Code"}
        </h2>
        {phase === "form" ? renderSignupForm() : renderVerificationForm()}
        {phase === "form" && (
          <p className="auth-card__hint">
            Already registered?{" "}
            <Link to="/login" className="link-highlight">
              Log in here.
            </Link>
          </p>
        )}
      </div>
    </section>
  );
};

export default Signup;
