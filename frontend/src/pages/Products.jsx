import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatEuro } from "../utils/currency";
import { formatPublishedDate } from "../utils/dates";
import ProductEditor from "../components/ProductEditor";

const initialFormState = {
  name: "",
  price: "",
  description: "",
};

const extractApiMessage = (error, fallback) => {
  if (error?.response?.status === 413) {
    return "Uploads must stay under 16 MB. Please choose a smaller image.";
  }

  const data = error?.response?.data;
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (data && typeof data === "object") {
    const potentialMessage = data.message || data.msg;
    if (typeof potentialMessage === "string" && potentialMessage.trim()) {
      return potentialMessage.trim();
    }
  }

  return fallback;
};

const Products = () => {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState(initialFormState);
  const [formStatus, setFormStatus] = useState("idle");
  const [formFeedback, setFormFeedback] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [managementFeedback, setManagementFeedback] = useState({
    state: "idle",
    message: "",
  });
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const previousPreviewsRef = useRef([]);
  const fileInputRef = useRef(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const modalContainerRef = useRef(null);

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const roleKey = profile?.role ? profile.role.trim().toLowerCase() : "standard";

  const isAdmin =
    isAuthenticated &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL &&
    roleKey === "admin";
  const isSeller = isAdmin || roleKey === "seller";

  useEffect(() => {
    return () => {
      const previous = Array.isArray(previousPreviewsRef.current)
        ? previousPreviewsRef.current
        : [];
      previous.forEach((preview) => {
        if (typeof preview === "string" && preview.startsWith("blob:")) {
          URL.revokeObjectURL(preview);
        }
      });
    };
  }, []);

  const updateImagePreviews = (nextPreviews) => {
    const normalizedNext = Array.isArray(nextPreviews) ? nextPreviews : [];
    const previous = Array.isArray(previousPreviewsRef.current)
      ? previousPreviewsRef.current
      : [];

    previous.forEach((preview) => {
      if (
        typeof preview === "string" &&
        preview.startsWith("blob:") &&
        !normalizedNext.includes(preview)
      ) {
        URL.revokeObjectURL(preview);
      }
    });

    previousPreviewsRef.current = normalizedNext;
    setImagePreviews(normalizedNext);
  };

  const resetUploadState = () => {
    setFormValues(initialFormState);
    setFormStatus("idle");
    setFormFeedback("");
    setSelectedImageFiles([]);
    updateImagePreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!isSeller) {
      setShowUploadForm(false);
      resetUploadState();
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

  useEffect(() => {
    if (isEditModalOpen && modalContainerRef.current) {
      if (typeof modalContainerRef.current.scrollTo === "function") {
        modalContainerRef.current.scrollTo({ top: 0, behavior: "auto" });
      } else {
        modalContainerRef.current.scrollTop = 0;
      }
    }
  }, [isEditModalOpen, editingProductId]);

  const handleToggleUpload = () => {
    setShowUploadForm((prev) => !prev);
    setManagementFeedback({ state: "idle", message: "" });
    resetUploadState();
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleImagesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    const imageFiles = files.filter((file) => file && file.type?.startsWith("image/"));
    setSelectedImageFiles(imageFiles);
    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    updateImagePreviews(previews);
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();

    if (formStatus === "loading") {
      return;
    }

    const name = formValues.name.trim();
    const description = formValues.description.trim();
    const cleanedPrice = formValues.price.toString().trim();

    if (name.length < 3) {
      setFormStatus("error");
      setFormFeedback("Please provide a name with at least three characters.");
      return;
    }

    if (selectedImageFiles.length === 0) {
      setFormStatus("error");
      setFormFeedback("Please upload at least one image for this product.");
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
    setManagementFeedback({ state: "idle", message: "" });

    const formData = new FormData();
    formData.append("name", name);
    formData.append("price", numericPrice.toString());
    formData.append("description", description);
    selectedImageFiles.forEach((file) => formData.append("images", file));

    const config = {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    };

    try {
      const { data } = await apiClient.post("/api/products", formData, config);
      const createdProduct = data?.product ?? null;

      setProducts((prev) =>
        createdProduct ? [createdProduct, ...prev] : prev
      );
      setFormStatus("success");
      setFormFeedback(data?.message ?? "Product added successfully.");
      setManagementFeedback({
        state: "success",
        message: data?.message ?? "Product added successfully.",
      });
      resetUploadState();
      setShowUploadForm(false);
    } catch (err) {
      let message = extractApiMessage(
        err,
        "We could not publish this item. Please try again."
      );

      if (err?.response?.status === 401) {
        message = "Your session expired. Please sign in again to continue.";
        logout();
        navigate("/login");
      }

      setFormStatus("error");
      setFormFeedback(message);
      setManagementFeedback({
        state: "error",
        message,
      });
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!productId) {
      return;
    }

    const confirmDelete = window.confirm(
      "Remove this product from the boutique?"
    );
    if (!confirmDelete) {
      return;
    }

    setManagementFeedback({ state: "idle", message: "" });

    try {
      const { data } = await apiClient.delete(`/api/products/${productId}`);
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      setManagementFeedback({
        state: "success",
        message: data?.message ?? "Product removed successfully.",
      });
    } catch (err) {
      let message =
        err.response?.data?.message ??
        "We could not remove this item. Please try again.";

      if (err?.response?.status === 401) {
        message = "Your session expired. Please sign in again to continue.";
        logout();
        navigate("/login");
      }

      setManagementFeedback({
        state: "error",
        message,
      });
    }
  };

  const canManageProduct = (product) => {
    if (!isAuthenticated) {
      return false;
    }

    if (isAdmin) {
      return true;
    }

    if (!isSeller) {
      return false;
    }

    const ownerEmail = product?.created_by?.trim().toLowerCase() ?? "";
    return ownerEmail && ownerEmail === normalizedEmail;
  };

  const handleOpenProduct = (productId) => {
    if (!productId) {
      return;
    }
    navigate(`/products/${productId}`);
  };

  const handleCardKeyDown = (event, productId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenProduct(productId);
    }
  };

  const handleAddToCart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Cart logic to be implemented.
  };

  const handleProductUpdated = (updatedProduct) => {
    if (!updatedProduct) {
      return;
    }
    setProducts((prev) =>
      prev.map((product) =>
        product.id === updatedProduct.id ? updatedProduct : product
      )
    );
    setManagementFeedback({
      state: "success",
      message: "Product updated successfully.",
    });
  };

  const handleEditProduct = (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    if (!productId) {
      return;
    }
    setEditingProductId(productId);
    setIsEditModalOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditModalOpen(false);
    setEditingProductId(null);
  };

  return (
    <section className="page products-page">
      <header className="products-hero">
        <div className="products-hero__copy">
          <h1>Lime Atelier Collection</h1>
          <p>
            Explore our gallery of limited-batch desserts, chilled beverages, and
            patisserie creations. Click any product to open its dedicated detail
            page for a spacious, immersive view.
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
              Upload imagery, refine the tasting notes, and set pricing for your
              latest lime creation. Admins and sellers can publish items instantly
              to the boutique.
            </p>
          </div>
          {showUploadForm && (
            <form className="product-upload__form" onSubmit={handleCreateProduct}>
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
                  <span>Product Images</span>
                  <input
                    id="product-images"
                    name="images"
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImagesChange}
                    multiple
                    required
                  />
                  <span className="input-hint">
                    Upload one or more high-quality photos (PNG, JPG, JPEG, GIF, or
                    WEBP).
                  </span>
                </label>
              </div>
              {imagePreviews.length > 0 && (
                <div className="product-upload__preview">
                  <div className="product-upload__preview-group">
                    <div className="product-upload__preview-header">
                      <span>New Uploads</span>
                    </div>
                    <div className="product-upload__preview-grid">
                      {imagePreviews.map((preview, index) => (
                        <div
                          key={`${preview}-${index}`}
                          className="product-upload__preview-item product-upload__preview-item--new"
                        >
                          <img
                            src={preview}
                            alt={`Selected upload ${index + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
                <button
                  type="button"
                  className="button button--outline"
                  onClick={handleToggleUpload}
                  disabled={formStatus === "loading"}
                >
                  Cancel
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
          )}
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
          {managementFeedback.message && (
            <p
              className={`form-feedback products-showcase__feedback${
                managementFeedback.state === "error"
                  ? " form-feedback--error"
                  : managementFeedback.state === "success"
                  ? " form-feedback--success"
                  : ""
              }`}
            >
              {managementFeedback.message}
            </p>
          )}
          <header className="products-showcase__intro">
            <h2>Curated for Lime Enthusiasts</h2>
            <p>
              Dive into each product&apos;s dedicated detail page to view expanded
              galleries, tasting notes, and publishing history.
            </p>
          </header>
          <div className="product-grid product-grid--elevated">
            {products.map((product) => {
              const priceLabel = formatEuro(product.price);
              const rawPublisherName =
                typeof product.created_by_name === "string"
                  ? product.created_by_name.trim()
                  : "";
              const publisherName =
                rawPublisherName.length > 0
                  ? rawPublisherName
                  : product.created_by
                  ? product.created_by.split("@")[0]
                  : "Lime Atelier";
              const description =
                product.description && product.description.trim().length > 0
                  ? product.description
                  : "Awaiting tasting notes from our artisans.";
              const imageUrls = [
                ...(Array.isArray(product.image_urls) ? product.image_urls : []),
                ...(product.image_url ? [product.image_url] : []),
              ]
                .map((url) => (typeof url === "string" ? url.trim() : ""))
                .filter((url, index, self) => url && self.indexOf(url) === index);
              const primaryImageUrl = imageUrls[0] ?? "";
              const createdAtLabel = formatPublishedDate(product.created_at);

              return (
                <article
                  key={product.id}
                  className="product-card product-card--elevated"
                  onClick={() => handleOpenProduct(product.id)}
                  onKeyDown={(event) => handleCardKeyDown(event, product.id)}
                  role="link"
                  tabIndex={0}
                >
                  <div className="product-card__media">
                    {primaryImageUrl ? (
                      <img
                        src={primaryImageUrl}
                        alt={`${product.name} preview`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="product-card__placeholder">
                        Lime Atelier
                      </div>
                    )}
                    {imageUrls.length > 1 && (
                      <span className="product-card__image-count">
                        {imageUrls.length} photos
                      </span>
                    )}
                  </div>
                  <div className="product-card__content">
                    <div className="product-card__header">
                      <h3 className="product-card__name">{product.name}</h3>
                      <span className="product-card__creator">
                        Published by {publisherName}
                      </span>
                    </div>
                    <p className="product-card__description product-card__description--clamp">
                      {description}
                    </p>
                    <div className="product-card__meta">
                      {createdAtLabel && (
                        <span className="product-card__meta-item">
                          First plated {createdAtLabel}
                        </span>
                      )}
                      <span className="product-card__meta-item">
                        {imageUrls.length || 1} photograph(s)
                      </span>
                    </div>
                    <div className="product-card__footer">
                      <span className="product-card__price">{priceLabel}</span>
                      <button
                        type="button"
                        className="button button--outline product-card__button"
                        onClick={handleAddToCart}
                      >
                        Add to Cart
                      </button>
                    </div>
                    {canManageProduct(product) && (
                      <div className="product-card__actions">
                        <button
                          type="button"
                          className="product-card__action"
                          onClick={(event) => handleEditProduct(event, product.id)}
                        >
                          Edit details
                        </button>
                        <button
                          type="button"
                          className="product-card__action product-card__action--danger"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDeleteProduct(product.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {isEditModalOpen && editingProductId && (
        <div
          className="product-editor-modal"
          role="presentation"
          ref={modalContainerRef}
        >
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
              productId={editingProductId}
              layout="modal"
              onClose={handleCloseEditor}
              onProductUpdated={handleProductUpdated}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default Products;
