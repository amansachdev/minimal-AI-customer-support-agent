import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
  timeout: 35_000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("support_agent_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem("support_agent_token");
      window.dispatchEvent(new Event("support-agent-session-expired"));
    }
    return Promise.reject(error);
  },
);

export function getApiError(error, fallback = "Something went wrong. Please try again.") {
  return error.response?.data?.error || (error.code === "ECONNABORTED"
    ? "The assistant took too long to respond. Please try again."
    : fallback);
}

export default api;
