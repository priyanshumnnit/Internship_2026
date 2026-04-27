import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const DEFAULT_CACHE_TTL = 15_000;

export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';

const responseCache = new Map();
const inflightRequests = new Map();

let toastHandlers = null;

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = sortValue(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function buildCacheKey(url, config = {}) {
  return JSON.stringify({
    baseURL: config.baseURL || baseURL,
    url,
    params: sortValue(config.params || null),
  });
}

function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function registerApiToastHandlers(handlers) {
  toastHandlers = handlers;
}

export function getApiErrorMessage(error, fallback = 'Request failed') {
  const responseData = error?.response?.data;

  if (Array.isArray(responseData?.errors)) {
    return responseData.errors.join(', ');
  }

  return responseData?.error || responseData?.message || error?.message || fallback;
}

export function clearApiCache() {
  responseCache.clear();
  inflightRequests.clear();
}

export function invalidateApiCache(matcher) {
  if (!matcher) {
    clearApiCache();
    return;
  }

  for (const key of Array.from(responseCache.keys())) {
    const shouldInvalidate = typeof matcher === 'function'
      ? matcher(key)
      : key.includes(matcher);

    if (shouldInvalidate) {
      responseCache.delete(key);
    }
  }
}

export async function cachedGet(url, config = {}, options = {}) {
  const { ttl = DEFAULT_CACHE_TTL, force = false } = options;
  const key = buildCacheKey(url, config);
  const cached = responseCache.get(key);

  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  if (!force && inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const request = api.get(url, config)
    .then((response) => {
      if (ttl > 0) {
        responseCache.set(key, {
          response,
          expiresAt: Date.now() + ttl,
        });
      }

      inflightRequests.delete(key);
      return response;
    })
    .catch((error) => {
      inflightRequests.delete(key);
      throw error;
    });

  inflightRequests.set(key, request);
  return request;
}

export function setAuthTokens({ accessToken, refreshToken }) {
  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  clearApiCache();
}

export function clearAuthStorage() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearApiCache();
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();

    if (method && !['get', 'head', 'options'].includes(method)) {
      clearApiCache();
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const statusCode = error.response?.status;
    const refreshToken = getRefreshToken();

    if (statusCode === 401 && refreshToken && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios.post(`${baseURL}/auth/refresh`, { refreshToken });
        }

        const refreshResponse = await refreshPromise;
        const tokens = {
          accessToken: refreshResponse.data.accessToken,
          refreshToken: refreshResponse.data.refreshToken,
        };

        setAuthTokens(tokens);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearAuthStorage();
        throw refreshError;
      } finally {
        refreshPromise = null;
      }
    }

    if (!originalRequest.skipErrorToast && toastHandlers?.error) {
      toastHandlers.error(getApiErrorMessage(error, 'Something went wrong.'));
    }

    throw error;
  },
);

export default api;
