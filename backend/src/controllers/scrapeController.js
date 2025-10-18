import { CathoScraper } from '../services/cathoScraper.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

let currentScraper = null;
let currentScraperCleanup = null;

const sseClients = new Set();

const cleanupClient = (client) => {
  if (!client) return;
  if (client.heartbeat) {
    clearInterval(client.heartbeat);
  }
  if (client.res && !client.res.writableEnded) {
    try {
      client.res.end();
    } catch (err) {
      // ignore
    }
  }
  sseClients.delete(client);
};

const writeSse = (res, event, data) => {
  if (!res || res.writableEnded) return;
  const payload = data === undefined ? '{}' : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
};

const broadcast = (event, data) => {
  if (sseClients.size === 0) return;
  const message = data === undefined ? {} : data;
  for (const client of sseClients) {
    if (!client.res || client.res.writableEnded) {
      cleanupClient(client);
      continue;
    }
    try {
      writeSse(client.res, event, message);
    } catch (error) {
      console.error('Falha ao enviar evento SSE:', error.message);
      cleanupClient(client);
    }
  }
};

const bindScraperEvents = (scraper) => {
  if (!scraper) return () => {};
  const handlers = {
    session: (payload) => broadcast('session', payload),
    progress: (payload) => broadcast('progress', payload),
    count: (payload) => broadcast('count', payload),
    resume: (payload) => broadcast('resume', payload),
    profile: (payload) => broadcast('profile', payload),
    done: (payload) => broadcast('done', payload),
    error: (payload) => broadcast('error', payload),
    page: (payload) => broadcast('page', payload),
    navigation: (payload) => broadcast('navigation', payload),
    'filter-applied': (payload) => broadcast('filter-applied', payload),
    stopped: (payload) => broadcast('stopped', payload),
    control: (payload) => broadcast('control', payload)
  };

  const entries = Object.entries(handlers).map(([event, handler]) => {
    const bound = (data) => handler(data);
    scraper.on(event, bound);
    return { event, bound };
  });

  return () => {
    entries.forEach(({ event, bound }) => {
      if (typeof scraper.off === 'function') {
        scraper.off(event, bound);
      } else {
        scraper.removeListener(event, bound);
      }
    });
  };
};

const ensureCredentials = () => {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  if (!email || !password) {
    throw new Error('Credenciais nao configuradas no arquivo .env');
  }
  return { email, password };
};

export const streamScrape = (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  writeSse(res, 'connected', { timestamp: Date.now() });

  const client = {
    res,
    heartbeat: setInterval(() => {
      if (!res.writableEnded) {
        res.write(':\n\n');
      }
    }, 15000)
  };

  sseClients.add(client);

  if (currentScraper) {
    writeSse(res, 'progress', currentScraper.getProgress());
  }

  const closeHandler = () => cleanupClient(client);
  req.on('close', closeHandler);
  req.on('end', closeHandler);
};

export const startScrape = async (req, res) => {
  try {
    const {
      query,
      maxPages,
      delay = 2000,
      salaryRanges,
      ageRanges,
      gender,
      professionalAreas,
      hierarchicalLevels,
      lastUpdated,
      educationLevels,
      candidateSituation = 'indifferent',
      disabilityStatus = 'indifferent',
      enableParallel = true,
      concurrency = 3,
      scrapeFullProfiles = true,
      profileDelay = 2500,
      targetProfilesPerMin,
      targetProfiles,
      timeBudgetMinutes,
      performanceMode,
      advanced
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Parametro "query" e obrigatorio'
      });
    }

    if (currentScraper && currentScraper.isScraperRunning()) {
      return res.status(409).json({
        success: false,
        error: 'Ja existe uma coleta em andamento',
        progress: currentScraper.getProgress()
      });
    }

    const { email, password } = ensureCredentials();
    const scraper = new CathoScraper(email, password);

    if (currentScraperCleanup) {
      currentScraperCleanup();
      currentScraperCleanup = null;
    }

    currentScraperCleanup = bindScraperEvents(scraper);
    currentScraper = scraper;

    const scrapeOptions = {
      adaptive: {
        targetProfilesPerMin: parseInt(targetProfilesPerMin, 10) || undefined,
        targetProfiles: parseInt(targetProfiles, 10) || undefined,
        timeBudgetMinutes: parseInt(timeBudgetMinutes, 10) || undefined,
        mode: performanceMode || 'balanced'
      },
      advanced: {
        maxPages,
        delay,
        enableParallel,
        concurrency,
        profileDelay,
        ...(advanced && typeof advanced === 'object' ? advanced : {})
      },
      maxPages,
      delay,
      salaryRanges,
      ageRanges,
      gender,
      professionalAreas,
      hierarchicalLevels,
      lastUpdated,
      educationLevels,
      candidateSituation,
      disabilityStatus,
      enableParallel,
      concurrency,
      scrapeFullProfiles,
      profileDelay
    };

    broadcast('session', {
      status: 'started',
      query,
      options: scrapeOptions
    });

    scraper.scrape(query, scrapeOptions)
      .then((result) => {
        console.log('Coleta concluida:', result);
      })
      .catch((error) => {
        console.error('Erro no scraping:', error);
      })
      .finally(() => {
        if (currentScraperCleanup) {
          currentScraperCleanup();
          currentScraperCleanup = null;
        }
        currentScraper = null;
      });

    res.json({
      success: true,
      message: 'Coleta iniciada com sucesso',
      query,
      options: scrapeOptions
    });
  } catch (error) {
    console.error('Erro ao iniciar scrape:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const pauseScrape = async (_req, res) => {
  try {
    if (!currentScraper) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma coleta ativa para pausar'
      });
    }

    await currentScraper.requestPause();

    broadcast('paused', { status: 'paused' });

    res.json({
      success: true,
      message: 'Coleta pausada'
    });
  } catch (error) {
    console.error('Erro ao pausar coleta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const resumeScrape = async (_req, res) => {
  try {
    if (!currentScraper) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma coleta pausada'
      });
    }

    await currentScraper.requestResume();

    broadcast('resumed', { status: 'running' });

    res.json({
      success: true,
      message: 'Coleta retomada'
    });
  } catch (error) {
    console.error('Erro ao retomar coleta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const stopScrape = async (_req, res) => {
  try {
    if (!currentScraper) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma coleta ativa para encerrar'
      });
    }

    await currentScraper.requestStop();

    broadcast('stopped', { status: 'stopped' });

    res.json({
      success: true,
      message: 'Coleta finalizada'
    });
  } catch (error) {
    console.error('Erro ao encerrar coleta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const countResumes = async (req, res) => {
  try {
    const { query, ...filters } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Parametro "query" e obrigatorio'
      });
    }

    const { email, password } = ensureCredentials();
    const scraper = new CathoScraper(email, password);
    const detach = bindScraperEvents(scraper);

    try {
      const result = await scraper.countResults(query, filters);
      broadcast('count', { ...result, source: 'count-endpoint' });

      return res.json({
        success: true,
        ...result
      });
    } finally {
      detach();
    }
  } catch (error) {
    console.error('Erro ao contar curriculos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getScrapingStatus = async (req, res) => {
  try {
    if (!currentScraper) {
      return res.json({
        status: 'idle',
        message: 'Nenhuma coleta em andamento'
      });
    }

    res.json({
      isRunning: currentScraper.isScraperRunning(),
      progress: currentScraper.getProgress(),
      goal: currentScraper.getPerformanceGoal()
    });
  } catch (error) {
    console.error('Erro ao obter status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
