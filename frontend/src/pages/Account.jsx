import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

const initialState = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

const Account = () => {
  const { isAuthenticated, profile, login } = useAuth();
  const [formValues, setFormValues] = useState(initialState);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  const sanitizedProfile = useMemo(
    () => ({
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
    }),
    [profile]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoadingProfile(false);
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
      } catch (error) {
        setFeedback(
          "We couldn't refresh your profile details. The view shows your last known information."
        );
        setFormValues((prev) => ({
          ...prev,
          ...sanitizedProfile,
          password: "",
        }));
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [isAuthenticated, sanitizedProfile]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
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
        )}
      </div>
    </section>
  );
};

export default Account;
