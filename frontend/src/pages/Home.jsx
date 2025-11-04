import { useEffect, useState } from "react";
import apiClient from "../api/client";

const Home = () => {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      setStatus("loading");
      try {
        const { data } = await apiClient.get("/api/products");
        setProducts(data.products ?? []);
        setStatus("success");
      } catch (err) {
        setError("Unable to load products. Please try again later.");
        setStatus("error");
      }
    };

    loadProducts();
  }, []);

  if (status === "loading") {
    return <p>Loading products...</p>;
  }

  if (status === "error") {
    return <p>{error}</p>;
  }

  return (
    <div>
      <h1>Welcome to Lime Shop</h1>
      <p>Our favorite lime-themed picks for you:</p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <strong>{product.name}</strong> - ${product.price}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Home;
