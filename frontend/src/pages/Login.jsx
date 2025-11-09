import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStatus, setOtpStatus] = useState("idle");
  const [otpMessage, setOtpMessage] = useState("");
  const [otpMeta, setOtpMeta] = useState(null);
  const [resendStatus, setResendStatus] = useState("idle");

  const triggerVerificationEmail = async (normalizedEmail) => {
    try {
      const { data } = await apiClient.post("/api/send-otp", {
        email: normalizedEmail,
      });

      setOtpMeta({
        otpLength: data?.otp_length ?? 6,
        expiresInSeconds: data?.expires_in_seconds ?? 300,
        expiresAt: data?.expires_at ?? null,
      });
      setOtpMessage(
        data?.message ??
          "We just sent you a fresh verification code. Enter it below."
      );
    } catch (error) {
      setOtpMessage(
        error.response?.data?.message ??
          "We couldn't send the verification email right now."
      );
      throw error;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await apiClient.post("/api/login", {
        email: normalizedEmail,
        password,
      });

      login(data.access_token, data.user);
      setStatus("success");
      const displayName = data.user?.name || data.user?.email || "friend";
      setMessage(`Welcome back, ${displayName}.`);
      navigate("/products");
    } catch (err) {
      const isVerificationHold =
        err.response?.status === 403 && err.response?.data?.requires_verification;

      if (isVerificationHold) {
        const normalizedEmail = email.trim().toLowerCase();
        setPendingEmail(normalizedEmail);
        setPhase("verify");
        setStatus("awaiting_verification");
        setMessage(
          err.response?.data?.message ??
            "Please verify your email to finish signing in."
        );
        setOtpStatus("idle");
        setOtpMessage("");
        setOtpCode("");
        await triggerVerificationEmail(normalizedEmail);
        return;
      }

      setStatus("error");
      setMessage("We could not confirm those credentials. Please try again.");
    }
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    if (!pendingEmail) {
      return;
    }

    setOtpStatus("loading");
    setOtpMessage("");

    try {
      await apiClient.post("/api/verify-otp", {
        email: pendingEmail,
        otp: otpCode.trim(),
      });

      setOtpStatus("success");
      setOtpMessage("Email verified! Signing you in...");

      const { data } = await apiClient.post("/api/login", {
        email: pendingEmail,
        password,
      });

      login(data.access_token, data.user);
      navigate("/products");
    } catch (error) {
      setOtpStatus("error");
      if (error.response?.status === 400) {
        setOtpMessage(error.response.data?.message ?? "That code didn't work.");
      } else {
        setOtpMessage(
          error.response?.data?.message ??
            "We couldn't verify that code. Please try again."
        );
      }
    }
  };

  const handleResendCode = async () => {
    if (!pendingEmail || resendStatus === "loading") {
      return;
    }

    setResendStatus("loading");
    setOtpMessage("");

    try {
      await triggerVerificationEmail(pendingEmail);
      setResendStatus("success");
    } catch (error) {
      setResendStatus("error");
    } finally {
      setTimeout(() => setResendStatus("idle"), 3000);
    }
  };

  const renderLoginForm = () => (
    <form className="auth-card__form" onSubmit={handleSubmit}>
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
        <span>Password</span>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button
        type="submit"
        className="button button--gradient"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Signing you in..." : "Enter"}
      </button>
      {message && (
        <p
          className={`form-feedback${
            status === "error"
              ? " form-feedback--error"
              : status === "success"
              ? " form-feedback--success"
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
        <p className="eyebrow">One More Step</p>
        <h3>Verify {pendingEmail}</h3>
        {otpMeta?.expiresInSeconds ? (
          <p className="verification-banner__hint">
            Codes stay valid for{" "}
            {Math.round((otpMeta.expiresInSeconds ?? 300) / 60)} minutes.
          </p>
        ) : (
          <p className="verification-banner__hint">
            Enter the 6-digit code from your inbox to continue.
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
        {otpStatus === "loading" ? "Verifying..." : "Verify & Continue"}
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
        <p className="eyebrow">Member Access</p>
        <h1 className="page__title">Welcome to the Inner Circle</h1>
        <p className="page__subtitle">
          Sign in to manage your purchases, track bespoke orders, and access
          exclusive tastings.
        </p>
      </div>
      <div className="auth-card">
        <h2 className="auth-card__title">
          {phase === "form" ? "Log In" : "Verify Your Email"}
        </h2>
        {phase === "form" ? renderLoginForm() : renderVerificationForm()}
        {phase === "form" ? (
          <p className="auth-card__hint">
            New to Lime Store?{" "}
            <Link to="/signup" className="link-highlight">
              Create an account.
            </Link>
          </p>
        ) : (
          <p className="auth-card__hint">
            Enter the code to finish activating your profile. Need to update the
            email?{" "}
            <span
              className="link-highlight"
              onClick={() => {
                setPhase("form");
                setStatus("idle");
                setMessage("");
              }}
            >
              Go back to login.
            </span>
          </p>
        )}
      </div>
    </section>
  );
};

export default Login;
