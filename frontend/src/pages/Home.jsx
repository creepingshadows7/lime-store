import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { getPricingDetails } from "../utils/pricing";

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const extractProductImageUrls = (product) => {
  if (!product) {
    return [];
  }

  const urls = [
    ...(Array.isArray(product.image_urls) ? product.image_urls : []),
    ...(product.image_url ? [product.image_url] : []),
  ];

  return urls
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url, index, self) => url && self.indexOf(url) === index);
};

const pickDescription = (product) => {
  const sources = [
    product?.short_description,
    product?.tasting_notes,
    product?.description,
  ];

  const description =
    sources.map((text) => normalizeString(text)).find(Boolean) ??
    "House-pressed lime gastronomy you can enjoy from the comfort of home.";

  return description;
};

const deriveBadgeLabel = (product) =>
  normalizeString(product?.badge) ||
  normalizeString(product?.signature_label) ||
  normalizeString(product?.collection) ||
  "Signature";

const deriveProvenanceLabel = (product) => {
  const categoryName =
    (Array.isArray(product?.categories)
      ? product.categories
          .map((category) => {
            if (typeof category === "string") {
              return category.trim();
            }
            if (
              category &&
              typeof category.name === "string" &&
              category.name.trim()
            ) {
              return category.name.trim();
            }
            return "";
          })
          .find(Boolean)
      : "") || "";

  return (
    normalizeString(product?.origin) ||
    normalizeString(product?.region) ||
    categoryName ||
    "Limited release"
  );
};

const SHOWCASE_LABEL_MAX_LENGTH = 48;

const normalizeLabelOverrideValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, SHOWCASE_LABEL_MAX_LENGTH);
};

const mapIncomingLabelOverrides = (overrides, allowedIds) => {
  if (!overrides || typeof overrides !== "object") {
    return {};
  }
  const allowedSet = Array.isArray(allowedIds)
    ? new Set(
        allowedIds
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean)
      )
    : null;

  return Object.entries(overrides).reduce((acc, [rawId, entry]) => {
    const productId = typeof rawId === "string" ? rawId.trim() : "";
    if (!productId) {
      return acc;
    }
    if (allowedSet && !allowedSet.has(productId)) {
      return acc;
    }
    if (!entry || typeof entry !== "object") {
      return acc;
    }
    const badgeLabel = normalizeLabelOverrideValue(
      entry.badge_label ?? entry.badgeLabel
    );
    const provenanceLabel = normalizeLabelOverrideValue(
      entry.provenance_label ?? entry.provenanceLabel
    );
    if (!badgeLabel && !provenanceLabel) {
      return acc;
    }
    acc[productId] = {
      ...(badgeLabel ? { badgeLabel } : {}),
      ...(provenanceLabel ? { provenanceLabel } : {}),
    };
    return acc;
  }, {});
};

const buildLabelOverridePayload = (selectedIds, overrides) => {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return {};
  }
  const payload = {};
  selectedIds.forEach((rawId) => {
    const productId = normalizeString(rawId);
    if (!productId) {
      return;
    }
    const entry = overrides?.[productId];
    if (!entry) {
      return;
    }
    const badgeLabel = normalizeLabelOverrideValue(entry.badgeLabel);
    const provenanceLabel = normalizeLabelOverrideValue(
      entry.provenanceLabel
    );
    if (!badgeLabel && !provenanceLabel) {
      return;
    }
    payload[productId] = {};
    if (badgeLabel) {
      payload[productId].badge_label = badgeLabel;
    }
    if (provenanceLabel) {
      payload[productId].provenance_label = provenanceLabel;
    }
  });
  return payload;
};

const deriveProductId = (product, fallbackIndex) => {
  const primaryId =
    product?.id ?? product?._id ?? product?.slug ?? product?.productId;

  if (primaryId != null) {
    const normalized = normalizeString(String(primaryId));
    if (normalized) {
      return normalized;
    }
  }

  const normalizedName = normalizeString(product?.name);
  if (normalizedName) {
    return normalizedName.toLowerCase().replace(/[^a-z0-9]+/gi, "-");
  }

  return `featured-${fallbackIndex}`;
};

const resolveProductId = (product) => {
  if (!product) {
    return "";
  }
  const identifier =
    (typeof product.id === "string" && product.id.trim()) ||
    (typeof product._id === "string" && product._id.trim());
  return identifier || "";
};

