import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatPublishedDate } from "../utils/dates";
import CategorySelector from "./CategorySelector";
import VariationEditor from "./VariationEditor";

const initialFormState = {
  name: "",
  price: "",
  description: "",
};

const deriveFilenameFromUrl = (url) => {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.pop() || "";
  } catch (error) {
    const fallbackSegments = String(url).split("/").filter(Boolean);
    return fallbackSegments.pop() || "";
  }
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

const formatVariationPayload = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  entries.forEach((entry) => {
    const name = (entry?.name ?? "").trim();
    if (!name) {
      return;
    }
    const lowered = name.toLowerCase();
    if (seen.has(lowered)) {
      return;
    }
    seen.add(lowered);
    const variationId =
      entry?.id ??
      entry?._id ??
      (typeof entry?.tempId === "string" ? entry.tempId : "");
    const payload = { name };
    if (variationId) {
      payload.id = variationId;
    }
    result.push(payload);
  });
  return result;
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
    const derivedFilename = deriveFilenameFromUrl(normalizedUrl);
    const resolvedFilename = filenameCandidate || derivedFilename;
    return {
      url: normalizedUrl,
      filename: filenameCandidate,
      derivedFilename,
      resolvedFilename,
      keep: true,
      removable: Boolean(filenameCandidate),
    };
  });
};

