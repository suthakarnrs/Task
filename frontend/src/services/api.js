import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  setToken: (token) => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  },
  
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
  refreshToken: () => api.post('/auth/refresh'),
}

// Upload API
export const uploadAPI = {
  uploadFile: (formData, onProgress) => 
    api.post('/upload/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  
  getPreview: (jobId) => api.get(`/upload/preview/${jobId}`),
  submitMapping: (jobId, mapping) => api.post(`/upload/mapping/${jobId}`, mapping),
  getJobStatus: (jobId) => api.get(`/upload/status/${jobId}`),
  getJobs: (params) => api.get('/upload/jobs', { params }),
}

// Reconciliation API
export const reconciliationAPI = {
  getResults: (params) => api.get('/reconciliation/results', { params }),
  getResult: (id) => api.get(`/reconciliation/results/${id}`),
  resolveManually: (id, resolution) => api.put(`/reconciliation/results/${id}/resolve`, resolution),
  getStats: (uploadJobId) => api.get(`/reconciliation/stats/${uploadJobId}`),
  getPotentialMatches: (recordId, search) => 
    api.get(`/reconciliation/matches/${recordId}`, { params: { search } }),
  triggerReconciliation: (uploadJobId) => api.post(`/reconciliation/trigger/${uploadJobId}`),
}

// Dashboard API
export const dashboardAPI = {
  getSummary: (params) => api.get('/dashboard/summary', { params }),
  getTrends: (params) => api.get('/dashboard/trends', { params }),
  getActivity: (params) => api.get('/dashboard/activity', { params }),
  getHealth: () => api.get('/dashboard/health'),
}

// Audit API
export const auditAPI = {
  getLogs: (params) => api.get('/audit/logs', { params }),
  getTimeline: (entityType, entityId) => api.get(`/audit/timeline/${entityType}/${entityId}`),
  getStats: (params) => api.get('/audit/stats', { params }),
  exportLogs: (params) => api.get('/audit/export', { 
    params,
    responseType: 'blob'
  }),
}

export default api