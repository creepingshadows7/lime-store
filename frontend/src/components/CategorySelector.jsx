import { useMemo, useState } from "react";

const noop = () => {};

const CategorySelector = ({
  categories = [],
  selectedCategoryIds = [],
  onSelectedCategoryIdsChange = noop,
  draftCategories = [],
  onDraftCategoriesChange = noop,
  label = "Categories",
  helperText = "",
  disabled = false,
}) => {
  const [draftValue, setDraftValue] = useState("");
  const [inputFeedback, setInputFeedback] = useState("");

  const safeSelectedIds = useMemo(() => {
    return Array.isArray(selectedCategoryIds)
      ? selectedCategoryIds.filter(Boolean)
      : [];
  }, [selectedCategoryIds]);

  const normalizedSelections = useMemo(() => {
    return new Set(safeSelectedIds);
  }, [safeSelectedIds]);

  const normalizedDrafts = useMemo(() => {
    return Array.isArray(draftCategories)
      ? draftCategories.filter((name) => typeof name === "string" && name.trim())
      : [];
  }, [draftCategories]);

  const categoryLookup = useMemo(() => {
    const lookup = new Map();
    categories.forEach((category) => {
      const key = (category?.name ?? "").trim().toLowerCase();
      if (key) {
        lookup.set(key, category.id ?? category._id ?? "");
      }
    });
    return lookup;
  }, [categories]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) =>
      (a?.name ?? "").localeCompare(b?.name ?? "", undefined, {
        sensitivity: "base",
      })
    );
  }, [categories]);

  const handleToggleCategory = (categoryId) => {
    if (!categoryId || disabled) {
      return;
    }

    if (normalizedSelections.has(categoryId)) {
      onSelectedCategoryIdsChange(
        safeSelectedIds.filter((id) => id !== categoryId)
      );
      return;
    }

    onSelectedCategoryIdsChange([...safeSelectedIds, categoryId]);
  };

  const handleDraftSubmit = () => {
    const trimmedValue = draftValue.trim();
    if (!trimmedValue) {
      setInputFeedback("");
      return;
    }

    if (trimmedValue.length < 2) {
      setInputFeedback("Use at least two characters.");
      return;
    }

    const normalizedValue = trimmedValue.toLowerCase();
    const existingDraft = normalizedDrafts.find(
      (draft) => draft.toLowerCase() === normalizedValue
    );
    if (existingDraft) {
      setInputFeedback("That new category is already queued.");
      setDraftValue("");
      return;
    }

    const existingCategoryId = categoryLookup.get(normalizedValue);
    if (existingCategoryId) {
      if (!normalizedSelections.has(existingCategoryId)) {
        onSelectedCategoryIdsChange([...safeSelectedIds, existingCategoryId]);
      }
      setInputFeedback("Category already exists. We selected it for you.");
      setDraftValue("");
      return;
    }

    onDraftCategoriesChange([...normalizedDrafts, trimmedValue]);
    setDraftValue("");
    setInputFeedback("");
  };

  const handleDraftKeyDown = (event) => {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      event.preventDefault();
      if (disabled) {
        return;
      }
      handleDraftSubmit();
    }
  };

  const handleRemoveDraft = (draftName) => {
    if (!draftName || disabled) {
      return;
    }
    onDraftCategoriesChange(
      normalizedDrafts.filter(
        (draft) => draft.toLowerCase() !== draftName.toLowerCase()
      )
    );
  };

  return (
    <section className="category-selector">
      <header className="category-selector__header">
        <span>{label}</span>
        {helperText ? (
          <p className="category-selector__helper">{helperText}</p>
        ) : null}
      </header>

      {sortedCategories.length > 0 ? (
        <div className="category-selector__chips" role="list">
          {sortedCategories.map((category) => {
            const categoryId = category.id ?? category._id;
            if (!categoryId) {
              return null;
            }
            const isSelected = normalizedSelections.has(categoryId);
            return (
              <button
                type="button"
                key={categoryId}
                className={`category-selector__chip${
                  isSelected ? " category-selector__chip--selected" : ""
                }`}
                onClick={() => handleToggleCategory(categoryId)}
                disabled={disabled}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="category-selector__empty">
          No categories yet. Add a new label below to get started.
        </p>
      )}

      <div className="category-selector__input">
        <input
          type="text"
          value={draftValue}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setInputFeedback("");
          }}
          onKeyDown={handleDraftKeyDown}
          placeholder="Type a new category and press Enter"
          disabled={disabled}
        />
        <button
          type="button"
          className="button button--ghost"
          onClick={handleDraftSubmit}
          disabled={disabled}
        >
          Add
        </button>
      </div>
      {inputFeedback ? (
        <p className="category-selector__feedback">{inputFeedback}</p>
      ) : null}

      {normalizedDrafts.length > 0 && (
        <div className="category-selector__drafts">
          {normalizedDrafts.map((draft) => (
            <span key={draft} className="category-selector__draft">
              {draft}
              <button
                type="button"
                aria-label={`Remove ${draft}`}
                onClick={() => handleRemoveDraft(draft)}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export default CategorySelector;
