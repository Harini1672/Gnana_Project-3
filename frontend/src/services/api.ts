import axios from 'axios';
import { supabase } from './auth';

// In dev, Vite proxies /api -> backend (see vite.config.ts). In production, set VITE_API_URL to your hosted API.
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '') + '/';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach Supabase JWT access token to admin headers
api.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      console.error('Request interceptor: Failed to load auth session:', err);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Surface connection and auth errors clearly in the console
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      console.error('Backend unreachable. Ensure the FastAPI server is running on port 8000.');
    } else if (error.response.status === 401) {
      console.error('API authentication failed. Please sign in again.');
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
