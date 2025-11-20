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
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle");
  const [forgotMessage, setForgotMessage] = useState("");
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("idle");
  const [resetMessage, setResetMessage] = useState("");

  const triggerVerificationEmail = async (normalizedEmail) => {
    try {
      const { data } = await apiClient.post("/api/resend-code", {
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
      await apiClient.post("/api/verify-email", {
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

  const goBackToLogin = () => {
    setPhase("form");
    setStatus("idle");
    setMessage("");
    setForgotStatus("idle");
    setForgotMessage("");
    setResetStatus("idle");
    setResetMessage("");
    setResetOtp("");
    setResetNewPassword("");
    setResetConfirmPassword("");
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim().toLowerCase());
    setForgotStatus("idle");
    setForgotMessage("");
    setPhase("forgot");
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = forgotEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setForgotStatus("error");
      setForgotMessage("Please enter the email associated with your account.");
      return;
    }

    setForgotEmail(normalizedEmail);
    setForgotStatus("loading");
    setForgotMessage("");
    try {
      await apiClient.post("/api/request-reset", { email: normalizedEmail });
      setPasswordResetEmail(normalizedEmail);
      setResetOtp("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setResetStatus("success");
      setResetMessage("A reset code has been sent to your email");
      setPhase("reset");
    } catch (error) {
      setForgotStatus("error");
      setForgotMessage(
        error.response?.data?.message ??
          "We couldn't start the reset flow right now. Try again soon."
      );
    }
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = passwordResetEmail.trim().toLowerCase();
    if (!normalizedEmail || !resetOtp.trim()) {
      setResetStatus("error");
      setResetMessage("Please fill in all fields to reset your password.");
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetStatus("error");
      setResetMessage("New password confirmation does not match.");
      return;
    }

    setResetStatus("loading");
    setResetMessage("");

    try {
      await apiClient.post("/api/reset-password", {
        email: normalizedEmail,
        otp: resetOtp.trim(),
        new_password: resetNewPassword,
      });

      setResetStatus("success");
      setResetMessage("Your password has been reset. You can now log in.");
      setPasswordResetEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setPassword("");
      setStatus("success");
      setMessage("Your password has been reset. You can now log in.");
      setResetOtp("");
      setResetNewPassword("");
      setResetConfirmPassword("");
    } catch (error) {
      setResetStatus("error");
      setResetMessage(
        error.response?.data?.message ??
          "We couldn't reset your password with that code."
      );
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
      <p className="auth-card__hint">
        <button
          type="button"
          className="link-button link-highlight"
          onClick={openForgotPassword}
          disabled={status === "loading"}
        >
          Forgot password?
        </button>
      </p>
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
          placeholder="------"
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

  const renderForgotForm = () => (
    <form className="auth-card__form" onSubmit={handleForgotSubmit}>
      <div className="verification-banner">
        <p className="eyebrow">Need Help?</p>
        <h3>Reset Your Password</h3>
        <p className="verification-banner__hint">
          Enter your email address and we will email you a 6-digit reset code.
        </p>
      </div>
      <label className="input-group">
        <span>Email</span>
        <input
          id="forgot-email"
          name="forgot-email"
          type="email"
          value={forgotEmail}
          onChange={(event) => setForgotEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <button
        type="submit"
        className="button button--gradient"
        disabled={forgotStatus === "loading"}
      >
        {forgotStatus === "loading" ? "Sending code..." : "Send reset code"}
      </button>
      {forgotMessage && (
        <p
          className={`form-feedback${
            forgotStatus === "error"
              ? " form-feedback--error"
              : " form-feedback--success"
          }`}
        >
          {forgotMessage}
        </p>
      )}
      <p className="auth-card__hint">
        Remembered your password?{" "}
        <span className="link-highlight" onClick={goBackToLogin}>
          Return to login
        </span>
        .
      </p>
    </form>
  );

  const renderResetForm = () => (
    <form className="auth-card__form" onSubmit={handleResetSubmit}>
      <div className="verification-banner">
        <p className="eyebrow">Enter Your Code</p>
        <h3>Reset Password</h3>
        <p className="verification-banner__hint">
          We sent a reset code to{" "}
          <strong>{passwordResetEmail || "your email"}</strong>. Enter it below
          along with your new password.
        </p>
      </div>
      <label className="input-group">
        <span>Email</span>
        <input
          id="reset-email"
          name="reset-email"
          type="email"
          value={passwordResetEmail}
          onChange={(event) => setPasswordResetEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="input-group">
        <span>Reset Code</span>
        <input
          id="reset-otp"
          name="reset-otp"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={resetOtp}
          onChange={(event) => setResetOtp(event.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          required
        />
      </label>
      <label className="input-group">
        <span>New Password</span>
        <input
          id="reset-new-password"
          name="reset-new-password"
          type="password"
          value={resetNewPassword}
          onChange={(event) => setResetNewPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <label className="input-group">
        <span>Confirm New Password</span>
        <input
          id="reset-confirm-password"
          name="reset-confirm-password"
          type="password"
          value={resetConfirmPassword}
          onChange={(event) => setResetConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <button
        type="submit"
        className="button button--gradient"
        disabled={resetStatus === "loading"}
      >
        {resetStatus === "loading" ? "Updating..." : "Reset password"}
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => {
          setForgotEmail(passwordResetEmail);
          setForgotStatus("idle");
          setForgotMessage("");
          setPhase("forgot");
        }}
      >
        Need a new code?
      </button>
      {resetMessage && (
        <p
          className={`form-feedback${
            resetStatus === "error"
              ? " form-feedback--error"
              : resetStatus === "success"
              ? " form-feedback--success"
              : ""
          }`}
        >
          {resetMessage}
        </p>
      )}
      <p className="auth-card__hint">
        Ready to sign in?{" "}
        <span className="link-highlight" onClick={goBackToLogin}>
          Back to login
        </span>
        .
      </p>
    </form>
  );

  const getCardTitle = () => {
    switch (phase) {
      case "verify":
        return "Verify Your Email";
      case "forgot":
        return "Forgot Password";
      case "reset":
        return "Reset Password";
      default:
        return "Log In";
    }
  };

  const renderActiveForm = () => {
    switch (phase) {
      case "verify":
        return renderVerificationForm();
      case "forgot":
        return renderForgotForm();
      case "reset":
        return renderResetForm();
      default:
        return renderLoginForm();
    }
  };

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
        <h2 className="auth-card__title">{getCardTitle()}</h2>
        {renderActiveForm()}
        {phase === "form" ? (
          <p className="auth-card__hint">
            New to Lime Store?{" "}
            <Link to="/signup" className="link-highlight">
              Create an account.
            </Link>
          </p>
        ) : phase === "verify" ? (
          <p className="auth-card__hint">
            Enter the code to finish activating your profile. Need to update the
            email?{" "}
            <span
              className="link-highlight"
              onClick={goBackToLogin}
            >
              Go back to login.
            </span>
          </p>
        ) : null}
        {phase === "forgot" && (
          <p className="auth-card__hint">
            Looking for your code? Check spam folders or{" "}
            <span className="link-highlight" onClick={openForgotPassword}>
              request it again.
            </span>
          </p>
        )}
        {phase === "reset" && (
          <p className="auth-card__hint">
            Need another reset email?{" "}
            <span
              className="link-highlight"
              onClick={() => {
                setForgotEmail(passwordResetEmail);
                setForgotStatus("idle");
                setForgotMessage("");
                setPhase("forgot");
              }}
            >
              Send a new code.
            </span>
          </p>
        )}
      </div>
    </section>
  );
};

export default Login;
