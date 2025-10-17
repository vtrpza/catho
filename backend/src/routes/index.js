import express from 'express';
import { startScrape, getScrapingStatus, countResumes, streamScrape } from '../controllers/scrapeController.js';
import {
  getResumes,
  getResumeById,
  deleteResume,
  clearAllData,
  getStatistics,
  exportResumes
} from '../controllers/resumeController.js';

const router = express.Router();

// Rotas de scraping
router.post('/scrape', startScrape);
router.post('/scrape/count', countResumes);
router.get('/scrape/stream', streamScrape);
router.get('/status', getScrapingStatus);

// Rotas de currículos
router.get('/resumes', getResumes);
router.get('/resumes/:id', getResumeById);
router.delete('/resumes/:id', deleteResume);
router.delete('/resumes', clearAllData); // Clear all data

// Rotas de estatísticas e exportação
router.get('/statistics', getStatistics);
router.get('/export', exportResumes);

export default router;
