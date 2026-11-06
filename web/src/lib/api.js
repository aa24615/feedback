import axios from 'axios';

export const TOKEN_KEY = 'fb_user_token';
export const END_USER_TOKEN_KEY = 'fb_enduser_token';
export const GUEST_KEY = 'fb_guest_token';

function getGuestToken() {
  let g = localStorage.getItem(GUEST_KEY);
  if (!g) {
    g = (crypto.randomUUID && crypto.randomUUID()) || 'g_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(GUEST_KEY, g);
  }
  return g;
}

export function getEndUserHeaders() {
  const headers = {};
  const eut = localStorage.getItem(END_USER_TOKEN_KEY);
  if (eut) headers['X-End-User-Token'] = eut;
  else {
    const g = localStorage.getItem(GUEST_KEY) || getGuestToken();
    headers['X-Guest-Token'] = g;
  }
  return headers;
}

/** 确保 C 端反馈者身份（游客），并将 token 存入 localStorage 供后续请求使用 */
export async function ensureSession(slug) {
  const g = getGuestToken();
  try {
    const { data } = await api.post(`/p/${slug}/session`, { guestToken: g, nickname: '游客' });
    if (data.token) localStorage.setItem(END_USER_TOKEN_KEY, data.token);
    return data.endUser;
  } catch {
    return null;
  }
}

// API 基础地址：构建时通过 VITE_API_BASE_URL 注入；留空则使用相对路径 /api
// （由 web 的 nginx 反代到 backend，适合单域名/本地部署）。
// 生产若 API 独立域名（如 https://api.example.com），构建时设为该域名，前端将直连该域名。
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim() || '/api';
const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  // C 端接口自动附加反馈者身份
  if (config.url && config.url.includes('/p/')) {
    const eu = getEndUserHeaders();
    Object.assign(config.headers, eu);
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new ApiError(body.message || '请求失败', body.code));
    }
    return body;
  },
  (err) => {
    if (err.response && err.response.data) {
      // blob 响应（如 CSV 导出）的错误体也是 Blob，需读取后解析 JSON
      if (err.config && err.config.responseType === 'blob' && err.response.data instanceof Blob) {
        return err.response.data.text().then((text) => {
          let body = null;
          try { body = JSON.parse(text); } catch { /* 非 JSON */ }
          return Promise.reject(new ApiError(body?.message || '请求失败', body?.code || err.response.status));
        });
      }
      const { message, code } = err.response.data;
      if (err.response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        if (window.location.hash.startsWith('#/app')) {
          window.location.href = '/#/login';
        }
      }
      return Promise.reject(new ApiError(message || '请求失败', code || err.response.status));
    }
    return Promise.reject(new ApiError('网络错误', 500));
  }
);

class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export default api;
