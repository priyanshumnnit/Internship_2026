import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api, {
  ACCESS_TOKEN_KEY,
  cachedGet,
  clearAuthStorage,
  setAuthTokens,
} from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (options = {}) => {
    const { silent = false, force = false } = options;
    const response = await cachedGet('/auth/me', { skipErrorToast: silent }, { ttl: 5_000, force });
    setUser(response.data.user || null);
    return response.data.user || null;
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        await refreshProfile({ silent: true, force: true });
      } catch (_error) {
        clearAuthStorage();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [refreshProfile]);

  const loginWithPassword = useCallback(async ({ email, phone, password }) => {
    const response = await api.post('/auth/login', { email, phone, password });
    setAuthTokens(response.data);
    const nextUser = await refreshProfile({ force: true });
    return nextUser;
  }, [refreshProfile]);

  const loginWithOtp = useCallback(async ({ email, phone, code }) => {
    const response = await api.post('/auth/login-otp', { email, phone, code });
    setAuthTokens(response.data);
    const nextUser = await refreshProfile({ force: true });
    return nextUser;
  }, [refreshProfile]);

  const requestOtp = useCallback(async (payload) => {
    const response = await api.post('/auth/request-otp', payload);
    return response.data;
  }, []);

  const signup = useCallback(async (payload) => {
    const response = await api.post('/auth/signup', payload);
    return response.data;
  }, []);

  const submitCscDocuments = useCallback(async (payload) => {
    const response = await api.post('/auth/csc-documents', payload);
    await refreshProfile({ force: true });
    return response.data;
  }, [refreshProfile]);

  const updateProfile = useCallback(async (payload) => {
    const response = await api.patch('/auth/profile', payload);
    setUser(response.data.user || null);
    return response.data;
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    loginWithPassword,
    loginWithOtp,
    requestOtp,
    signup,
    submitCscDocuments,
    updateProfile,
    refreshProfile,
    logout,
    setUser,
  }), [
    user,
    loading,
    loginWithPassword,
    loginWithOtp,
    requestOtp,
    signup,
    submitCscDocuments,
    updateProfile,
    refreshProfile,
    logout,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
