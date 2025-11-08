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

      const { data } = await apiClient.post("/api/register", {
        name: safeName,
        email: normalizedEmail,
        password,
        ...(safePhone ? { phone: safePhone } : {}),
      });

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

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    setOtpStatus("loading");
    setOtpMessage("");

    try {
      await apiClient.post("/api/verify-otp", {
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
      await apiClient.post("/api/send-otp", { email: pendingEmail });
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
