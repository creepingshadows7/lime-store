import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatEuro } from "../utils/currency";
import { formatPublishedDate } from "../utils/dates";
import ProductEditor from "../components/ProductEditor";

const normalizeCategoriesList = (categoryList = []) => {
  const catalog = new Map();
  categoryList.forEach((category) => {
    if (!category) {
      return;
    }
    const rawId = category.id ?? category._id ?? category.slug ?? category.name ?? "";
    const normalizedId = typeof rawId === "string" ? rawId.trim() : "";
    if (!normalizedId) {
      return;
    }
    catalog.set(normalizedId, { ...category, id: normalizedId });
  });
  return Array.from(catalog.values()).sort((a, b) =>
    (a?.name ?? "").localeCompare(b?.name ?? "", undefined, {
      sensitivity: "base",
    })
  );
};

const ProductDetail = () => {
  const { productId } = useParams();
  const { isAuthenticated, profile } = useAuth();
  const { addItem } = useCart();
  const [status, setStatus] = useState("loading");
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);

  const applyCategories = useCallback((nextCategories) => {
    setCategories(normalizeCategoriesList(nextCategories ?? []));
  }, []);

  const appendCategories = useCallback((additionalCategories) => {
    if (!additionalCategories || additionalCategories.length === 0) {
      return;
    }
    setCategories((prev) =>
      normalizeCategoriesList([...prev, ...additionalCategories])
    );
  }, []);

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const roleKey = profile?.role ? profile.role.trim().toLowerCase() : "standard";

  const isAdmin =
    isAuthenticated &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL &&
    roleKey === "admin";
  const isSeller = isAdmin || roleKey === "seller";

  const refreshCategories = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/categories");
      const nextCategories = Array.isArray(data?.categories)
        ? data.categories
        : [];
      applyCategories(nextCategories);
    } catch (err) {
      // Non-blocking: category refresh failures should not break editing flow.
    }
  }, [applyCategories]);

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      setStatus("loading");
      setError("");
      try {
        const { data } = await apiClient.get(`/api/products/${productId}`);
        if (!isMounted) {
          return;
        }
        const loadedProduct = data?.product ?? null;
        setProduct(loadedProduct);
        if (loadedProduct?.categories) {
          appendCategories(loadedProduct.categories);
        }
        setStatus("success");
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const message =
          err.response?.data?.message ??
          "We could not load this creation. Please refresh.";
        setError(message);
        setStatus("error");
      }
    };

    if (productId) {
      fetchProduct();
    } else {
      setStatus("error");
      setError("This lime delight could not be found.");
    }

    return () => {
      isMounted = false;
    };
  }, [productId]);

  useEffect(() => {
    if (!isSeller) {
      return;
    }
    refreshCategories();
  }, [isSeller, refreshCategories]);

  const imageUrls = useMemo(() => {
    if (!product) {
      return [];
    }
    return [
      ...(Array.isArray(product.image_urls) ? product.image_urls : []),
      ...(product.image_url ? [product.image_url] : []),
    ]
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter((url, index, self) => url && self.indexOf(url) === index);
  }, [product]);

  useEffect(() => {
    if (activeImageIndex >= imageUrls.length) {
      setActiveImageIndex(0);
    }
  }, [imageUrls, activeImageIndex]);

  useEffect(() => {
    if (!isEditModalOpen) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isEditModalOpen]);

  const canManageProduct = useMemo(() => {
    if (!product) {
      return false;
    }
    const ownerEmail = product.created_by?.trim().toLowerCase() ?? "";
    if (!ownerEmail) {
      return isAdmin;
    }
    if (isAdmin) {
      return true;
    }
    if (!isSeller) {
      return false;
    }
    return ownerEmail === normalizedEmail;
  }, [product, isAdmin, isSeller, normalizedEmail]);

  if (status === "loading") {
    return (
      <section className="product-detail product-detail--loading">
        <p>Preparing the atelier spread...</p>
      </section>
    );
  }

  if (status === "error" || !product) {
    return (
      <section className="product-detail product-detail--error">
        <div>
          <p>{error || "This lime confection is unavailable."}</p>
          <Link to="/products" className="button button--outline">
            Back to collection
          </Link>
        </div>
      </section>
    );
  }

  const createdAtLabel = formatPublishedDate(product.created_at, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const priceLabel = formatEuro(product.price);
  const primaryImageUrl = imageUrls[activeImageIndex] ?? "";
  const variationNames = Array.isArray(product.variations)
    ? product.variations
        .map((variation) =>
          typeof variation?.name === "string" ? variation.name.trim() : ""
        )
        .filter((name) => Boolean(name))
    : [];

  const handleAddToCart = () => {
    if (!product) {
      return;
    }
    addItem(
      {
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: primaryImageUrl,
      },
      1
    );
  };

  const handleOpenEditor = () => {
    if (canManageProduct) {
      setIsEditModalOpen(true);
    }
  };

  const handleCloseEditor = () => {
    setIsEditModalOpen(false);
  };

  const handleProductUpdated = (updatedProduct) => {
    if (!updatedProduct) {
      return;
    }
    setProduct(updatedProduct);
    if (Array.isArray(updatedProduct.categories)) {
      appendCategories(updatedProduct.categories);
    }
    refreshCategories();
  };

  return (
    <section className="product-detail">
      <nav className="product-detail__breadcrumbs">
        <Link to="/products">Products</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>
      <div className="product-detail__layout">
        <div className="product-detail__gallery">
          {primaryImageUrl ? (
            <img
              src={primaryImageUrl}
              alt={`${product.name} primary view`}
              className="product-detail__hero"
            />
          ) : (
            <div className="product-detail__hero product-detail__hero--placeholder">
              Lime Atelier
            </div>
          )}
          {imageUrls.length > 1 && (
            <div className="product-detail__thumbnails">
              {imageUrls.map((url, index) => (
                <button
                  type="button"
                  key={`${product.id}-thumbnail-${index}`}
                  className={`product-detail__thumbnail${
                    index === activeImageIndex
                      ? " product-detail__thumbnail--active"
                      : ""
                  }`}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Preview image ${index + 1}`}
                >
                  <img src={url} alt={`${product.name} thumbnail ${index + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-detail__content">
          <header className="product-detail__header">
            <h1>{product.name}</h1>
            <p className="product-detail__price">{priceLabel}</p>
          </header>
          <p className="product-detail__description">
            {product.description?.trim().length
              ? product.description
              : "Awaiting tasting notes from our artisans."}
          </p>
          {Array.isArray(product.categories) && product.categories.length > 0 && (
            <div className="product-detail__categories">
              {product.categories.map((category) => (
                <span
                  key={category.id}
                  className="product-detail__category-pill"
                >
                  {category.name}
                </span>
              ))}
            </div>
          )}
          {variationNames.length > 0 && (
            <div className="product-detail__variations">
              <h3>Available Variations</h3>
              <div className="product-detail__variation-list">
                {variationNames.map((variationName, index) => (
                  <span
                    key={`${product.id}-variation-pill-${index}`}
                    className="product-detail__variation-pill"
                  >
                    {variationName}
                  </span>
                ))}
              </div>
            </div>
          )}
          <dl className="product-detail__meta">
            {product.created_by_name && (
              <div>
                <dt>Created by</dt>
                <dd>{product.created_by_name}</dd>
              </div>
            )}
            {createdAtLabel && (
              <div>
                <dt>First plated</dt>
                <dd>{createdAtLabel}</dd>
              </div>
            )}
            <div>
              <dt>Gallery</dt>
              <dd>{imageUrls.length || 1} photograph(s)</dd>
            </div>
          </dl>
          <div className="product-detail__actions">
            <button
              type="button"
              className="button button--gradient"
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
            {canManageProduct && (
              <button
                type="button"
                className="button button--outline"
                onClick={handleOpenEditor}
              >
                Refine details
              </button>
            )}
          </div>
        </div>
      </div>
      {isEditModalOpen && (
        <div className="product-editor-modal" role="presentation">
          <button
            type="button"
            className="product-editor-modal__backdrop"
            onClick={handleCloseEditor}
            aria-label="Close product editor"
          />
          <div
            className="product-editor-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
          >
            <ProductEditor
              productId={product.id}
              layout="modal"
              onClose={handleCloseEditor}
              onProductUpdated={handleProductUpdated}
              availableCategories={categories}
              onCategoriesChanged={refreshCategories}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default ProductDetail;
