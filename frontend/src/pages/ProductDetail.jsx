import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { formatPublishedDate } from "../utils/dates";
import { getPricingDetails } from "../utils/pricing";
import ProductEditor from "../components/ProductEditor";

const REVIEW_BODY_LIMIT = 500;
const REVIEW_TITLE_LIMIT = 140;

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
  const { addItem: saveToWishlist } = useWishlist();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsStatus, setReviewsStatus] = useState("idle");
  const [reviewsError, setReviewsError] = useState("");
  const [reviewSummary, setReviewSummary] = useState({
    average_rating: 0,
    total_reviews: 0,
  });
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
  const [reviewFormError, setReviewFormError] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState("");
  const [reviewForm, setReviewForm] = useState({
    title: "",
    body: "",
    rating: 5,
    imageFile: null,
    imagePreview: "",
  });
  const [wishlistStatus, setWishlistStatus] = useState("idle");
  const [wishlistFeedback, setWishlistFeedback] = useState("");

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
  const isSellerOnly = !isAdmin && roleKey === "seller";

  const refreshCategories = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/categories");
      const nextCategories = Array.isArray(data?.categories)
        ? data.categories
        : [];
      applyCategories(nextCategories);
    } catch {
      // Non-blocking: category refresh failures should not break editing flow.
    }
  }, [applyCategories]);

  const loadReviews = useCallback(async () => {
    if (!productId) {
      setReviews([]);
      setReviewSummary({ average_rating: 0, total_reviews: 0 });
      setReviewsStatus("idle");
      return;
    }

    setReviewsStatus("loading");
    setReviewsError("");
    try {
      const { data } = await apiClient.get(`/api/products/${productId}/reviews`);
      const loadedReviews = Array.isArray(data?.reviews) ? data.reviews : [];
      setReviews(loadedReviews);
      setReviewSummary({
        average_rating: Number(data?.summary?.average_rating ?? 0),
        total_reviews: Number(
          data?.summary?.total_reviews ??
            data?.summary?.total ??
            loadedReviews.length
        ),
      });
      setReviewsStatus("success");
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not load reviews for this product right now.";
      setReviewsError(message);
      setReviewsStatus("error");
    }
  }, [productId]);

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
      } catch (_err) {
        if (!isMounted) {
          return;
        }
        const message =
          _err.response?.data?.message ??
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
  }, [productId, appendCategories]);

  useEffect(() => {
    if (!productId || status !== "success") {
      return;
    }
    loadReviews();
  }, [productId, status, loadReviews]);

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

  const normalizedVariations = useMemo(() => {
    if (!product || !Array.isArray(product.variations)) {
      return [];
    }
    return product.variations
      .map((variation, index) => {
        const name =
          typeof variation?.name === "string" ? variation.name.trim() : "";
        if (!name) {
          return null;
        }
        const variationId =
          (typeof variation?.id === "string" && variation.id.trim()) ||
          (typeof variation?._id === "string" && variation._id.trim()) ||
          (typeof variation?.tempId === "string" && variation.tempId.trim()) ||
          `variation-${product.id}-${index}`;
        return { id: variationId, name };
      })
      .filter(Boolean);
  }, [product]);

  useEffect(() => {
    if (normalizedVariations.length === 0) {
      setSelectedVariationId("");
      return;
    }
    setSelectedVariationId((previous) => {
      if (
        previous &&
        normalizedVariations.some((variation) => variation.id === previous)
      ) {
        return previous;
      }
      return normalizedVariations[0].id;
    });
  }, [normalizedVariations]);

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

  useEffect(() => {
    return () => {
      if (reviewForm.imagePreview) {
        try {
          URL.revokeObjectURL(reviewForm.imagePreview);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [reviewForm.imagePreview]);

  const isOwnProduct = useMemo(() => {
    if (!product) {
      return false;
    }
    const ownerEmail = product.created_by?.trim().toLowerCase() ?? "";
    return ownerEmail && ownerEmail === normalizedEmail;
  }, [product, normalizedEmail]);

  const canManageProduct = useMemo(() => {
    if (!product) {
      return false;
    }
    if (isAdmin) {
      return true;
    }
    if (!isSeller) {
      return false;
    }
    return isOwnProduct;
  }, [product, isAdmin, isSeller, isOwnProduct]);

  const canSubmitReview =
    isAuthenticated &&
    profile?.email_verified &&
    (!isSellerOnly || !isOwnProduct);

  const reviewRestrictionMessage = useMemo(() => {
    if (!isAuthenticated) {
      return "Sign in to share your tasting notes.";
    }
    if (!profile?.email_verified) {
      return "Verify your email to add a review.";
    }
    if (isSellerOnly && isOwnProduct) {
      return "Sellers cannot review their own listings.";
    }
    return "Share your experience with the community.";
  }, [isAuthenticated, profile, isSellerOnly, isOwnProduct]);

  const scrollToReviews = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const section = document.getElementById("product-reviews");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const resetReviewForm = useCallback(() => {
    setReviewForm({
      title: "",
      body: "",
      rating: 5,
      imageFile: null,
      imagePreview: "",
    });
    setReviewFormError("");
  }, []);

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
  const pricing = getPricingDetails(product.price, product.discount_price);
  const primaryImageUrl = imageUrls[activeImageIndex] ?? "";
  const selectedVariation =
    normalizedVariations.find(
      (variation) => variation.id === selectedVariationId
    ) ?? null;

  const handleAddToCart = () => {
    if (!product) {
      return;
    }
    if (normalizedVariations.length > 0 && !selectedVariation) {
      return;
    }
    addItem(
      {
        id: product.id,
        name: product.name,
        price: pricing.currentValue,
        listPrice: pricing.baseValue,
        imageUrl: primaryImageUrl,
        variationId: selectedVariation?.id ?? "",
        variationName: selectedVariation?.name ?? "",
      },
      1
    );
    navigate("/cart");
  };

  const handleAddToWishlist = async () => {
    if (!product) {
      return;
    }
    if (!isAuthenticated) {
      navigate("/login", {
        replace: false,
        state: { next: `/products/${product.id}` },
      });
      return;
    }
    if (normalizedVariations.length > 0 && !selectedVariation) {
      setWishlistStatus("error");
      setWishlistFeedback("Select an option before saving to your wishlist.");
      return;
    }

    setWishlistStatus("loading");
    setWishlistFeedback("");
    try {
      const result = await saveToWishlist({
        productId: product.id,
        variationId: selectedVariation?.id ?? "",
        variationName: selectedVariation?.name ?? "",
      });
      setWishlistStatus(result.success ? "success" : "error");
      setWishlistFeedback(
        result.message ||
          (result.success
            ? `${product.name} saved to your wishlist.`
            : "We could not save this item to your wishlist.")
      );
    } catch (err) {
      setWishlistStatus("error");
      setWishlistFeedback(
        "We could not save this item to your wishlist. Please try again."
      );
    }
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

  const handleToggleReviewForm = () => {
    if (!canSubmitReview) {
      setReviewFormError(reviewRestrictionMessage);
      scrollToReviews();
      return;
    }
    setReviewFormError("");
    setIsReviewFormOpen((previous) => {
      const nextState = !previous;
      if (nextState) {
        setTimeout(scrollToReviews, 40);
      }
      return nextState;
    });
  };

  const handleRatingSelect = (value) => {
    setReviewForm((prev) => ({ ...prev, rating: value }));
  };

  const handleReviewFileChange = (event) => {
    const [file] = event.target.files || [];
    setReviewForm((prev) => {
      if (prev.imagePreview) {
        try {
          URL.revokeObjectURL(prev.imagePreview);
        } catch {
          // Ignore revoke errors
        }
      }
      return {
        ...prev,
        imageFile: file || null,
        imagePreview: file ? URL.createObjectURL(file) : "",
      };
    });
  };

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    if (!product) {
      return;
    }
    if (!canSubmitReview) {
      setReviewFormError(reviewRestrictionMessage);
      return;
    }
    if (!reviewForm.title.trim() || !reviewForm.body.trim()) {
      setReviewFormError("Please add both a title and description.");
      return;
    }

    setReviewsError("");
    setIsSubmittingReview(true);
    setReviewFormError("");
    try {
      const formData = new FormData();
      formData.append(
        "title",
        reviewForm.title.trim().slice(0, REVIEW_TITLE_LIMIT)
      );
      formData.append("description", reviewForm.body.trim());
      formData.append("rating", reviewForm.rating);
      if (reviewForm.imageFile) {
        formData.append("image", reviewForm.imageFile);
      }

      const { data } = await apiClient.post(
        `/api/products/${product.id}/reviews`,
        formData
      );

      if (data?.review) {
        setReviews((previous) => [
          data.review,
          ...previous.filter((item) => item.id !== data.review.id),
        ]);
      } else {
        await loadReviews();
      }

      setReviewsStatus("success");

      if (data?.summary) {
        setReviewSummary({
          average_rating: Number(data.summary.average_rating ?? 0),
          total_reviews: Number(
            data.summary.total_reviews ??
              data.summary.total ??
              reviews.length + 1
          ),
        });
      } else {
        setReviewSummary((previous) => ({
          average_rating: previous.average_rating,
          total_reviews: (previous.total_reviews || 0) + 1,
        }));
      }

      resetReviewForm();
      setIsReviewFormOpen(false);
      scrollToReviews();
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We couldn't save your review. Please try again.";
      setReviewFormError(message);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!reviewId || !product) {
      return;
    }
    setDeletingReviewId(reviewId);
    setReviewsError("");
    try {
      const { data } = await apiClient.delete(
        `/api/products/${product.id}/reviews/${reviewId}`
      );

      setReviews((previous) =>
        previous.filter((review) => review.id !== reviewId)
      );

      setReviewsStatus("success");

      if (data?.summary) {
        setReviewSummary({
          average_rating: Number(data.summary.average_rating ?? 0),
          total_reviews: Number(
            data.summary.total_reviews ??
              data.summary.total ??
              Math.max(0, reviews.length - 1)
          ),
        });
      } else {
        setReviewSummary((previous) => ({
          average_rating: previous.average_rating,
          total_reviews: Math.max(0, (previous.total_reviews || 1) - 1),
        }));
      }
    } catch (err) {
      const message =
        err.response?.data?.message ??
        "We could not remove this review right now.";
      setReviewsError(message);
    } finally {
      setDeletingReviewId("");
    }
  };

  const renderStars = (value, size = "regular") => {
    const numeric = Number(value);
    const rating = Number.isFinite(numeric)
      ? Math.max(0, Math.min(5, Math.round(numeric)))
      : 0;
    return (
      <div
        className={`review-stars review-stars--${size}`}
        aria-label={`${rating} out of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={`${size}-star-${star}`}
            className={`review-stars__star${
              star <= rating ? " review-stars__star--filled" : ""
            }`}
            aria-hidden="true"
          >
            &#9733;
          </span>
        ))}
      </div>
    );
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
            <div className="price-stack price-stack--large">
              <span className="price-stack__current">{pricing.currentLabel}</span>
              {pricing.hasDiscount && (
                <>
                  <span className="price-stack__original">{pricing.baseLabel}</span>
                  {pricing.savingsPercent && (
                    <span className="price-stack__badge">
                      Save {pricing.savingsPercent}%
                    </span>
                  )}
                </>
              )}
            </div>
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
          {normalizedVariations.length > 0 && (
            <div className="product-detail__variations">
              <h3>Options</h3>
              <div className="product-detail__variation-options">
                {normalizedVariations.map((variation) => (
                  <button
                    type="button"
                    key={variation.id}
                    className={`product-detail__variation-option${
                      selectedVariationId === variation.id
                        ? " product-detail__variation-option--active"
                        : ""
                    }`}
                    onClick={() => setSelectedVariationId(variation.id)}
                  >
                    {variation.name}
                  </button>
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
            <button
              type="button"
              className="button button--ghost"
              onClick={handleAddToWishlist}
              disabled={wishlistStatus === "loading"}
            >
              {wishlistStatus === "loading"
                ? "Saving..."
                : "Save to wishlist"}
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
          {wishlistFeedback && (
            <p
              className={`form-feedback product-detail__wishlist-feedback${
                wishlistStatus === "error"
                  ? " form-feedback--error"
                  : " form-feedback--success"
              }`}
            >
              {wishlistFeedback}
            </p>
          )}
          <div className="product-detail__review-cta">
            <button
              type="button"
              className="button button--ghost"
              onClick={handleToggleReviewForm}
              aria-disabled={!canSubmitReview}
            >
              {isReviewFormOpen ? "Close review form" : "Add review"}
            </button>
            <p className="product-detail__review-note">
              {reviewRestrictionMessage}
            </p>
          </div>
        </div>
      </div>
      <section className="product-reviews" id="product-reviews">
        <div className="product-reviews__header">
          <div>
            <p className="product-reviews__eyebrow">Reviews</p>
            <h2>Guest impressions</h2>
            <div className="product-reviews__summary">
              {renderStars(reviewSummary.average_rating || 0, "large")}
              <div className="product-reviews__summary-copy">
                <strong>
                  {Number(reviewSummary.average_rating ?? 0).toFixed(1)} / 5
                </strong>
                <span>
                  {reviewSummary.total_reviews || 0} review
                  {reviewSummary.total_reviews === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <div className="product-reviews__cta">
            <button
              type="button"
              className="button button--ghost"
              onClick={handleToggleReviewForm}
              aria-disabled={!canSubmitReview}
            >
              {isReviewFormOpen ? "Close form" : "Add review"}
            </button>
          </div>
        </div>

        {isReviewFormOpen && (
          <form className="product-reviews__form" onSubmit={handleReviewSubmit}>
            <div className="review-form__grid">
              <div className="review-form__field">
                <div className="review-form__label-row">
                  <label htmlFor="review-title">Title</label>
                  <span className="review-form__helper">
                    {reviewForm.title.length}/{REVIEW_TITLE_LIMIT}
                  </span>
                </div>
                <input
                  id="review-title"
                  name="title"
                  type="text"
                  maxLength={REVIEW_TITLE_LIMIT}
                  value={reviewForm.title}
                  onChange={(event) =>
                    setReviewForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Give your tasting note a headline"
                  required
                />
              </div>
              <div className="review-form__field">
                <div className="review-form__label-row">
                  <label htmlFor="review-description">Description</label>
                  <span className="review-form__helper">
                    {reviewForm.body.length}/{REVIEW_BODY_LIMIT}
                  </span>
                </div>
                <textarea
                  id="review-description"
                  name="description"
                  rows={4}
                  maxLength={REVIEW_BODY_LIMIT}
                  value={reviewForm.body}
                  onChange={(event) =>
                    setReviewForm((prev) => ({
                      ...prev,
                      body: event.target.value,
                    }))
                  }
                  placeholder="Share flavor notes, aromas, and serving ideas."
                  required
                />
              </div>
              <div className="review-form__field review-form__field--inline">
                <div className="review-form__label-row">
                  <span>Rating</span>
                  <span className="review-form__helper">
                    {reviewForm.rating} / 5
                  </span>
                </div>
                <div
                  className="review-form__stars"
                  role="group"
                  aria-label="Select a rating"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={`rating-${value}`}
                      className={`review-form__star${
                        reviewForm.rating >= value
                          ? " review-form__star--active"
                          : ""
                      }`}
                      onClick={() => handleRatingSelect(value)}
                      aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    >
                      &#9733;
                    </button>
                  ))}
                </div>
              </div>
              <div className="review-form__field review-form__upload">
                <div className="review-form__label-row">
                  <label htmlFor="review-image">Add an image (optional)</label>
                  <span className="review-form__helper">PNG, JPG, WEBP</span>
                </div>
                <input
                  id="review-image"
                  name="image"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif"
                  onChange={handleReviewFileChange}
                />
                {reviewForm.imagePreview && (
                  <div className="review-form__preview">
                    <img
                      src={reviewForm.imagePreview}
                      alt="Review upload preview"
                    />
                  </div>
                )}
              </div>
            </div>
            {reviewFormError && (
              <p className="review-form__error">{reviewFormError}</p>
            )}
            <div className="product-reviews__form-actions">
              <button
                type="submit"
                className="button button--gradient"
                disabled={isSubmittingReview}
              >
                {isSubmittingReview ? "Submitting..." : "Post review"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={resetReviewForm}
                disabled={isSubmittingReview}
              >
                Reset
              </button>
            </div>
          </form>
        )}

        {reviewsError && reviewsStatus !== "error" && (
          <div className="product-reviews__helper product-reviews__helper--error">
            {reviewsError}
          </div>
        )}

        <div className="product-reviews__list">
          {reviewsStatus === "loading" && (
            <div className="product-reviews__placeholder">
              Gathering fresh impressions...
            </div>
          )}
          {reviewsStatus === "error" && (
            <div className="product-reviews__placeholder product-reviews__placeholder--error">
              {reviewsError}
            </div>
          )}
          {reviewsStatus === "success" && reviews.length === 0 && (
            <div className="product-reviews__placeholder">
              Be the first to review this creation.
            </div>
          )}
          {reviewsStatus === "success" && reviews.length > 0 && (
            <ul className="product-reviews__list-grid">
              {reviews.map((review) => (
                <li key={review.id} className="review-card">
                  <div className="review-card__header">
                    <div className="review-card__title-row">
                      {renderStars(review.rating || 0)}
                      <div>
                        <h3>{review.title}</h3>
                        <p className="review-card__meta">
                          <span>
                            {review.created_by_name ||
                              review.created_by ||
                              "Verified guest"}
                          </span>
                          <span aria-hidden="true"> • </span>
                          <span>
                            {formatPublishedDate(review.created_at, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }) || "Just now"}
                          </span>
                          {review.created_by_role && (
                            <span className="review-card__role">
                              {review.created_by_role}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    {review.can_delete && (
                      <button
                        type="button"
                        className="review-card__delete button button--danger"
                        onClick={() => handleDeleteReview(review.id)}
                        disabled={deletingReviewId === review.id}
                      >
                        {deletingReviewId === review.id
                          ? "Removing..."
                          : "Delete"}
                      </button>
                    )}
                  </div>
                  <p className="review-card__body">{review.body}</p>
                  {review.image_url && (
                    <div className="review-card__image">
                      <img
                        src={review.image_url}
                        alt={`Review from ${
                          review.created_by_name || "customer"
                        }`}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
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
