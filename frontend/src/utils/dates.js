const DEFAULT_PUBLISHED_OPTIONS = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export const formatPublishedDate = (value, options = DEFAULT_PUBLISHED_OPTIONS) => {
  if (!value) {
    return "";
  }

  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toLocaleString(undefined, options);
  } catch (error) {
    return "";
  }
};

export default formatPublishedDate;

