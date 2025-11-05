import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";

const initialFormState = {
  name: "",
  price: "",
  image_url: "",
  description: "",
};

const Products = () => {
  const { isAuthenticated, profile } = useAuth();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState(initialFormState);
  const [formStatus, setFormStatus] = useState("idle");
  const [formFeedback, setFormFeedback] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const roleKey = profile?.role
    ? profile.role.trim().toLowerCase()
    : "standard";

  const isAdmin =
    isAuthenticated &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL &&
    roleKey === "admin";
  const isSeller = isAdmin || roleKey === "seller";

  useEffect(() => {
    if (!isSeller) {
      setShowUploadForm(false);
    }
  }, [isSeller]);

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      setStatus("loading");
      setError("");

      try {
        const { data } = await apiClient.get("/api/products");
        if (!isMounted) {
          return;
        }
        setProducts(Array.isArray(data?.products) ? data.products : []);
        setStatus("success");
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError("We could not display the collection right now. Please retry.");
        setStatus("error");
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const formatPrice = (value) => {
    const parsed =
      typeof value === "number" ? value : Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed.toFixed(2);
    }
    return "0.00";
  };

  const handleToggleUpload = () => {
    setShowUploadForm((prev) => !prev);
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (formStatus === "loading") {
      return;
    }

    const name = formValues.name.trim();
    const imageUrl = formValues.image_url.trim();
    const description = formValues.description.trim();
    const cleanedPrice = formValues.price.trim();

    if (name.length < 3) {
      setFormStatus("error");
      setFormFeedback("Please provide a name with at least three characters.");
      return;
    }

    const numericPrice = Number.parseFloat(cleanedPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setFormStatus("error");
      setFormFeedback("Enter a valid price greater than zero.");
      return;
    }

    setFormStatus("loading");
    setFormFeedback("");

    try {
      const { data } = await apiClient.post("/api/products", {
        name,
        price: numericPrice,
        image_url: imageUrl,
        description,
      });

      const createdProduct = data?.product ?? null;

      setProducts((prev) =>
        createdProduct ? [createdProduct, ...prev] : prev
      );
      setFormStatus("success");
      setFormFeedback(data?.message ?? "Product added successfully.");
      setFormValues(initialFormState);
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not publish this item. Please try again.";
      setFormStatus("error");
      setFormFeedback(message);
    }
  };

  return (
    <section className="page products-page">
      <header className="products-hero">
        <div className="products-hero__copy">
          <p className="eyebrow">The Atelier</p>
          <h1 className="page__title">Indulgent Lime Creations</h1>
          <p className="page__subtitle">
            Explore confections hand finished with bright citrus layers. Every
            item is crafted in micro batches for the Lime Store tasting room.
          </p>
        </div>
        {isSeller && (
          <div className="products-hero__actions">
            <button
              type="button"
              className="button button--gradient"
              onClick={handleToggleUpload}
            >
              {showUploadForm ? "Close Upload" : "Add Product"}
            </button>
          </div>
        )}
      </header>

      {isSeller && (
        <section
          className={`product-upload${
            showUploadForm ? " product-upload--open" : ""
          }`}
        >
          <div className="product-upload__header">
            <h2>Showcase a New Indulgence</h2>
            <p>
              Upload imagery, refine the tasting notes, and set the pricing for
              your latest lime creation. Admins and sellers can publish items
              instantly to the boutique.
            </p>
          </div>
          <form className="product-upload__form" onSubmit={handleUpload}>
            <div className="product-upload__grid">
              <label className="input-group">
                <span>Product Name</span>
                <input
                  id="product-name"
                  name="name"
                  value={formValues.name}
                  onChange={handleFieldChange}
                  placeholder="Velvet Lime Gateau"
                  required
                />
              </label>
              <label className="input-group">
                <span>Price</span>
                <input
                  id="product-price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formValues.price}
                  onChange={handleFieldChange}
                  placeholder="24.00"
                  required
                />
              </label>
              <label className="input-group">
                <span>Image URL</span>
                <input
                  id="product-image"
                  name="image_url"
                  type="url"
                  value={formValues.image_url}
                  onChange={handleFieldChange}
                  placeholder="https://"
                />
              </label>
            </div>
            <label className="input-group product-upload__description">
              <span>Tasting Notes</span>
              <textarea
                id="product-description"
                name="description"
                rows={4}
                value={formValues.description}
                onChange={handleFieldChange}
                placeholder="Describe the textures, garnishes, and lime varietals that make this item special."
              />
            </label>
            <div className="product-upload__actions">
              <button
                type="submit"
                className="button button--gradient"
                disabled={formStatus === "loading"}
              >
                {formStatus === "loading" ? "Uploading..." : "Upload Product"}
              </button>
            </div>
            {formFeedback && (
              <p
                className={`form-feedback${
                  formStatus === "error"
                    ? " form-feedback--error"
                    : formStatus === "success"
                    ? " form-feedback--success"
                    : ""
                }`}
              >
                {formFeedback}
              </p>
            )}
          </form>
        </section>
      )}

      {status === "loading" && (
        <div className="page__status">Preparing your collection...</div>
      )}
      {status === "error" && (
        <div className="page__status page__status--error">{error}</div>
      )}

      {status === "success" && (
        <section className="products-showcase">
          <header className="products-showcase__intro">
            <h2>Curated For Lime Enthusiasts</h2>
            <p>
              Limited run desserts, chilled beverages, and patisserie pieces
              plated to celebrate the full spectrum of lime.
            </p>
          </header>
          <div className="product-grid product-grid--elevated">
            {products.map((product) => {
              const priceLabel = formatPrice(product.price);
              const createdBy = product.created_by
                ? product.created_by.split("@")[0]
                : "Lime Atelier";
              const description =
                product.description && product.description.trim().length > 0
                  ? product.description
                  : "Awaiting tasting notes from our artisans.";

              return (
                <article key={product.id} className="product-card product-card--elevated">
                  <div className="product-card__media">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="product-card__placeholder">
                        Lime Atelier
                      </div>
                    )}
                  </div>
                  <div className="product-card__content">
                    <div className="product-card__header">
                      <h3 className="product-card__name">{product.name}</h3>
                      <span className="product-card__creator">
                        Crafted by {createdBy}
                      </span>
                    </div>
                    <p className="product-card__description">{description}</p>
                    <div className="product-card__footer">
                      <span className="product-card__price">${priceLabel}</span>
                      <button
                        type="button"
                        className="button button--outline product-card__button"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
};

export default Products;
