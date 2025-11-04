import { useEffect, useState } from "react";
import apiClient from "../api/client";

const Products = () => {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      setStatus("loading");
      try {
        const { data } = await apiClient.get("/api/products");
        setProducts(data.products ?? []);
        setStatus("success");
      } catch (err) {
        setError("We could not display the collection right now. Please retry.");
        setStatus("error");
      }
    };

    fetchProducts();
  }, []);

  return (
    <section className="page products-page">
      <header className="page__intro">
        <p className="eyebrow">The Collection</p>
        <h1 className="page__title">Indulgent Lime Creations</h1>
        <p className="page__subtitle">
          Discover artisanal treats infused with vibrant citrus notes, curated
          for discerning palates.
        </p>
      </header>

      {status === "loading" && (
        <div className="page__status">Preparing your collection...</div>
      )}
      {status === "error" && <div className="page__status page__status--error">{error}</div>}

      {status === "success" && (
        <div className="product-grid">
          {products.map((product) => (
            <article key={product.id} className="product-card">
              <div className="product-card__glow" />
              <h2 className="product-card__name">{product.name}</h2>
              <p className="product-card__price">${product.price}</p>
              <p className="product-card__cta">Add to cart</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default Products;
