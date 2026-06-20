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

export const reportApi = {
  generate: (experimentIds) => api.post('/reports/generate', { experiment_ids: experimentIds }),
  get: (id) => api.get(`/reports/${id}`),
  getPdfUrl: (id) => `${API_BASE_URL}/reports/${id}/pdf`,
  downloadPdf: async (id) => {
    try {
      const response = await api.get(`/reports/${id}/pdf`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `report_${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download PDF failed:', error)
      const url = `${API_BASE_URL}/reports/${id}/pdf`
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `report_${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }
}

export default api
