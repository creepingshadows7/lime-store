import { Link, Route, Routes } from "react-router-dom";
import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import "./App.css";

const App = () => {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Lime Shop</h1>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/login">Login</Link>
          <Link to="/checkout">Checkout</Link>
        </nav>
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/checkout" element={<Checkout />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
