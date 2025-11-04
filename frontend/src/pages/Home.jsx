import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";

const Home = () => {
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    const loadFeatured = async () => {
      try {
        const { data } = await apiClient.get("/api/products");
        const items = data.products ?? [];
        setFeatured(items.slice(0, 3));
      } catch (err) {
        setFeatured([]);
      }
    };

    loadFeatured();
  }, []);

  return (
    <section className="page home-hero">
      <div className="home-hero__content">
        <p className="eyebrow">Boutique Citrus Experiences</p>
        <h1 className="home-hero__title">
          A Luxurious Reimagining of the Lime.
        </h1>
        <p className="home-hero__subtitle">
          Lime Store curates exquisite desserts, beverages, and delights that
          reveal the vibrant depth of citrus. Step into an indulgent tasting
          journey crafted for the modern epicure.
        </p>
        <div className="hero-actions">
          <Link to="/products" className="button button--gradient">
            Explore Products
          </Link>
          <Link to="/cart" className="button button--ghost">
            Visit Cart
          </Link>
        </div>
      </div>
      <div className="home-hero__showcase">
        <div className="showcase-grid">
          {featured.map((product) => (
            <article key={product.id} className="showcase-card">
              <span className="showcase-card__tag">Signature</span>
              <h2 className="showcase-card__name">{product.name}</h2>
              <p className="showcase-card__price">${product.price}</p>
            </article>
          ))}
        </div>
        <p className="showcase__caption">
          Handpicked by our in-house tasting experts. Limited availability.
        </p>
      </div>
    </section>
  );
};

export default Home;
