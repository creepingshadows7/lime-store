import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Account from "./pages/Account";
import Cart from "./pages/Cart";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import ProductEdit from "./pages/ProductEdit";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Checkout from "./pages/Checkout";
import PaymentPage from "./pages/PaymentPage";
import PaymentCancelPage from "./pages/PaymentCancelPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import MyOrders from "./pages/MyOrders";
import MyOrderDetail from "./pages/MyOrderDetail";
import AdminOrders from "./pages/AdminOrders";
import AdminOrderDetail from "./pages/AdminOrderDetail";
import "./App.css";
import { useAuth } from "./context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "./constants";
import { getProfileInitial } from "./utils/profile";

const App = () => {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();
  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  const navigationItems = [
    { to: "/", label: "Home" },
    { to: "/products", label: "Products" },
    { to: "/cart", label: "Cart" },
    { to: "/my-orders", label: "My Orders", authOnly: true },
    { to: "/account", label: "Account", authOnly: true },
  ];

  if (isAdmin) {
    navigationItems.push({ to: "/admin", label: "Admin", authOnly: true });
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const accountLabel =
    (profile?.name && profile.name.trim()) ||
    (profile?.email && profile.email.trim()) ||
    "Guest";
  const avatarUrl = profile?.avatar_url ?? "";
  const avatarInitial = getProfileInitial(profile);

  return (
    <div className="app-shell">
      <header className="lux-header">
        <div className="lux-header__brand">
          <NavLink to="/" className="brand-link">
            Lime Store
          </NavLink>
        </div>
        <nav className="lux-header__nav">
          {navigationItems
            .filter((item) => !item.authOnly || isAuthenticated)
            .map((item) => (
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
              <div
                className="account-chip__avatar"
                role="img"
                aria-label={`${accountLabel}'s avatar`}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="account-chip__avatar-image"
                  />
                ) : (
                  <span className="account-chip__avatar-fallback">
                    {avatarInitial}
                  </span>
                )}
              </div>
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
          <Route path="/products/:productId" element={<ProductDetail />} />
          <Route path="/products/:productId/edit" element={<ProductEdit />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          <Route path="/payment/cancel" element={<PaymentCancelPage />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/my-orders/:orderId" element={<MyOrderDetail />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/orders/:orderId" element={<AdminOrderDetail />} />
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
