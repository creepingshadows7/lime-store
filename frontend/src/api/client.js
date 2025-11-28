import axios from "axios";
import { AUTH_EXPIRED_EVENT } from "../constants";

const resolveBaseUrl = () => {
  const explicitUrl = import.meta.env.VITE_API_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname || "localhost";
    const configuredPort = import.meta.env.VITE_API_PORT || "5000";
    const trimmedPort = String(configuredPort).trim();
    const portSegment =
      trimmedPort && trimmedPort !== "80" && trimmedPort !== "443"
        ? `:${trimmedPort}`
        : "";
    return `${protocol}//${hostname}${portSegment}`;
  }

  return "http://localhost:5000";
};

const API_BASE_URL = resolveBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const clearStoredCredentials = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("limeShopToken");
  window.localStorage.removeItem("limeShopUser");
};

const emitAuthExpired = () => {
  if (typeof window === "undefined") {
    return;
  }
  const event =
    typeof CustomEvent === "function"
      ? new CustomEvent(AUTH_EXPIRED_EVENT)
      : new Event(AUTH_EXPIRED_EVENT);
  window.dispatchEvent(event);
};

const isAuthError = (error) => {
  const status = error?.response?.status;
  if (status === 401 || status === 422) {
    return true;
  }

  const message =
    error?.response?.data?.message || error?.response?.data?.msg || "";
  const normalizedMessage =
    typeof message === "string" ? message.toLowerCase() : "";
  return normalizedMessage.includes("token has expired");
};

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("limeShopToken")
      : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const isFormData =
    typeof FormData !== "undefined" && config.data instanceof FormData;
  if (isFormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const hasStoredToken =
      typeof window !== "undefined" &&
      Boolean(window.localStorage.getItem("limeShopToken"));

    if (hasStoredToken && isAuthError(error)) {
      clearStoredCredentials();
      emitAuthExpired();
    }

    return Promise.reject(error);
  }
);

export default apiClient;
