import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para logging
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const scraperAPI = {
  startScrape: (query, options = {}) =>
    api.post('/scrape', { query, ...options }),

  countResumes: (payload = {}) =>
    api.post('/scrape/count', payload),

  createStream: () =>
    new EventSource('/api/scrape/stream'),

  getStatus: () =>
    api.get('/status')
};

export const resumeAPI = {
  getResumes: (params = {}) =>
    api.get('/resumes', { params }),

  getResumeById: (id) =>
    api.get(`/resumes/${id}`),

  deleteResume: (id) =>
    api.delete(`/resumes/${id}`),

  clearAllData: () =>
    api.delete('/resumes'),

  getStatistics: () =>
    api.get('/statistics'),

  exportResumes: (format = 'json', searchQuery = '') => {
    const url = `/export?format=${format}&searchQuery=${encodeURIComponent(searchQuery)}`;
    return api.get(url, { responseType: 'blob' });
  }
};

export default api;
