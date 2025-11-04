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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const safeName = name.trim();
      const safePhone = phone.trim();

      await apiClient.post("/api/register", {
        name: safeName,
        email: normalizedEmail,
        password,
        ...(safePhone ? { phone: safePhone } : {}),
      });

      const { data } = await apiClient.post("/api/login", {
        email: normalizedEmail,
        password,
      });

      login(data.access_token, data.user);
      setStatus("success");
      setMessage("Account created successfully. Redirecting...");
      navigate("/products");
    } catch (err) {
      setStatus("error");
      if (err.response?.status === 400) {
        setMessage(err.response.data?.message ?? "That email is already registered.");
      } else {
        setMessage("We could not create your account. Please try again.");
      }
    }
  };

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
        <h2 className="auth-card__title">Sign Up</h2>
        <form className="auth-card__form" onSubmit={handleSubmit}>
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
                  : status === "success"
                  ? " form-feedback--success"
                  : ""
              }`}
            >
              {message}
            </p>
          )}
        </form>
        <p className="auth-card__hint">
          Already registered?{" "}
          <Link to="/login" className="link-highlight">
            Log in here.
          </Link>
        </p>
      </div>
    </section>
  );
};

export default Signup;
