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
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const previousPreviewsRef = useRef([]);
  const [existingImages, setExistingImages] = useState([]);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      const previous = Array.isArray(previousPreviewsRef.current)
        ? previousPreviewsRef.current
        : previousPreviewsRef.current
        ? [previousPreviewsRef.current]
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
      : previousPreviewsRef.current
      ? [previousPreviewsRef.current]
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
      setSelectedImageFiles([]);
      updateImagePreviews([]);
      setExistingImages([]);
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

  useEffect(() => {
    setExpandedImageIndex(0);
  }, [expandedProductId]);

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
      setExistingImages([]);
      setSelectedImageFiles([]);
      updateImagePreviews([]);
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

  const handleImagesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    const imageFiles = files.filter((file) => file && file.type?.startsWith("image/"));
    setSelectedImageFiles(imageFiles);
    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    updateImagePreviews(previews);
    setFormStatus("idle");
    setFormFeedback("");
  };

  const buildExistingImageState = (product) => {
    if (!product) {
      return [];
    }

    const urls = Array.isArray(product.image_urls)
      ? product.image_urls
      : product.image_url
      ? [product.image_url]
      : [];

    const filenames = Array.isArray(product.image_filenames)
      ? product.image_filenames
      : product.image_filename
      ? [product.image_filename]
      : [];

    return urls.map((url, index) => {
      const normalizedUrl = typeof url === "string" ? url : "";
      const filenameCandidate =
        filenames[index] ??
        filenames.find(
          (name) =>
            name && typeof normalizedUrl === "string" && normalizedUrl.includes(name)
        ) ??
        "";
      return {
        url: normalizedUrl,
        filename: filenameCandidate,
        keep: true,
        removable: Boolean(filenameCandidate),
      };
    });
  };

  const handleExistingImageToggle = (index) => {
    setExistingImages((prev) =>
      prev.map((image, currentIndex) => {
        if (currentIndex !== index) {
          return image;
        }
        if (!image.removable) {
          return image;
        }
        return { ...image, keep: !image.keep };
      })
    );
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleCardToggle = (productId) => {
    setExpandedProductId((current) =>
      current === productId ? null : productId
    );
  };

  const handleCardKeyDown = (event, productId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardToggle(productId);
    }
  };

  const handlePreviewSelect = (event, index, total) => {
    event.stopPropagation();
    if (Number.isInteger(index) && index >= 0 && index < total) {
      setExpandedImageIndex(index);
    }
  };

  const formatPublishedDate = (value) => {
    if (!value) {
      return "";
    }

    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "";
      }
      return parsed.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "";
    }
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
    const retainedFilenames = existingImages
      .filter((image) => image.keep && image.filename)
      .map((image) => image.filename);

    if (name.length < 3) {
      setFormStatus("error");
      setFormFeedback("Please provide a name with at least three characters.");
      return;
    }

    const hasUploads = selectedImageFiles.length > 0;
    const hasImagesToKeep = retainedFilenames.length > 0;
    if (!hasUploads && (!isEditMode || !hasImagesToKeep)) {
      setFormStatus("error");
      setFormFeedback(
        isEditMode
          ? "Keep at least one existing photo or upload new imagery."
          : "Please upload at least one image for this product."
      );
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
    selectedImageFiles.forEach((file) => {
      formData.append("images", file);
    });
    if (isEditMode) {
      formData.append("retain_images", JSON.stringify(retainedFilenames));
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
        setExistingImages([]);
        setSelectedImageFiles([]);
        updateImagePreviews([]);
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
        setExistingImages([]);
        setSelectedImageFiles([]);
        updateImagePreviews([]);
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
    setExistingImages(buildExistingImageState(product));
    setFormStatus("idle");
    setFormFeedback("");
    setSelectedImageFiles([]);
    updateImagePreviews([]);
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
    setExistingImages([]);
    setSelectedImageFiles([]);
    updateImagePreviews([]);
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

      if (expandedProductId === productId) {
        setExpandedProductId(null);
      }

      if (editingProductId === productId) {
        setFormMode("create");
        setEditingProductId(null);
        setFormValues(initialFormState);
        setFormStatus("idle");
        setFormFeedback("");
        setShowUploadForm(false);
        setExistingImages([]);
        setSelectedImageFiles([]);
        updateImagePreviews([]);
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
                <span>Product Images</span>
                <input
                  id="product-images"
                  name="images"
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImagesChange}
                  multiple
                  required={formMode === "create"}
                />
                <span className="input-hint">
                  {formMode === "edit"
                    ? "Add new photos or leave this empty to keep the current gallery."
                    : "Upload one or more high-quality photos (PNG, JPG, JPEG, GIF, or WEBP)."}
                </span>
              </label>
            </div>
            {(existingImages.length > 0 || imagePreviews.length > 0) && (
              <div className="product-upload__preview">
                {existingImages.length > 0 && (
                  <div className="product-upload__preview-group">
                    <div className="product-upload__preview-header">
                      <span>Current Gallery</span>
                      {existingImages.some((image) => image.removable) && (
                        <span className="product-upload__preview-hint">
                          Click an image to toggle whether it stays published.
                        </span>
                      )}
                    </div>
                    <div className="product-upload__preview-grid">
                      {existingImages.map((image, index) => (
                        <button
                          type="button"
                          key={image.filename || image.url || index}
                          className={`product-upload__preview-item${
                            image.keep ? "" : " product-upload__preview-item--removed"
                          }${
                            image.removable
                              ? ""
                              : " product-upload__preview-item--locked"
                          }`}
                          onClick={() => handleExistingImageToggle(index)}
                          disabled={!image.removable}
                        >
                          <img
                            src={image.url}
                            alt={`Existing product image ${index + 1}`}
                          />
                          <span className="product-upload__preview-toggle">
                            {image.removable
                              ? image.keep
                                ? "Keeping"
                                : "Removed"
                              : "Locked"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {imagePreviews.length > 0 && (
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
                )}
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
              const imageUrls = [
                ...(Array.isArray(product.image_urls) ? product.image_urls : []),
                ...(product.image_url ? [product.image_url] : []),
              ]
                .map((url) => (typeof url === "string" ? url.trim() : ""))
                .filter((url, index, self) => url && self.indexOf(url) === index);
              const totalImages = imageUrls.length;
              const isExpanded = expandedProductId === product.id;
              const activeImageIndex =
                isExpanded && expandedImageIndex < totalImages
                  ? expandedImageIndex
                  : 0;
              const primaryImageUrl = imageUrls[activeImageIndex] ?? "";
              const createdAtLabel = formatPublishedDate(product.created_at);

              return (
                <article
                  key={product.id}
                  className={`product-card product-card--elevated product-card--expandable${
                    isExpanded ? " product-card--expanded" : ""
                  }`}
                  onClick={() => handleCardToggle(product.id)}
                  onKeyDown={(event) => handleCardKeyDown(event, product.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                >
                  <div className="product-card__media">
                    {primaryImageUrl ? (
                      <img
                        src={primaryImageUrl}
                        alt={`${product.name} preview ${activeImageIndex + 1}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="product-card__placeholder">
                        Lime Atelier
                      </div>
                    )}
                    {totalImages > 1 && (
                      <span className="product-card__image-count">
                        {totalImages} photos
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
                    <p className="product-card__description">{description}</p>
                    {isExpanded && totalImages > 1 && (
                      <div className="product-card__gallery">
                        <div className="product-card__thumbnails">
                          {imageUrls.map((imageUrl, index) => (
                            <button
                              type="button"
                              key={`${product.id}-thumbnail-${index}`}
                              className={`product-card__thumbnail${
                                index === activeImageIndex
                                  ? " product-card__thumbnail--active"
                                  : ""
                              }`}
                              onClick={(event) =>
                                handlePreviewSelect(event, index, totalImages)
                              }
                            >
                              <img
                                src={imageUrl}
                                alt={`${product.name} thumbnail ${index + 1}`}
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {isExpanded && (
                      <dl className="product-card__details">
                        {createdAtLabel && (
                          <div>
                            <dt>Published</dt>
                            <dd>{createdAtLabel}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Photos</dt>
                          <dd>{totalImages}</dd>
                        </div>
                      </dl>
                    )}
                    <div className="product-card__footer">
                      <span className="product-card__price">{priceLabel}</span>
                      <button
                        type="button"
                        className="button button--outline product-card__button"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Add to Cart
                      </button>
                    </div>
                    {canManageProduct(product) && (
                      <div className="product-card__actions">
                        <button
                          type="button"
                          className="product-card__action"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditProduct(product);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="product-card__action product-card__action--danger"
                          onClick={(event) => {
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
    </section>
  );
};

export default Products;
