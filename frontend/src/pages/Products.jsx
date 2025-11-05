import { useEffect, useRef, useState } from "react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatEuro } from "../utils/currency";

const initialFormState = {
  name: "",
  price: "",
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
  const [formMode, setFormMode] = useState("create");
  const [editingProductId, setEditingProductId] = useState(null);
  const [managementFeedback, setManagementFeedback] = useState({
    state: "idle",
    message: "",
  });
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const previousPreviewRef = useRef("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      const previous = previousPreviewRef.current;
      if (previous && previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
    };
  }, []);

  const updateImagePreview = (nextPreview) => {
    const previous = previousPreviewRef.current;
    if (previous && previous.startsWith("blob:") && previous !== nextPreview) {
      URL.revokeObjectURL(previous);
    }
    previousPreviewRef.current = nextPreview;
    setImagePreview(nextPreview);
  };

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
      setFormMode("create");
      setEditingProductId(null);
      setFormValues(initialFormState);
      setFormStatus("idle");
      setFormFeedback("");
      setSelectedImageFile(null);
      updateImagePreview("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  const handleToggleUpload = () => {
    setShowUploadForm((prev) => {
      const next = !prev;
      if (!next) {
        setFormMode("create");
        setEditingProductId(null);
        setFormValues(initialFormState);
        setFormStatus("idle");
        setFormFeedback("");
        setManagementFeedback({ state: "idle", message: "" });
      } else {
        setFormMode("create");
        setEditingProductId(null);
        setFormValues(initialFormState);
        setFormStatus("idle");
        setFormFeedback("");
      }
      setSelectedImageFile(null);
      updateImagePreview("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return next;
    });
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedImageFile(file);
    if (file) {
      updateImagePreview(URL.createObjectURL(file));
    } else {
      updateImagePreview("");
    }
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (formStatus === "loading") {
      return;
    }

    const name = formValues.name.trim();
    const description = formValues.description.trim();
    const cleanedPrice = formValues.price.trim();
    const isEditMode = formMode === "edit" && editingProductId;

    if (name.length < 3) {
      setFormStatus("error");
      setFormFeedback("Please provide a name with at least three characters.");
      return;
    }

    if (!selectedImageFile && !isEditMode) {
      setFormStatus("error");
      setFormFeedback("Please upload an image for this product.");
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
    if (selectedImageFile) {
      formData.append("image", selectedImageFile);
    }

    const config = {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    };

    try {
      if (isEditMode) {
        const { data } = await apiClient.put(
          `/api/products/${editingProductId}`,
          formData,
          config
        );
        const updatedProduct = data?.product ?? null;
        if (updatedProduct) {
          setProducts((prev) =>
            prev.map((product) =>
              product.id === editingProductId ? updatedProduct : product
            )
          );
        }
        setFormStatus("success");
        setFormFeedback(data?.message ?? "Product updated successfully.");
        setManagementFeedback({
          state: "success",
          message: data?.message ?? "Product updated successfully.",
        });
        setFormMode("create");
        setEditingProductId(null);
        setShowUploadForm(false);
        setFormValues(initialFormState);
        setSelectedImageFile(null);
        updateImagePreview("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        const { data } = await apiClient.post("/api/products", formData, config);
        const createdProduct = data?.product ?? null;

        setProducts((prev) =>
          createdProduct ? [createdProduct, ...prev] : prev
        );
        setFormStatus("success");
        setFormFeedback(data?.message ?? "Product added successfully.");
        setFormValues(initialFormState);
        setManagementFeedback({
          state: "success",
          message: data?.message ?? "Product added successfully.",
        });
        setSelectedImageFile(null);
        updateImagePreview("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not publish this item. Please try again.";
      setFormStatus("error");
      setFormFeedback(message);
      setManagementFeedback({
        state: "error",
        message,
      });
    }
  };

  const handleEditProduct = (product) => {
    if (!product) {
      return;
    }

    setShowUploadForm(true);
    setFormMode("edit");
    setEditingProductId(product.id);
    setFormValues({
      name: product.name ?? "",
      price: product.price ?? "",
      description: product.description ?? "",
    });
    setFormStatus("idle");
    setFormFeedback("");
    setSelectedImageFile(null);
    updateImagePreview(product.image_url ?? "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancelEdit = () => {
    setFormMode("create");
    setEditingProductId(null);
    setFormValues(initialFormState);
    setFormStatus("idle");
    setFormFeedback("");
    setShowUploadForm(false);
    setManagementFeedback({ state: "idle", message: "" });
    setSelectedImageFile(null);
    updateImagePreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

      if (editingProductId === productId) {
        setFormMode("create");
        setEditingProductId(null);
        setFormValues(initialFormState);
        setFormStatus("idle");
        setFormFeedback("");
        setShowUploadForm(false);
        setSelectedImageFile(null);
        updateImagePreview("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not remove this item. Please try again.";
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

    if (roleKey !== "seller") {
      return false;
    }

    const owner = product?.created_by
      ? product.created_by.trim().toLowerCase()
      : "";
    return owner && owner === normalizedEmail;
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
              {showUploadForm
                ? formMode === "edit"
                  ? "Cancel Editing"
                  : "Close Upload"
                : "Add Product"}
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
                <span>Product Image</span>
                <input
                  id="product-image"
                  name="image"
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  required={formMode === "create"}
                />
                <span className="input-hint">
                  {formMode === "edit"
                    ? "Choose a new file to replace the current image."
                    : "Upload a high-quality photo (PNG, JPG, JPEG, GIF, or WEBP)."}
                </span>
              </label>
            </div>
            {imagePreview && (
              <div className="product-upload__preview">
                <img src={imagePreview} alt="Selected product preview" />
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
                {formStatus === "loading"
                  ? formMode === "edit"
                    ? "Saving..."
                    : "Uploading..."
                  : formMode === "edit"
                  ? "Save Changes"
                  : "Upload Product"}
              </button>
              {formMode === "edit" && (
                <button
                  type="button"
                  className="button button--outline"
                  onClick={handleCancelEdit}
                  disabled={formStatus === "loading"}
                >
                  Cancel
                </button>
              )}
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
            <h2>Curated For Lime Enthusiasts</h2>
            <p>
              Limited run desserts, chilled beverages, and patisserie pieces
              plated to celebrate the full spectrum of lime.
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
                        Published by {publisherName}
                      </span>
                    </div>
                    <p className="product-card__description">{description}</p>
                    <div className="product-card__footer">
                      <span className="product-card__price">{priceLabel}</span>
                      <button
                        type="button"
                        className="button button--outline product-card__button"
                      >
                        Add to Cart
                      </button>
                    </div>
                    {canManageProduct(product) && (
                      <div className="product-card__actions">
                        <button
                          type="button"
                          className="product-card__action"
                          onClick={() => handleEditProduct(product)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="product-card__action product-card__action--danger"
                          onClick={() => handleDeleteProduct(product.id)}
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
    </section>
  );
};

export default Products;
