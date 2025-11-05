export const getProfileInitial = (input) => {
  if (!input) {
    return "U";
  }

  const nameCandidate =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name.trim()
      : null;

  const emailCandidate =
    typeof input.email === "string" && input.email.trim().length > 0
      ? input.email.trim()
      : null;

  const source = nameCandidate ?? emailCandidate;

  if (!source) {
    return "U";
  }

  return source.charAt(0).toUpperCase();
};
