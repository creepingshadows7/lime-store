import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Cart from "./pages/Cart";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Products from "./pages/Products";
import Signup from "./pages/Signup";
import "./App.css";
import { useAuth } from "./context/AuthContext";

const App = () => {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();
  const navigationItems = [
    { to: "/", label: "Home" },
    { to: "/products", label: "Products" },
    { to: "/cart", label: "Cart" },
  ];

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const accountLabel =
    (profile?.name && profile.name.trim()) ||
    (profile?.email && profile.email.trim()) ||
    "Guest";

  return (
    <div className="app-shell">
      <header className="lux-header">
        <div className="lux-header__brand">
          <NavLink to="/" className="brand-link">
            Lime Store
          </NavLink>
        </div>
        <nav className="lux-header__nav">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `lux-nav__item${isActive ? " lux-nav__item--active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="lux-header__account">
          {isAuthenticated ? (
            <div className="account-chip">
              <span className="account-chip__name">{accountLabel}</span>
              <button
                type="button"
                className="account-chip__logout"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="auth-actions">
              <NavLink to="/login" className="button button--outline">
                Log in
              </NavLink>
              <NavLink to="/signup" className="button button--gradient">
                Sign up
              </NavLink>
            </div>
          )}
        </div>
      </header>
      <main className="app-shell__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/cart" element={<Cart />} />
        </Routes>
      </main>
      <footer className="lux-footer">
        <p>
          Copyright {new Date().getFullYear()} Lime Store. Crafted for the lime
          connoisseur.
        </p>
      </footer>
    </div>
  );
};

export default App;
