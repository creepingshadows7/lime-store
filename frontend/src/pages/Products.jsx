import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatPublishedDate } from "../utils/dates";
import { getPricingDetails } from "../utils/pricing";
import ProductEditor from "../components/ProductEditor";
import CategorySelector from "../components/CategorySelector";
import VariationEditor from "../components/VariationEditor";

const normalizeCategoriesList = (categoryList = []) => {
  const catalog = new Map();
  categoryList.forEach((category) => {
    if (!category) {
      return;
    }
    const categoryId =
      category.id ?? category._id ?? category.slug ?? category.name ?? "";
    const trimmedId = typeof categoryId === "string" ? categoryId.trim() : "";
    if (!trimmedId) {
      return;
    }
    catalog.set(trimmedId, { ...category, id: trimmedId });
  });
  return Array.from(catalog.values()).sort((a, b) =>
    (a?.name ?? "").localeCompare(b?.name ?? "", undefined, {
      sensitivity: "base",
    })
  );
};

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

const Products = () => {
  const { isAuthenticated, profile, logout } = useAuth();
  const { addItem } = useCart();
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
  const [categories, setCategories] = useState([]);
  const [categoriesStatus, setCategoriesStatus] = useState("idle");
  const [categoriesError, setCategoriesError] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormCategoryIds, setSelectedFormCategoryIds] = useState([]);
  const [draftFormCategories, setDraftFormCategories] = useState([]);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [categoryFormName, setCategoryFormName] = useState("");
  const [categoryFormStatus, setCategoryFormStatus] = useState("idle");
  const [categoryFormFeedback, setCategoryFormFeedback] = useState("");
  const [categoryActionFeedback, setCategoryActionFeedback] = useState({
    state: "idle",
    message: "",
  });
  const [categoryBusyId, setCategoryBusyId] = useState("");
  const [productVariations, setProductVariations] = useState([]);

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

  const removeCategoryFromProducts = useCallback((categoryId) => {
    if (!categoryId) {
      return;
    }
    setProducts((prev) =>
      prev.map((product) => {
        const shouldUpdate =
          Array.isArray(product.category_ids) &&
          product.category_ids.includes(categoryId);
        if (!shouldUpdate) {
          return product;
        }
        const nextCategoryIds = product.category_ids.filter(
          (id) => id !== categoryId
        );
        const nextCategories = Array.isArray(product.categories)
          ? product.categories.filter(
              (category) => (category?.id ?? category?._id) !== categoryId
            )
          : [];
        return {
          ...product,
          category_ids: nextCategoryIds,
          categories: nextCategories,
        };
      })
    );
  }, []);

  const categoryProductCounts = useMemo(() => {
    const counts = new Map();
    products.forEach((product) => {
      const ids = Array.isArray(product.category_ids)
        ? product.category_ids
        : [];
      ids.forEach((categoryId) => {
        if (!categoryId) {
          return;
        }
        counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
      });
    });
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matchesCategory = (product) => {
      if (selectedCategoryFilter === "all") {
        return true;
      }
      return (
        Array.isArray(product.category_ids) &&
        product.category_ids.includes(selectedCategoryFilter)
      );
    };

    const matchesQuery = (product) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchableFields = [
        product?.name,
        product?.description,
        product?.created_by_name,
        product?.created_by,
        ...(Array.isArray(product?.variations)
          ? product.variations.map((variation) => variation?.name)
          : []),
        ...(Array.isArray(product?.categories)
          ? product.categories.map((category) => category?.name)
          : []),
      ];

      return searchableFields.some(
        (field) =>
          typeof field === "string" &&
          field.trim().toLowerCase().includes(normalizedQuery)
      );
    };

    return products.filter(
      (product) => matchesCategory(product) && matchesQuery(product)
    );
  }, [products, selectedCategoryFilter, searchQuery]);

  const trimmedSearchQuery = searchQuery.trim();
  const hasSearchQuery = trimmedSearchQuery.length > 0;

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

  const refreshCategories = useCallback(async () => {
    setCategoriesStatus("loading");
    setCategoriesError("");
    try {
      const { data } = await apiClient.get("/api/categories");
      const nextCategories = Array.isArray(data?.categories)
        ? data.categories
        : [];
      applyCategories(nextCategories);
      setCategoriesStatus("success");
      setSelectedCategoryFilter((currentFilter) => {
        if (currentFilter === "all") {
          return currentFilter;
        }
        const stillExists = nextCategories.some((category) => {
          const categoryId = category?.id ?? category?._id;
          return categoryId === currentFilter;
        });
        return stillExists ? currentFilter : "all";
      });
    } catch (err) {
      setCategoriesStatus("error");
      setCategoriesError(
        err.response?.data?.message ??
          "We could not load the category list. Filtering may be limited."
      );
    }
  }, [applyCategories]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

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
    setSelectedFormCategoryIds([]);
    setDraftFormCategories([]);
     setProductVariations([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!isSeller) {
      setShowUploadForm(false);
      setIsCategoryFormOpen(false);
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

  const handleSelectCategoryFilter = (categoryId) => {
    setSelectedCategoryFilter(categoryId);
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape" && searchQuery) {
      event.preventDefault();
      setSearchQuery("");
    }
  };

  const handleToggleCategoryForm = () => {
    setIsCategoryFormOpen((prev) => !prev);
    setCategoryFormName("");
    setCategoryFormStatus("idle");
    setCategoryFormFeedback("");
  };

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    if (categoryFormStatus === "loading") {
      return;
    }

    const trimmedName = categoryFormName.trim();
    if (trimmedName.length < 2) {
      setCategoryFormStatus("error");
      setCategoryFormFeedback(
        "Category names need at least two characters to stay memorable."
      );
      return;
    }

    setCategoryFormStatus("loading");
    setCategoryFormFeedback("");

    try {
      const { data } = await apiClient.post("/api/categories", {
        name: trimmedName,
      });
      setCategoryFormStatus("success");
      setCategoryFormFeedback(
        data?.message ?? `"${trimmedName}" is ready for pairing.`
      );
      setCategoryFormName("");
      if (data?.category) {
        appendCategories([data.category]);
      }
      await refreshCategories();
    } catch (err) {
      let message =
        err.response?.data?.message ??
        "We could not create that category. Please try again.";
      if (err?.response?.status === 401) {
        message = "Your session expired. Please sign in again to continue.";
        logout();
        navigate("/login", { replace: true });
      }
      setCategoryFormStatus("error");
      setCategoryFormFeedback(message);
    }
  };

  const handleDeleteCategory = async (categoryId, categoryName) => {
    if (!categoryId) {
      return;
    }
    const confirmed = window.confirm(
      `Remove the "${categoryName || "Unnamed"}" category from the catalog?`
    );
    if (!confirmed) {
      return;
    }

    setCategoryBusyId(categoryId);
    setCategoryActionFeedback({ state: "loading", message: "" });

    try {
      const { data } = await apiClient.delete(`/api/categories/${categoryId}`);
      const message =
        data?.message ??
        `"${categoryName || "Category"}" has been retired from the boutique.`;
      setCategoryActionFeedback({ state: "success", message });
      removeCategoryFromProducts(categoryId);
      setCategories((prev) =>
          prev.filter((category) => {
            const currentId = category?.id ?? category?._id;
            return currentId !== categoryId;
          })
        );
      setSelectedCategoryFilter((current) =>
        current === categoryId ? "all" : current
      );
      setSelectedFormCategoryIds((prev) =>
        prev.filter((id) => id !== categoryId)
      );
      await refreshCategories();
    } catch (err) {
      let message =
        err.response?.data?.message ??
        "We could not remove that category. Please try again.";
      if (err?.response?.status === 401) {
        message = "Your session expired. Please sign in again to continue.";
        logout();
        navigate("/login", { replace: true });
      }
      setCategoryActionFeedback({ state: "error", message });
    } finally {
      setCategoryBusyId("");
    }
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
    formData.append(
      "category_ids",
      JSON.stringify(selectedFormCategoryIds ?? [])
    );
    formData.append(
      "new_categories",
      JSON.stringify(draftFormCategories ?? [])
    );
    formData.append(
      "variations",
      JSON.stringify(formatVariationPayload(productVariations))
    );
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
      if (
        createdProduct &&
        Array.isArray(createdProduct.categories) &&
        createdProduct.categories.length > 0
      ) {
        appendCategories(createdProduct.categories);
      }
      await refreshCategories();
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
      await refreshCategories();
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

  const handleAddToCart = (event, product, imageUrl, variationsList = []) => {
    event.preventDefault();
    event.stopPropagation();
    if (!product) {
      return;
    }
    const hasVariations =
      Array.isArray(variationsList) && variationsList.length > 0;
    if (hasVariations) {
      navigate(`/products/${product.id}`);
      return;
    }
    const pricing = getPricingDetails(product.price, product.discount_price);
    addItem(
      {
        id: product.id,
        name: product.name,
        price: pricing.currentValue,
        listPrice: pricing.baseValue,
        imageUrl,
        variationId: "",
        variationName: "",
      },
      1
    );
    setManagementFeedback({
      state: "success",
      message: `${product.name} added to your cart.`,
    });
    navigate("/cart");
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
    if (
      Array.isArray(updatedProduct.categories) &&
      updatedProduct.categories.length > 0
    ) {
      appendCategories(updatedProduct.categories);
    }
    refreshCategories();
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
              className="button button--ghost"
              onClick={handleToggleCategoryForm}
            >
              {isCategoryFormOpen ? "Close Category Form" : "Manage Categories"}
            </button>
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

      <section className="category-filter" aria-label="Product categories">
        <div className="category-filter__list">
          {[
            { id: "all", name: "All", product_count: products.length },
            ...categories,
          ].map((category) => {
            const categoryId =
              category?.id ?? category?._id ?? (category?.name === "All" ? "all" : null);
            if (!categoryId) {
              return null;
            }
            const isAll = categoryId === "all";
            const label = isAll ? "All" : category?.name || "Untitled";
            const count = isAll
              ? products.length
              : categoryProductCounts.get(categoryId) ??
                category?.product_count ??
                0;
            const isActive = selectedCategoryFilter === categoryId;
            return (
              <button
                type="button"
                key={categoryId}
                className={`category-filter__option${
                  isActive ? " category-filter__option--active" : ""
                }`}
                onClick={() => handleSelectCategoryFilter(categoryId)}
              >
                <span>{label}</span>
                <span className="category-filter__count">{count}</span>
              </button>
            );
          })}
        </div>
        {categoriesStatus === "loading" ? (
          <p className="category-filter__feedback">Refreshing categories...</p>
        ) : categoriesError ? (
          <p className="category-filter__feedback category-filter__feedback--error">
            {categoriesError}
          </p>
        ) : null}
      </section>

      {isSeller && isCategoryFormOpen && (
        <section className="category-manager">
          <div className="category-manager__header">
            <h2>Catalog Categories</h2>
            <p>
              Name a family of products to keep the atelier neatly arranged. Once
              saved, everyone can filter by it instantly.
            </p>
          </div>
          {categories.length === 0 ? (
            <p className="category-manager__empty">
              No bespoke labels yet. Add one below to get the curation started.
            </p>
          ) : (
            <div className="category-manager__list">
              {categories.map((category) => {
                const categoryId = category.id ?? category._id;
                const count =
                  categoryProductCounts.get(categoryId) ??
                  category.product_count ??
                  0;
                const isBusy = categoryBusyId === categoryId;
                return (
                  <div key={categoryId} className="category-manager__item">
                    <div className="category-manager__item-info">
                      <span className="category-manager__item-name">
                        {category.name}
                      </span>
                      <span className="category-manager__item-count">
                        {count === 1 ? "1 product" : `${count} products`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="category-manager__delete"
                      onClick={() =>
                        handleDeleteCategory(categoryId, category.name)
                      }
                      disabled={isBusy}
                    >
                      {isBusy ? "Removing..." : "Delete"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <form className="category-manager__form" onSubmit={handleCreateCategory}>
            <label className="input-group">
              <span>Category Name</span>
              <input
                type="text"
                value={categoryFormName}
                onChange={(event) => {
                  setCategoryFormName(event.target.value);
                  setCategoryFormStatus("idle");
                  setCategoryFormFeedback("");
                }}
                placeholder="Frozen Desserts"
                required
              />
            </label>
            <div className="category-manager__actions">
              <button
                type="submit"
                className="button button--gradient"
                disabled={categoryFormStatus === "loading"}
              >
                {categoryFormStatus === "loading" ? "Saving..." : "Save Category"}
              </button>
              <button
                type="button"
                className="button button--outline"
                onClick={handleToggleCategoryForm}
                disabled={categoryFormStatus === "loading"}
              >
                Cancel
              </button>
            </div>
            {categoryFormFeedback ? (
              <p
                className={`form-feedback${
                  categoryFormStatus === "error"
                    ? " form-feedback--error"
                    : categoryFormStatus === "success"
                    ? " form-feedback--success"
                    : ""
                }`}
              >
                {categoryFormFeedback}
              </p>
            ) : null}
            {categoryActionFeedback.message ? (
              <p
                className={`form-feedback${
                  categoryActionFeedback.state === "error"
                    ? " form-feedback--error"
                    : categoryActionFeedback.state === "success"
                    ? " form-feedback--success"
                    : ""
                } category-manager__feedback`}
              >
                {categoryActionFeedback.message}
              </p>
            ) : null}
          </form>
        </section>
      )}

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
              <CategorySelector
                categories={categories}
                selectedCategoryIds={selectedFormCategoryIds}
                onSelectedCategoryIdsChange={setSelectedFormCategoryIds}
                draftCategories={draftFormCategories}
                onDraftCategoriesChange={setDraftFormCategories}
                label="Categories"
                helperText='Toggle existing labels or add new ones to keep the boutique organized. All items remain visible under "All".'
                disabled={formStatus === "loading" || categoriesStatus === "loading"}
              />
              <VariationEditor
                label="Variations"
                helperText="Optional: list colorways, sizes, or tasting flights available for this product."
                variations={productVariations}
                onChange={setProductVariations}
                disabled={formStatus === "loading"}
              />
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
          <div
            className="product-search"
            role="search"
            aria-label="Search products"
          >
            <label className="product-search__label" htmlFor="product-search-input">
              Search the collection
            </label>
            <div className="product-search__field">
              <span className="product-search__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="6" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </span>
              <input
                id="product-search-input"
                type="search"
                name="productSearch"
                className="product-search__input"
                placeholder="Search by name, flavor, or artisan"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
              />
              {hasSearchQuery && (
                <button
                  type="button"
                  className="product-search__clear"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="product-search__meta">
              <span>
                {hasSearchQuery
                  ? `Showing ${filteredProducts.length} ${
                      filteredProducts.length === 1 ? "item" : "items"
                    } for "${trimmedSearchQuery}"`
                  : `Showing ${filteredProducts.length} ${
                      filteredProducts.length === 1 ? "item" : "items"
                    } from the atelier`}
              </span>
              <span className="product-search__hint">
                {hasSearchQuery
                  ? "Press Esc or Clear to reset your search."
                  : "Tip: Try terms like mousse, sorbet, or maker names."}
              </span>
            </div>
          </div>
          {filteredProducts.length === 0 ? (
            <p className="page__status">
              {hasSearchQuery
                ? "No creations match that search. Try another flavor, ingredient, or reset your filters."
                : selectedCategoryFilter === "all"
                ? "No creations have been plated yet. Be the first to add one!"
                : "Nothing has been curated for this category yet. Try another filter or add a product."}
            </p>
          ) : (
            <div className="product-grid product-grid--elevated">
              {filteredProducts.map((product) => {
              const pricing = getPricingDetails(product.price, product.discount_price);
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
              const normalizedVariations = Array.isArray(product.variations)
                ? product.variations
                    .map((variation, index) => {
                      const name =
                        typeof variation?.name === "string"
                          ? variation.name.trim()
                          : "";
                      if (!name) {
                        return null;
                      }
                      const variationId =
                        (typeof variation?.id === "string" &&
                          variation.id.trim()) ||
                        (typeof variation?._id === "string" &&
                          variation._id.trim()) ||
                        (typeof variation?.tempId === "string" &&
                          variation.tempId.trim()) ||
                        `variation-${product.id}-${index}`;
                      return { id: variationId, name };
                    })
                    .filter(Boolean)
                : [];
              const variationNames = normalizedVariations.map(
                (variation) => variation.name
              );
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
                    {Array.isArray(product.categories) &&
                      product.categories.length > 0 && (
                        <div className="product-card__categories">
                          {product.categories.slice(0, 4).map((category) => (
                            <span
                              key={`${product.id}-${category.id}`}
                              className="product-card__category-tag"
                            >
                              {category.name}
                            </span>
                          ))}
                        </div>
                      )}
                    {variationNames.length > 0 && (
                      <div className="product-card__variations">
                        {variationNames.slice(0, 3).map((variationName, index) => (
                          <span
                            key={`${product.id}-variation-${index}`}
                            className="product-card__variation-chip"
                          >
                            {variationName}
                          </span>
                        ))}
                        {variationNames.length > 3 && (
                          <span className="product-card__variation-chip product-card__variation-chip--more">
                            +{variationNames.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                    <div className="product-card__footer">
                      <div className="price-stack price-stack--tight">
                        <span className="price-stack__current">
                          {pricing.currentLabel}
                        </span>
                        {pricing.hasDiscount && (
                          <>
                            <span className="price-stack__original">
                              {pricing.baseLabel}
                            </span>
                            {pricing.savingsPercent && (
                              <span className="price-stack__badge">
                                Save {pricing.savingsPercent}%
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="button button--outline product-card__button"
                        onClick={(event) =>
                          handleAddToCart(
                            event,
                            product,
                            primaryImageUrl,
                            normalizedVariations
                          )
                        }
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
          )}
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
              availableCategories={categories}
              onCategoriesChanged={refreshCategories}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default Products;
