import React, { useState, useEffect, useRef, useCallback } from 'react';
import SearchForm from './components/SearchForm';
import ProgressIndicator from './components/ProgressIndicator';
import ResumeTable from './components/ResumeTable';
import CandidateCard from './components/CandidateCard';
import StatsCards from './components/StatsCards';
import ExportButtons from './components/ExportButtons';
import Toast from './components/Toast';
import { scraperAPI, resumeAPI } from './services/api';

const DEFAULT_PROGRESS = {
  status: 'idle',
  scraped: 0,
  currentPage: 0,
  total: 0,
  profilesScraped: 0,
  profilesTotal: 0,
  completionRate: 0,
  errorCount: 0,
  sessionId: null,
  searchQuery: '',
  duration: 0
};

function App() {
  const [resumes, setResumes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [filteredCount, setFilteredCount] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [streamStatus, setStreamStatus] = useState('idle'); // idle | connecting | open | closed | error
  const eventSourceRef = useRef(null);

  const closeStream = useCallback((nextStatus = 'idle') => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreamStatus(nextStatus);
  }, []);

  useEffect(() => {
    return () => {
      closeStream('idle');
    };
  }, [closeStream]);

  const updateProgress = useCallback((partial = {}) => {
    setProgress((previous) => {
      const next = { ...previous };
      Object.entries(partial).forEach(([key, value]) => {
        if (value !== undefined) {
          next[key] = value;
        }
      });
      return next;
    });
  }, []);

  const handleProgressUpdate = useCallback((payload = {}) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    updateProgress(payload);

    const rawTotal =
      payload.filteredCount ??
      payload.filtered ??
      payload.total ??
      payload.count ??
      null;

    let totalValue = null;
    if (typeof rawTotal === 'number') {
      totalValue = rawTotal;
    } else if (typeof rawTotal === 'string') {
      const digitsOnly = rawTotal.replace(/\D/g, '');
      if (digitsOnly.length > 0) {
        totalValue = Number(digitsOnly);
      } else {
        const parsed = Number(rawTotal);
        if (!Number.isNaN(parsed)) {
          totalValue = parsed;
        }
      }
    }

    if (totalValue !== null) {
      setFilteredCount((previous) => {
        if (previous !== null && previous >= totalValue) {
          return previous;
        }
        return totalValue;
      });
    }
  }, [updateProgress]);

  const mergeResume = (incoming) => {
    if (!incoming || !incoming.profile_url) {
      return;
    }

    const normalizedResume = {
      ...incoming,
      session_id:
        incoming.session_id ??
        incoming.sessionId ??
        sessionInfo?.sessionId ??
        progress.sessionId ??
        null,
      search_query:
        incoming.search_query ??
        incoming.searchQuery ??
        sessionInfo?.query ??
        progress.searchQuery ??
        searchQuery
    };

    setResumes((previous) => {
      const index = previous.findIndex(
        (item) => item.profile_url === normalizedResume.profile_url
      );

      let next;
      if (index !== -1) {
        next = [...previous];
        next[index] = {
          ...next[index],
          ...normalizedResume,
          __live: true
        };
      } else {
        next = [
          {
            ...normalizedResume,
            __live: true
          },
          ...previous
        ];
      }

      updateProgress({
        scraped: next.length,
        sessionId: normalizedResume.session_id ?? progress.sessionId,
        searchQuery: normalizedResume.search_query ?? progress.searchQuery
      });

      return next;
    });
  };

  const applyProfileData = (payload) => {
    if (!payload || !payload.url) {
      return;
    }

    setResumes((previous) =>
      previous.map((item) => {
        if (item.profile_url === payload.url) {
          const personalData = payload.profile?.personalData || {};
          return {
            ...item,
            contact_email: personalData.email || item.contact_email,
            contact_phone: personalData.phone || item.contact_phone,
            __live: false,
            __profile: payload.profile || item.__profile
          };
        }
        return item;
      })
    );
  };

  // Carregar currículos ao montar o componente
  useEffect(() => {
    loadResumes(1);
  }, []);

  // Monitorar status do scraping
  useEffect(() => {
    let interval;

    if (isScraping && !eventSourceRef.current) {
      interval = setInterval(async () => {
        try {
          const response = await scraperAPI.getStatus();
          const { isRunning, progress: currentProgress } = response.data;

          handleProgressUpdate(currentProgress);

          if (!isRunning && currentProgress.status === 'completed') {
            setIsScraping(false);
            showToast('Coleta concluída com sucesso!', 'success');
            loadResumes(1);
          } else if (!isRunning && currentProgress.status === 'error') {
            setIsScraping(false);
            showToast('Erro durante a coleta', 'error');
          }
        } catch (error) {
          console.error('Erro ao obter status:', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScraping, handleProgressUpdate]);

  const loadResumes = async (page = 1) => {
    try {
      setIsLoading(true);
      const params = {
        page,
        limit: 20,
        searchQuery
      };

      if (sessionInfo?.sessionId) {
        params.sessionId = sessionInfo.sessionId;
      }

      const response = await resumeAPI.getResumes(params);

      setResumes(response.data.resumes);
      setPagination(response.data.pagination);
      setCurrentPage(page);
      const resolvedTotal = response.data.pagination?.total;
      if (typeof resolvedTotal === 'number') {
        setFilteredCount((previous) => {
          if (previous !== null && previous >= resolvedTotal) {
            return previous;
          }
          return resolvedTotal;
        });
        updateProgress({
          total: Math.max(
            resolvedTotal,
            typeof progress.total === 'number' ? progress.total : 0
          ),
          searchQuery: progress.searchQuery || searchQuery,
          sessionId: sessionInfo?.sessionId ?? progress.sessionId
        });
      }
    } catch (error) {
      console.error('Erro ao carregar currículos:', error);
      showToast('Erro ao carregar currículos', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const startStream = () => {
    closeStream('idle');
    setStreamStatus('connecting');

    let eventSource;

    try {
      eventSource = scraperAPI.createStream();
    } catch (error) {
      console.error('Erro ao criar stream:', error);
      setStreamStatus('error');
      showToast('Não foi possível conectar ao stream de progresso', 'error');
      return;
    }

    eventSourceRef.current = eventSource;

    const parsePayload = (event) => {
      if (!event || !event.data) return null;
      try {
        return JSON.parse(event.data);
      } catch (err) {
        console.error('Falha ao interpretar evento SSE:', err);
        return null;
      }
    };

    const handleStreamFailure = (message) => {
      setIsScraping(false);
      closeStream('error');
      if (message) {
        showToast(message, 'error');
      }
      loadResumes(1);
    };

    eventSource.onopen = () => {
      setStreamStatus('open');
    };

    eventSource.onerror = () => {
      setStreamStatus((previous) => (previous === 'error' ? previous : 'error'));
    };

    eventSource.addEventListener('session', (event) => {
      const payload = parsePayload(event);
      if (!payload) return;

      setSessionInfo({
        sessionId: payload.sessionId || payload.session_id || null,
        query: payload.query || payload.searchQuery || searchQuery,
        resumed: Boolean(payload.resumed),
        options: payload.options || {}
      });

      handleProgressUpdate({
        sessionId: payload.sessionId || payload.session_id || null,
        searchQuery: payload.query || payload.searchQuery || searchQuery,
        status: payload.status || 'running'
      });
    });

    eventSource.addEventListener('progress', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        handleProgressUpdate(payload);
      }
    });

    eventSource.addEventListener('page', (event) => {
      const payload = parsePayload(event);
      if (!payload) return;

      if (payload.progress) {
        handleProgressUpdate(payload.progress);
      } else {
        handleProgressUpdate(payload);
      }
    });

    eventSource.addEventListener('count', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        handleProgressUpdate(payload);
      }
    });

    eventSource.addEventListener('resume', (event) => {
      const payload = parsePayload(event);
      if (payload && payload.resume) {
        mergeResume({
          ...payload.resume,
          session_id: payload.sessionId ?? payload.resume.session_id,
          search_query: payload.searchQuery ?? payload.resume.search_query
        });
      }
    });

    eventSource.addEventListener('profile', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        applyProfileData(payload);
      }
    });

    eventSource.addEventListener('navigation', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        handleProgressUpdate({ currentPage: payload.currentPage, sessionId: payload.sessionId });
      }
    });

    eventSource.addEventListener('done', (event) => {
      const payload = parsePayload(event) || {};
      handleProgressUpdate({
        ...payload,
        status: 'completed'
      });
      setIsScraping(false);
      closeStream('closed');
      showToast('Coleta concluída com sucesso!', 'success');
      loadResumes(1);
    });

    eventSource.addEventListener('error', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        handleProgressUpdate({
          ...payload,
          status: payload.status || 'error'
        });
      }
      handleStreamFailure(payload?.message || 'Erro durante a coleta');
    });

    eventSource.addEventListener('stopped', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        handleProgressUpdate(payload);
      }

      setIsScraping(false);

      if (payload?.status === 'completed') {
        closeStream('closed');
        loadResumes(1);
        if (payload?.message) {
          showToast(payload.message, 'info');
        }
      } else {
        handleStreamFailure(payload?.message || 'Coleta interrompida');
      }
    });
  };

  const handleSearch = async (searchParams) => {
    try {
      closeStream('idle');
      setIsScraping(true);
      setSearchQuery(searchParams.query);
      setSessionInfo(null);
      setFilteredCount(null);
      setPagination(null);
      setResumes([]);
      setProgress({
        ...DEFAULT_PROGRESS,
        status: 'running',
        searchQuery: searchParams.query
      });

      const response = await scraperAPI.startScrape(searchParams.query, searchParams);

      if (response.data.success) {
        showToast('Coleta iniciada!', 'success');
        setStreamStatus('connecting');
        startStream();
      }
    } catch (error) {
      console.error('Erro ao iniciar busca:', error);
      setIsScraping(false);
      closeStream('error');

      if (error.response?.status === 409) {
        showToast('Já existe uma coleta em andamento', 'warning');
      } else if (error.response?.status === 500) {
        showToast('Erro no servidor. Verifique as credenciais no .env', 'error');
      } else {
        showToast('Erro ao iniciar busca', 'error');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente excluir este currículo?')) {
      return;
    }

    try {
      await resumeAPI.deleteResume(id);
      showToast('Currículo excluído com sucesso', 'success');
      loadResumes(currentPage);
    } catch (error) {
      console.error('Erro ao excluir currículo:', error);
      showToast('Erro ao excluir currículo', 'error');
    }
  };

  const handlePageChange = (newPage) => {
    loadResumes(newPage);
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const closeToast = () => {
    setToast(null);
  };

  const derivedFilteredCount =
    filteredCount !== null
      ? filteredCount
      : isScraping
        ? progress.total
        : null;

  const derivedTotalCount = isScraping
    ? progress.scraped || resumes.length || 0
    : pagination?.total || 0;

  const handleClearAllData = async () => {
    const confirmMessage = `⚠️ ATENÇÃO: Esta ação irá excluir TODOS os ${pagination?.total || 0} currículos coletados e não pode ser desfeita.\n\nTem certeza que deseja continuar?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Segunda confirmação
    const secondConfirm = window.confirm('Esta é sua última chance! Realmente deseja excluir TODOS os dados?');

    if (!secondConfirm) {
      return;
    }

    try {
      setIsLoading(true);
      closeStream('idle');
      await resumeAPI.clearAllData();
      showToast('Todos os dados foram excluídos com sucesso!', 'success');

      // Recarregar a lista
      await loadResumes(1);
      setFilteredCount(null);
      setSessionInfo(null);
      setProgress({ ...DEFAULT_PROGRESS });
      setStreamStatus('idle');

    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      showToast('Erro ao limpar dados. Tente novamente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                📚 Catho Collector
              </h1>
              <p className="text-gray-600 mt-1">
                Coletor de Currículos do Catho.com.br
              </p>
            </div>
            <div className="flex items-center gap-4">
              {derivedFilteredCount !== null && (
                <div className="text-right">
                  <div className="text-sm text-gray-500">Resultados encontrados</div>
                  <div className="text-xl font-semibold text-blue-600">
                    {Number(derivedFilteredCount).toLocaleString('pt-BR')}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-sm text-gray-500">Total de Currículos</div>
                <div className="text-2xl font-bold text-primary-600">
                  {derivedTotalCount}
                </div>
              </div>
              {pagination?.total > 0 && (
                <button
                  onClick={handleClearAllData}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  title="Excluir todos os dados"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Limpar Tudo
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SearchForm
          onSearch={handleSearch}
          isLoading={isScraping}
        />

        <ProgressIndicator
          progress={progress}
          isRunning={isScraping}
          streamStatus={streamStatus}
          session={sessionInfo}
        />

        {/* Statistics Cards */}
        {resumes.length > 0 && (
          <StatsCards
            totalResumes={pagination?.total || 0}
            currentPageResumes={resumes.length}
            totalPages={pagination?.totalPages || 0}
            currentPage={currentPage}
          />
        )}

          <ExportButtons
            totalResumes={pagination?.total || 0}
            searchQuery={searchQuery}
          />
        

        {/* Cards View */}
        {viewMode === 'cards' && (
          <>
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            ) : resumes.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Nenhum currículo encontrado
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Inicie uma busca para coletar currículos
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {resumes.map((resume) => (
                    <CandidateCard
                      key={resume.id}
                      candidate={resume}
                      onDelete={handleDelete}
                      onToast={showToast}
                    />
                  ))}
                </div>

                {/* Pagination for Cards View */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="mt-8 flex justify-center items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-gray-700">
                      Página {currentPage} de {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === pagination.totalPages}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <ResumeTable
            resumes={resumes}
            pagination={pagination}
            onDelete={handleDelete}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-600 text-sm">
          <p>Catho Collector - Desenvolvido para facilitar a coleta de currículos</p>
          <p className="mt-1 text-xs text-gray-500">
            Use de forma responsável e ética
          </p>
        </div>
      </footer>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </div>
  );
}

export default App;