const ProductEditor = ({
  productId,
  layout = "page",
  onClose,
  onProductUpdated,
  availableCategories = null,
  onCategoriesChanged,
}) => {
  const { isAuthenticated, profile, logout } = useAuth();
  const [status, setStatus] = useState("loading");
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState(initialFormState);
  const [existingImages, setExistingImages] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [formStatus, setFormStatus] = useState("idle");
  const [formFeedback, setFormFeedback] = useState("");
  const previousPreviewsRef = useRef([]);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const [categories, setCategories] = useState(
    Array.isArray(availableCategories) ? availableCategories : []
  );
  const [categoryStatus, setCategoryStatus] = useState("idle");
  const [categoryFeedback, setCategoryFeedback] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [draftCategoryNames, setDraftCategoryNames] = useState([]);
  const [variations, setVariations] = useState([]);
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

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
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(availableCategories)) {
      return;
    }
    setCategories(availableCategories);
    setCategoryStatus("success");
  }, [availableCategories]);

  const refreshCategoryOptions = useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }
    setCategoryStatus("loading");
    setCategoryFeedback("");
    try {
      const { data } = await apiClient.get("/api/categories");
      if (!isMountedRef.current) {
        return;
      }
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
      setCategoryStatus("success");
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      setCategoryStatus("error");
      setCategoryFeedback(
        error.response?.data?.message ??
          "We could not load categories right now."
      );
    }
  }, []);

  useEffect(() => {
    if (Array.isArray(availableCategories)) {
      return;
    }
    refreshCategoryOptions();
  }, [availableCategories, refreshCategoryOptions]);

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

  useEffect(() => {
    return () => {
      const previews = Array.isArray(previousPreviewsRef.current)
        ? previousPreviewsRef.current
        : [];
      previews.forEach((preview) => {
        if (typeof preview === "string" && preview.startsWith("blob:")) {
          URL.revokeObjectURL(preview);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (layout !== "modal") {
      return;
    }
    if (status !== "success") {
      return;
    }
    if (containerRef.current) {
      if (typeof containerRef.current.scrollIntoView === "function") {
        containerRef.current.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "auto",
        });
      } else if (typeof containerRef.current.scrollTo === "function") {
        containerRef.current.scrollTo({ top: 0, behavior: "auto" });
      } else {
        containerRef.current.scrollTop = 0;
      }
    }
  }, [layout, status, productId]);

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
        if (loadedProduct) {
          setFormValues({
            name: loadedProduct.name ?? "",
            price: loadedProduct.price ?? "",
            description: loadedProduct.description ?? "",
          });
          setExistingImages(buildExistingImageState(loadedProduct));
          setVariations(
            Array.isArray(loadedProduct.variations) ? loadedProduct.variations : []
          );
          setStatus("success");
        } else {
          setStatus("error");
          setError("This lime creation could not be prepared for editing.");
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const message =
          err.response?.data?.message ??
          "We could not load this product for editing.";
        setError(message);
        setStatus("error");
      }
    };

    if (productId) {
      fetchProduct();
    } else {
      setStatus("error");
      setError("This lime creation could not be found.");
    }

    return () => {
      isMounted = false;
    };
  }, [productId]);

  useEffect(() => {
    if (!product) {
      setSelectedCategoryIds([]);
      setDraftCategoryNames([]);
      return;
    }
    const nextIds = Array.isArray(product.category_ids)
      ? product.category_ids.filter(Boolean)
      : [];
    setSelectedCategoryIds(nextIds);
    setDraftCategoryNames([]);
  }, [product]);

  const canEditProduct = useMemo(() => {
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

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFormStatus("idle");
    setFormFeedback("");
  };

  const handleImagesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    const imageFiles = files.filter(
      (file) => file && file.type?.startsWith("image/")
    );
    setSelectedImageFiles(imageFiles);
    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    updateImagePreviews(previews);
    setFormStatus("idle");
    setFormFeedback("");
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

  const handleResetForm = () => {
    if (!product) {
      return;
    }
    setFormValues({
      name: product.name ?? "",
      price: product.price ?? "",
      description: product.description ?? "",
    });
    setExistingImages(buildExistingImageState(product));
    setSelectedImageFiles([]);
    updateImagePreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFormStatus("idle");
    setFormFeedback("");
    const nextIds = Array.isArray(product.category_ids)
      ? product.category_ids.filter(Boolean)
      : [];
    setSelectedCategoryIds(nextIds);
    setDraftCategoryNames([]);
    setVariations(Array.isArray(product.variations) ? product.variations : []);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formStatus === "loading" || !product) {
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

  const retainedFilenames = existingImages
    .filter((image) => image.keep)
    .map((image) => image.resolvedFilename || deriveFilenameFromUrl(image.url))
    .filter((filename, index, self) => filename && self.indexOf(filename) === index);

    const hasUploads = selectedImageFiles.length > 0;
    const hasRetainableImages = existingImages.some((image) => image.removable);
    if (!hasUploads && retainedFilenames.length === 0 && hasRetainableImages) {
      setFormStatus("error");
      setFormFeedback(
        "Keep at least one existing photo or upload new imagery to continue."
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

    const formData = new FormData();
    formData.append("name", name);
    formData.append("price", numericPrice.toString());
    formData.append("description", description);
    formData.append(
      "category_ids",
      JSON.stringify(selectedCategoryIds ?? [])
    );
    formData.append(
      "new_categories",
      JSON.stringify(draftCategoryNames ?? [])
    );
    formData.append(
      "variations",
      JSON.stringify(formatVariationPayload(variations))
    );
    selectedImageFiles.forEach((file) => formData.append("images", file));
    formData.append("retain_images", JSON.stringify(retainedFilenames));

    const config = {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    };

    try {
      const { data } = await apiClient.put(
        `/api/products/${product.id}`,
        formData,
        config
      );
      const updatedProduct = data?.product ?? null;
      if (updatedProduct) {
        setProduct(updatedProduct);
        setExistingImages(buildExistingImageState(updatedProduct));
        setFormValues({
          name: updatedProduct.name ?? "",
          price: updatedProduct.price ?? "",
          description: updatedProduct.description ?? "",
        });
        setSelectedImageFiles([]);
        updateImagePreviews([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setSelectedCategoryIds(
          Array.isArray(updatedProduct.category_ids)
            ? updatedProduct.category_ids.filter(Boolean)
            : []
        );
        setDraftCategoryNames([]);
        setVariations(
          Array.isArray(updatedProduct.variations) ? updatedProduct.variations : []
        );
        if (typeof onProductUpdated === "function") {
          onProductUpdated(updatedProduct);
        }
        if (!Array.isArray(availableCategories)) {
          await refreshCategoryOptions();
        }
        if (typeof onCategoriesChanged === "function") {
          onCategoriesChanged();
        }
      }
      setFormStatus("success");
      setFormFeedback(data?.message ?? "Product updated successfully.");
    } catch (err) {
      let message = extractApiMessage(
        err,
        "We could not save your refinements. Please try again."
      );

      if (err?.response?.status === 401) {
        message = "Your session expired. Please sign in again to continue.";
        logout();
        if (typeof onClose === "function") {
          onClose();
        }
        navigate("/login");
      }

      setFormStatus("error");
      setFormFeedback(message);
    }
  };

  const handleClose = () => {
    if (typeof onClose === "function") {
      onClose();
    }
  };

  const createdAtLabel = product
    ? formatPublishedDate(product.created_at, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  if (status === "loading") {
    return (
      <section
        className={`product-editor product-editor--loading${
          layout === "modal" ? " product-editor--modal" : ""
        }`}
      >
        <p>Preparing your atelier workspace...</p>
      </section>
    );
  }

  if (status === "error" || !product) {
    return (
      <section
        className={`product-editor product-editor--error${
          layout === "modal" ? " product-editor--modal" : ""
        }`}
      >
        <div>
          <p>{error || "This lime creation is unavailable for editing."}</p>
          {layout === "page" ? (
            <Link
              to={`/products/${productId || ""}`}
              className="button button--outline"
            >
              View product
            </Link>
          ) : (
            <button type="button" className="button button--outline" onClick={handleClose}>
              Close
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!canEditProduct) {
    return (
      <section
        className={`product-editor product-editor--forbidden${
          layout === "modal" ? " product-editor--modal" : ""
        }`}
      >
        <div>
          <p>
            You need seller permissions to refine this lime creation. Reach out to the
            atelier team for access.
          </p>
          {layout === "page" ? (
            <Link to={`/products/${product.id}`} className="button button--outline">
              View the product instead
            </Link>
          ) : (
            <button type="button" className="button button--outline" onClick={handleClose}>
              Close
            </button>
          )}
        </div>
      </section>
    );
  }

  const renderHeader = () => {
    if (layout === "page") {
      return (
        <header className="product-editor__header">
          <div>
            <nav className="product-editor__breadcrumbs">
              <Link to="/products">Products</Link>
              <span aria-hidden="true">/</span>
              <Link to={`/products/${product.id}`}>{product.name}</Link>
              <span aria-hidden="true">/</span>
              <span>Edit</span>
            </nav>
            <h1>Refine {product.name}</h1>
            {createdAtLabel && (
              <p className="product-editor__meta">
                Originally introduced on&nbsp;
                <strong>{createdAtLabel}</strong> by{" "}
                {product.created_by_name || "Lime Atelier"}
              </p>
            )}
          </div>
          <div className="product-editor__header-actions">
            <Link
              to={`/products/${product.id}`}
              className="button button--outline"
              target="_blank"
              rel="noreferrer"
            >
              Preview in new tab
            </Link>
          </div>
        </header>
      );
    }

    return (
      <header className="product-editor__header product-editor__header--modal">
        <div className="product-editor__modal-title">
          <h2 id="product-editor-title">Refine {product.name}</h2>
          {createdAtLabel && (
            <p className="product-editor__meta">
              Introduced on {createdAtLabel} by{" "}
              {product.created_by_name || "Lime Atelier"}
            </p>
          )}
        </div>
        <div className="product-editor__header-actions">
          <Link
            to={`/products/${product.id}`}
            className="button button--outline"
            target="_blank"
            rel="noreferrer"
          >
            View live
          </Link>
          <button type="button" className="button button--ghost" onClick={handleClose}>
            Close
          </button>
        </div>
      </header>
    );
  };

  return (
    <section
      ref={containerRef}
      className={`product-editor${layout === "modal" ? " product-editor--modal" : ""}`}
    >
      {renderHeader()}

      <form className="product-editor__form" onSubmit={handleSubmit}>
        <div className="product-editor__form-grid">
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
        </div>
        <label className="input-group">
          <span>Product Gallery</span>
          <input
            id="product-images"
            name="images"
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImagesChange}
            multiple
          />
          <span className="input-hint">
            Add new photos or leave this untouched to keep the current gallery.
          </span>
        </label>

        {(existingImages.length > 0 || imagePreviews.length > 0) && (
          <div className="product-editor__preview">
            {existingImages.length > 0 && (
              <div className="product-editor__preview-group">
                <div className="product-editor__preview-header">
                  <span>Current Gallery</span>
                  {existingImages.some((image) => image.removable) && (
                    <span className="product-editor__preview-hint">
                      Click an image to toggle whether it stays published.
                    </span>
                  )}
                </div>
                <div className="product-editor__preview-grid">
                  {existingImages.map((image, index) => (
                    <button
                      type="button"
                      key={image.filename || image.url || index}
                      className={`product-editor__preview-item${
                        image.keep ? "" : " product-editor__preview-item--removed"
                      }${
                        image.removable ? "" : " product-editor__preview-item--locked"
                      }`}
                      onClick={() => handleExistingImageToggle(index)}
                      disabled={!image.removable}
                    >
                      <img
                        src={image.url}
                        alt={`Existing product image ${index + 1}`}
                      />
                      <span className="product-editor__preview-toggle">
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
              <div className="product-editor__preview-group">
                <div className="product-editor__preview-header">
                  <span>New Uploads</span>
                </div>
                <div className="product-editor__preview-grid">
                  {imagePreviews.map((preview, index) => (
                    <div
                      key={`${preview}-${index}`}
                      className="product-editor__preview-item product-editor__preview-item--new"
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

        <CategorySelector
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          onSelectedCategoryIdsChange={setSelectedCategoryIds}
          draftCategories={draftCategoryNames}
          onDraftCategoriesChange={setDraftCategoryNames}
          label="Categories"
          helperText='Select existing tasting families or queue new ones. Every creation still appears under "All".'
          disabled={formStatus === "loading" || categoryStatus === "loading"}
        />
        <VariationEditor
          variations={variations}
          onChange={setVariations}
          disabled={formStatus === "loading"}
          helperText="Optional: list colorways, portion sizes, or seasonal riffs."
        />
        {categoryFeedback && categoryStatus === "error" && (
          <p className="form-feedback form-feedback--error">{categoryFeedback}</p>
        )}

        <label className="input-group">
          <span>Tasting Notes</span>
          <textarea
            id="product-description"
            name="description"
            rows={5}
            value={formValues.description}
            onChange={handleFieldChange}
            placeholder="Describe textures, garnishes, and lime varietals that make this item special."
          />
        </label>

        <div className="product-editor__actions">
          <button
            type="submit"
            className="button button--gradient"
            disabled={formStatus === "loading"}
          >
            {formStatus === "loading" ? "Saving..." : "Save refinements"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={handleResetForm}
            disabled={formStatus === "loading"}
          >
            Reset changes
          </button>
          <Link
            to={`/products/${product.id}`}
            className="button button--outline"
            target="_blank"
            rel="noreferrer"
          >
            View live page
          </Link>
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
  );
};

export default ProductEditor;
