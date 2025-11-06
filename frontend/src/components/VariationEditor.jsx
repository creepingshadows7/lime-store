import { useCallback, useMemo } from "react";

const generateVariationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `variation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const VariationEditor = ({
  variations = [],
  onChange = () => {},
  disabled = false,
  label = "Variations",
  helperText = "",
  maxVariations = 12,
}) => {
  const safeVariations = useMemo(
    () =>
      Array.isArray(variations)
        ? variations.map((variation) => ({
            id:
              variation?.id ??
              variation?._id ??
              variation?.tempId ??
              generateVariationId(),
            name: variation?.name ?? "",
          }))
        : [],
    [variations]
  );

  const propagateChange = useCallback(
    (nextVariations) => {
      if (typeof onChange === "function") {
        onChange(nextVariations);
      }
    },
    [onChange]
  );

  const handleAddVariation = () => {
    if (disabled || safeVariations.length >= maxVariations) {
      return;
    }
    const nextVariation = { id: generateVariationId(), name: "" };
    propagateChange([...safeVariations, nextVariation]);
  };

  const handleNameChange = (variationId, value) => {
    propagateChange(
      safeVariations.map((variation) =>
        variation.id === variationId ? { ...variation, name: value } : variation
      )
    );
  };

  const handleRemoveVariation = (variationId) => {
    propagateChange(
      safeVariations.filter((variation) => variation.id !== variationId)
    );
  };

  const limitReached = safeVariations.length >= maxVariations;

  return (
    <section className="variation-editor">
      <header className="variation-editor__header">
        <span>{label}</span>
        {helperText ? (
          <p className="variation-editor__helper">{helperText}</p>
        ) : null}
      </header>
      {safeVariations.length === 0 ? (
        <p className="variation-editor__empty">
          No variations yet. Add colorways, sizes, or finishing touches.
        </p>
      ) : (
        <div className="variation-editor__list">
          {safeVariations.map((variation) => (
            <div key={variation.id} className="variation-editor__item">
              <input
                type="text"
                value={variation.name}
                onChange={(event) =>
                  handleNameChange(variation.id, event.target.value)
                }
                placeholder="e.g., Electric Blue"
                disabled={disabled}
              />
              <button
                type="button"
                className="variation-editor__remove"
                onClick={() => handleRemoveVariation(variation.id)}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="variation-editor__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={handleAddVariation}
          disabled={disabled || limitReached}
        >
          {limitReached ? "Variation Limit Reached" : "Add Variation"}
        </button>
        {limitReached ? (
          <span className="variation-editor__limit">
            Up to {maxVariations} variations per product.
          </span>
        ) : null}
      </div>
    </section>
  );
};

export default VariationEditor;