const FEATURED_SHOWCASE_LIMIT = 4;

const Home = () => {
  const { isAuthenticated, profile } = useAuth();
  const [featured, setFeatured] = useState([]);
  const [selectedFeaturedIds, setSelectedFeaturedIds] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [inventoryStatus, setInventoryStatus] = useState("idle");
  const [inventorySearch, setInventorySearch] = useState("");
  const [showcaseFeedback, setShowcaseFeedback] = useState("");
  const [showcaseFeedbackTone, setShowcaseFeedbackTone] = useState("info");
  const [isSavingShowcase, setIsSavingShowcase] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState({});

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  const setShowcaseMessage = useCallback(
    (message, tone = "info") => {
      setShowcaseFeedback(message);
      setShowcaseFeedbackTone(tone);
    },
    [setShowcaseFeedback, setShowcaseFeedbackTone]
  );

  const fetchFeaturedProducts = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/featured-products");
      const items = Array.isArray(data?.products) ? data.products : [];
      setFeatured(items.slice(0, FEATURED_SHOWCASE_LIMIT));

      const requestedIds = Array.isArray(data?.requested_ids)
        ? data.requested_ids
            .map((id) => (typeof id === "string" ? id.trim() : ""))
            .filter(Boolean)
        : [];
      if (requestedIds.length > 0) {
        setSelectedFeaturedIds(requestedIds.slice(0, FEATURED_SHOWCASE_LIMIT));
      } else {
        const derivedIds = items
          .map((product) => resolveProductId(product))
          .filter(Boolean);
        setSelectedFeaturedIds(derivedIds.slice(0, FEATURED_SHOWCASE_LIMIT));
      }
      setLabelOverrides(
        mapIncomingLabelOverrides(
          data?.label_overrides,
          requestedIds.length ? requestedIds : []
        )
      );
    } catch (error) {
      setFeatured([]);
      setLabelOverrides({});
      if (isAdmin) {
        const message =
          error.response?.data?.message ??
          "We couldn't load the featured products. Please try again.";
        setShowcaseMessage(message, "error");
      }
    }
  }, [isAdmin, setShowcaseMessage]);

  useEffect(() => {
    fetchFeaturedProducts();
  }, [fetchFeaturedProducts]);

  useEffect(() => {
    setLabelOverrides((prev) => {
      if (!prev || typeof prev !== "object") {
        return {};
      }
      const allowed = new Set(selectedFeaturedIds);
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([productId, entry]) => {
        if (allowed.has(productId)) {
          next[productId] = entry;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedFeaturedIds]);

  useEffect(() => {
    if (!isAdmin || !editorOpen) {
      return;
    }

    let isMounted = true;

    const loadInventory = async () => {
      setInventoryStatus("loading");
      setShowcaseMessage("", "info");

      try {
        const { data } = await apiClient.get("/api/products");
        if (!isMounted) {
          return;
        }
        const products = Array.isArray(data?.products) ? data.products : [];
        setInventory(products);
        setInventoryStatus("success");
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message =
          error.response?.data?.message ??
          "We couldn't load the product catalog. Please try again.";
        setInventoryStatus("error");
        setShowcaseMessage(message, "error");
      }
    };

    loadInventory();

    return () => {
      isMounted = false;
    };
  }, [editorOpen, isAdmin, setShowcaseMessage]);

  const productMap = useMemo(() => {
    const lookup = new Map();
    inventory.forEach((product) => {
      const identifier = resolveProductId(product);
      if (identifier) {
        lookup.set(identifier, product);
      }
    });
    return lookup;
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    if (!query) {
      return inventory;
    }

    return inventory.filter((product) => {
      const name = (product?.name || "").toLowerCase();
      const curator = (product?.created_by_name || "").toLowerCase();
      return name.includes(query) || curator.includes(query);
    });
  }, [inventory, inventorySearch]);

  const selectedProducts = useMemo(
    () => selectedFeaturedIds.map((id) => productMap.get(id)),
    [productMap, selectedFeaturedIds]
  );

  const showcaseSelectionIsComplete =
    selectedFeaturedIds.length === FEATURED_SHOWCASE_LIMIT;

  const showcaseItems = useMemo(
    () =>
      featured.map((product, index) => {
        const imageUrls = extractProductImageUrls(product);
        const primaryImageUrl = imageUrls[0] ?? "";
        const productName =
          normalizeString(product?.name) || "Lime Atelier Exclusive";
        const description = pickDescription(product);
        const fallbackBadge = deriveBadgeLabel(product);
        const fallbackProvenance = deriveProvenanceLabel(product);
        const canonicalProductId =
          resolveProductId(product) ||
          normalizeString(product?.id) ||
          deriveProductId(product, index);
        const overridesForProduct =
          (canonicalProductId && labelOverrides[canonicalProductId]) || {};
        const badge =
          normalizeString(overridesForProduct.badgeLabel) || fallbackBadge;
        const provenance =
          normalizeString(overridesForProduct.provenanceLabel) ||
          fallbackProvenance;
        const imageCount = imageUrls.length;
        const pricing = getPricingDetails(product?.price, product?.discount_price);

        return {
          id: canonicalProductId,
          productName,
          pricing,
          description,
          badge,
          provenance,
          primaryImageUrl,
          imageCount,
        };
      }),
    [featured, labelOverrides]
  );

  const handleToggleEditor = () => {
    setEditorOpen((prev) => !prev);
    setShowcaseMessage("");
  };

  const handleToggleFeaturedProduct = (productId) => {
    if (!productId) {
      return;
    }

    setSelectedFeaturedIds((current) => {
      if (current.includes(productId)) {
        setShowcaseMessage("");
        return current.filter((id) => id !== productId);
      }

      if (current.length >= FEATURED_SHOWCASE_LIMIT) {
        setShowcaseMessage(
          `Only ${FEATURED_SHOWCASE_LIMIT} products can be highlighted on the home page.`,
          "error"
        );
        return current;
      }

      setShowcaseMessage("");
      return [...current, productId];
    });
  };

  const handleLabelOverrideChange = (productId, field, rawValue) => {
    if (
      !productId ||
      (field !== "badgeLabel" && field !== "provenanceLabel")
    ) {
      return;
    }
    const limitedValue =
      typeof rawValue === "string"
        ? rawValue.slice(0, SHOWCASE_LABEL_MAX_LENGTH)
        : "";

    setLabelOverrides((prev) => {
      const previousEntry = prev[productId] || {};
      const nextEntry = { ...previousEntry };
      if (!limitedValue.trim()) {
        if (typeof previousEntry[field] === "undefined") {
          return prev;
        }
        delete nextEntry[field];
      } else {
        if (previousEntry[field] === limitedValue) {
          return prev;
        }
        nextEntry[field] = limitedValue;
      }

      const hasBadge =
        typeof nextEntry.badgeLabel === "string" && nextEntry.badgeLabel.length > 0;
      const hasProvenance =
        typeof nextEntry.provenanceLabel === "string" &&
        nextEntry.provenanceLabel.length > 0;

      if (!hasBadge && !hasProvenance) {
        if (!prev[productId]) {
          return prev;
        }
        const { [productId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [productId]: nextEntry,
      };
    });
  };

  const handleRemoveFeaturedSlot = (slotIndex) => {
    setSelectedFeaturedIds((current) =>
      current.filter((_, index) => index !== slotIndex)
    );
    setShowcaseMessage("");
  };

  const handleSaveFeaturedSelection = async () => {
    if (!showcaseSelectionIsComplete) {
      setShowcaseMessage(
        `Select exactly ${FEATURED_SHOWCASE_LIMIT} products before publishing.`,
        "error"
      );
      return;
    }

    setIsSavingShowcase(true);
    setShowcaseMessage("");

    try {
      const payload = {
        product_ids: selectedFeaturedIds,
        label_overrides: buildLabelOverridePayload(
          selectedFeaturedIds,
          labelOverrides
        ),
      };
      await apiClient.put("/api/featured-products", payload);
      await fetchFeaturedProducts();
      setShowcaseMessage("Home showcase updated successfully.", "success");
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't update the home showcase. Please try again.";
      setShowcaseMessage(message, "error");
    } finally {
      setIsSavingShowcase(false);
    }
  };

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
          {isAdmin && (
            <button
              type="button"
              className="button button--outline"
              onClick={handleToggleEditor}
            >
              {editorOpen ? "Close editor" : "Edit selection"}
            </button>
          )}
        </div>
      </div>
      <div className="home-hero__showcase">
        <div className="showcase-grid">
          {showcaseItems.map((item, index) => (
            <Link
              key={item.id || `showcase-${index}`}
              to={item.id ? `/products/${item.id}` : "/products"}
              className="showcase-card"
              aria-label={`View details for ${item.productName}`}
            >
              <div className="showcase-card__media">
                {item.primaryImageUrl ? (
                  <img
                    src={item.primaryImageUrl}
                    alt={`${item.productName} hero`}
                    className="showcase-card__image"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="showcase-card__placeholder">
                    Lime Atelier
                  </div>
                )}
                <span className="showcase-card__tag">{item.badge}</span>
                {item.imageCount > 1 && (
                  <span className="showcase-card__meta-chip">
                    {item.imageCount} captures
                  </span>
                )}
              </div>
              <div className="showcase-card__body">
                <p className="showcase-card__eyebrow">{item.provenance}</p>
                <div className="showcase-card__heading">
                  <h2 className="showcase-card__name">{item.productName}</h2>
                  <div className="price-stack price-stack--tight">
                    <span className="price-stack__current">
                      {item.pricing.currentLabel}
                    </span>
                    {item.pricing.hasDiscount && (
                      <>
                        <span className="price-stack__original">
                          {item.pricing.baseLabel}
                        </span>
                        {item.pricing.savingsPercent && (
                          <span className="price-stack__badge">
                            Save {item.pricing.savingsPercent}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="showcase-card__description">
                  {item.description}
                </p>
                <div className="showcase-card__footer">
                  <span className="showcase-card__cta">
                    View tasting notes
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      role="presentation"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M7 12a1 1 0 0 1 1-1h6.586l-2.293-2.293a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 1 1-1.414-1.414L14.586 13H8a1 1 0 0 1-1-1Z"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="showcase__caption">
          Handpicked by our in-house tasting experts. Limited availability.
        </p>
      </div>
      {isAdmin && editorOpen && (
        <div
          className="showcase-editor"
          role="dialog"
          aria-modal="false"
          aria-labelledby="home-showcase-editor-title"
          aria-describedby="home-showcase-editor-subtitle"
        >
          <div className="showcase-editor__header">
            <div>
              <p className="eyebrow">Home showcase</p>
              <h2
                id="home-showcase-editor-title"
                className="showcase-editor__title"
              >
                Curate the storefront
              </h2>
              <p
                id="home-showcase-editor-subtitle"
                className="showcase-editor__subtitle"
              >
                Choose exactly four hero products to appear on the home page. Guests
                will always see them in the order you set here.
              </p>
            </div>
            <div className="showcase-editor__cta">
              <span className="showcase-editor__count">
                {selectedFeaturedIds.length}/{FEATURED_SHOWCASE_LIMIT} selected
              </span>
              <button
                type="button"
                className="button button--gradient showcase-editor__save"
                onClick={handleSaveFeaturedSelection}
                disabled={isSavingShowcase || !showcaseSelectionIsComplete}
              >
                {isSavingShowcase ? "Publishing..." : "Publish selection"}
              </button>
              <button
                type="button"
                className="showcase-editor__close"
                onClick={handleToggleEditor}
                aria-label="Close showcase editor"
              >
                ×
              </button>
            </div>
          </div>
          <div className="showcase-editor__content">
            <div className="showcase-editor__slots">
              {Array.from({ length: FEATURED_SHOWCASE_LIMIT }).map((_, index) => {
                const product = selectedProducts[index];
                const productId = selectedFeaturedIds[index] ?? `slot-${index}`;
                const coverImage =
                  product?.image_url ||
                  (Array.isArray(product?.image_urls)
                    ? product.image_urls[0]
                    : "");
                const slotPricing = product
                  ? getPricingDetails(product.price, product.discount_price)
                  : null;
                const slotOverrides =
                  (product && productId && labelOverrides[productId]) || {};
                const fallbackBadgeLabel = product
                  ? deriveBadgeLabel(product)
                  : "Signature";
                const fallbackProvenanceLabel = product
                  ? deriveProvenanceLabel(product)
                  : "Limited release";

                return (
                  <div key={productId} className="showcase-slot">
                    <div className="showcase-slot__label">Spot {index + 1}</div>
                    {product ? (
                      <>
                        <div className="showcase-slot__content">
                          {coverImage ? (
                            <img
                              src={coverImage}
                              alt=""
                              className="showcase-slot__image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="showcase-slot__image showcase-slot__image--placeholder">
                              Lime
                            </div>
                          )}
                          <div className="showcase-slot__details">
                            <p className="showcase-slot__name">{product.name}</p>
                            {slotPricing && (
                              <div className="price-stack price-stack--compact">
                                <span className="price-stack__current">
                                  {slotPricing.currentLabel}
                                </span>
                                {slotPricing.hasDiscount && (
                                  <>
                                    <span className="price-stack__original">
                                      {slotPricing.baseLabel}
                                    </span>
                                    {slotPricing.savingsPercent && (
                                      <span className="price-stack__badge">
                                        Save {slotPricing.savingsPercent}%
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="showcase-slot__remove"
                            onClick={() => handleRemoveFeaturedSlot(index)}
                            aria-label={`Remove ${product.name} from slot ${index + 1}`}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="showcase-slot__form">
                          <label className="showcase-slot__field">
                            <span>Badge label</span>
                            <input
                              type="text"
                              className="showcase-slot__input"
                              maxLength={SHOWCASE_LABEL_MAX_LENGTH}
                              value={slotOverrides.badgeLabel ?? ""}
                              placeholder={fallbackBadgeLabel}
                              onChange={(event) =>
                                handleLabelOverrideChange(
                                  productId,
                                  "badgeLabel",
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className="showcase-slot__field">
                            <span>Origin label</span>
                            <input
                              type="text"
                              className="showcase-slot__input"
                              maxLength={SHOWCASE_LABEL_MAX_LENGTH}
                              value={slotOverrides.provenanceLabel ?? ""}
                              placeholder={fallbackProvenanceLabel}
                              onChange={(event) =>
                                handleLabelOverrideChange(
                                  productId,
                                  "provenanceLabel",
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <p className="showcase-slot__empty">
                        Choose a product below to fill this position.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="showcase-editor__filter">
              <input
                id="showcase-search"
                type="search"
                className="showcase-editor__search"
                placeholder="Search products by name or curator..."
                aria-label="Search products to feature"
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
              />
            </div>
            {inventoryStatus === "loading" ? (
              <p className="page__status">Loading products...</p>
            ) : filteredInventory.length === 0 ? (
              <p className="page__status">
                {inventorySearch
                  ? "No products match your search."
                  : "You do not have any products online yet."}
              </p>
            ) : (
            <div className="showcase-editor__grid">
              {filteredInventory.map((product) => {
                const productId = resolveProductId(product);
                const isSelected = selectedFeaturedIds.includes(productId);
                const selectionIndex =
                  selectedFeaturedIds.indexOf(productId) + 1;
                const coverImage =
                  product.image_url ||
                  (Array.isArray(product.image_urls)
                    ? product.image_urls[0]
                    : "");
                const pickerPricing = getPricingDetails(
                  product.price,
                  product.discount_price
                );

                return (
                  <button
                    type="button"
                    key={productId || product.name}
                      className={`showcase-picker-card${
                        isSelected ? " showcase-picker-card--selected" : ""
                      }`}
                      onClick={() => handleToggleFeaturedProduct(productId)}
                    >
                      <div className="showcase-picker-card__media">
                        {coverImage ? (
                          <img
                            src={coverImage}
                            alt=""
                            loading="lazy"
                            className="showcase-picker-card__image"
                          />
                        ) : (
                          <div className="showcase-picker-card__placeholder">
                            Lime Atelier
                          </div>
                        )}
                        {isSelected ? (
                          <span className="showcase-picker-card__badge">
                            #{selectionIndex}
                          </span>
                        ) : null}
                      </div>
                    <div className="showcase-picker-card__body">
                      <p className="showcase-picker-card__name">
                        {product.name}
                      </p>
                      <div className="price-stack price-stack--compact">
                        <span className="price-stack__current">
                          {pickerPricing.currentLabel}
                        </span>
                        {pickerPricing.hasDiscount && (
                          <>
                            <span className="price-stack__original">
                              {pickerPricing.baseLabel}
                            </span>
                            {pickerPricing.savingsPercent && (
                              <span className="price-stack__badge">
                                Save {pickerPricing.savingsPercent}%
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <p className="showcase-picker-card__creator">
                        {product.created_by_name
                          ? `By ${product.created_by_name}`
                            : "Seller unknown"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {showcaseFeedback ? (
            <p
              className={`form-feedback home-showcase-feedback ${
                showcaseFeedbackTone === "error"
                  ? "form-feedback--error"
                  : showcaseFeedbackTone === "success"
                  ? "form-feedback--success"
                  : ""
              }`}
            >
              {showcaseFeedback}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default Home;
