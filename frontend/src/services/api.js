import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

export const experimentApi = {
  create: (config) => api.post('/experiments', config),
  list: (params = {}) => api.get('/experiments', { params }),
  get: (id) => api.get(`/experiments/${id}`),
  start: (id) => api.post(`/experiments/${id}/start`),
  stop: (id) => api.post(`/experiments/${id}/stop`),
  resume: (id, config = null) => api.post(`/experiments/${id}/resume`, config),
  delete: (id) => api.delete(`/experiments/${id}`),
  getRounds: (id, params = {}) => api.get(`/experiments/${id}/rounds`, { params }),
  compare: (ids) => api.get('/experiments/compare', { params: { ids: ids.join(',') } }),
  getTemplates: () => api.get('/experiments/templates'),
}

export default api
