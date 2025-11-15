const EmailChangeVerification = ({
  pendingEmail,
  otpValue,
  status,
  feedback,
  onOtpChange,
  onVerify,
}) => {
  if (!pendingEmail) {
    return null;
  }

  const isLoading = status === "loading";

  return (
    <div className="account-email-verification">
      <div className="account-email-verification__header">
        <p className="eyebrow eyebrow--muted">Lime Store New Email Confirmation</p>
        <h3>Lime Store New Email Confirmation</h3>
        <p className="account-address__subtitle">
          We sent a verification code to <strong>{pendingEmail}</strong>. Enter
          the digits below to finish updating your contact email.
        </p>
      </div>
      <div className="account-form account-form--otp">
        <div className="input-group">
          <span>Verification Code</span>
          <input
            id="email-change-otp"
            name="otp"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otpValue}
            onChange={onOtpChange}
            placeholder="Enter 6-digit code"
            autoComplete="one-time-code"
            required
          />
        </div>
        <div className="account-actions">
          <button
            type="button"
            className="button button--outline"
            onClick={onVerify}
            disabled={isLoading}
          >
            {isLoading ? "Verifying..." : "Verify Email"}
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
      </div>
    </div>
  );
};

export default EmailChangeVerification;
