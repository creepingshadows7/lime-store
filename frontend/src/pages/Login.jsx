import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";

const Login = () => {
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("password123");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      const { data } = await apiClient.post("/api/login", {
        username,
        password,
      });
      localStorage.setItem("limeShopToken", data.access_token);
      setMessage(`Welcome back, ${data.user}!`);
      navigate("/checkout");
    } catch (err) {
      setMessage("Login failed. Check your credentials and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Login;
