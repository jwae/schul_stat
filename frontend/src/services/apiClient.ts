import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import { authStore } from "../authStore";

/**
 * Standardized Axios instance for the Schul-Stat API.
 */
const apiClient = axios.create({
  baseURL: "/", // Base URL is the root of the project
  headers: {
    "Content-Type": "application/json",
  },
});

// Callback for unauthorized requests (401)
// We use a callback to avoid circular dependencies with useAuth/useDashboardNavigation
let unauthorizedCallback: (() => void) | null = null;

export function registerUnauthorizedCallback(callback: () => void) {
  unauthorizedCallback = callback;
}

/**
 * Request Interceptor: Automatically attach the Authorization header.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor: Handle global errors like 401.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const status = error?.response?.status;
    
    // If 401 Unauthorized, trigger logout via callback
    if (status === 401) {
      console.warn("Unauthorized request detected (401). Triggering logout...");
      if (unauthorizedCallback) {
        unauthorizedCallback();
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
