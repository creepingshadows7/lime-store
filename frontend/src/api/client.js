import axios from "axios";

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

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  const token = localStorage.getItem("limeShopToken");
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

export default apiClient;
