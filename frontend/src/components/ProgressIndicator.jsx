import React from 'react';

const CONNECTION_LABELS = {
  idle: 'Offline',
  connecting: 'Conectando',
  open: 'Conectado',
  closed: 'Encerrado',
  error: 'Erro na conexão'
};

const CONNECTION_STYLES = {
  idle: 'bg-gray-100 text-gray-600',
  connecting: 'bg-yellow-100 text-yellow-700',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  error: 'bg-red-100 text-red-700'
};

export default function ProgressIndicator({ progress, isRunning, streamStatus, session }) {
  const shouldHide = !isRunning && progress.status === 'idle' && !progress.sessionId;
  if (shouldHide) {
    return null;
  }

  const getStatusText = () => {
    switch (progress.status) {
      case 'running':
        return '🔄 Coletando currículos...';
      case 'completed':
        return '✅ Coleta concluída!';
      case 'error':
        return '❌ Erro na coleta';
      case 'failed':
        return '⚠️ Coleta interrompida';
      default:
        return '⏳ Aguardando...';
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'running':
        return 'bg-blue-50 border-blue-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'error':
      case 'failed':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const connectionText = CONNECTION_LABELS[streamStatus] || CONNECTION_LABELS.idle;
  const connectionStyle = CONNECTION_STYLES[streamStatus] || CONNECTION_STYLES.idle;
  const profilePercent =
    progress.profilesTotal && progress.profilesTotal > 0
      ? Math.min(100, Math.round((progress.profilesScraped / progress.profilesTotal) * 100))
      : null;
  const durationSeconds =
    progress.duration && progress.duration > 0
      ? Math.round(progress.duration / 1000)
      : null;

  const searchLabel = progress.searchQuery || session?.query || '';

  return (
    <div className={`rounded-lg border-2 p-4 mb-6 ${getStatusColor()}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            {getStatusText()}
            {progress.status === 'running' && (
              <span className="flex space-x-1">
                <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
            )}
          </h3>
          {searchLabel && (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-700">Busca:</span> {searchLabel}
            </p>
          )}
          {progress.sessionId && (
            <p className="text-xs text-gray-500 font-mono break-all mt-1">
              Sessão: {progress.sessionId}
            </p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold ${connectionStyle}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {connectionText}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-gray-700">
          <span>📄 Página atual:</span>
          <span className="font-semibold">{progress.currentPage || 0}</span>
        </div>

        <div className="flex justify-between text-sm text-gray-700">
          <span>📊 Currículos coletados:</span>
          <span className="font-semibold">
            {progress.scraped || 0}
            {progress.total ? ` / ${progress.total}` : ''}
          </span>
        </div>

        {profilePercent !== null && (
          <>
            <div className="flex justify-between text-sm text-gray-700">
              <span>👤 Perfis detalhados:</span>
              <span className="font-semibold">
                {progress.profilesScraped || 0}
                {progress.profilesTotal ? ` / ${progress.profilesTotal}` : ''}
                {profilePercent !== null ? ` (${profilePercent}%)` : ''}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${profilePercent}%` }}
              ></div>
            </div>
          </>
        )}

        {profilePercent === null && progress.status === 'running' && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-primary-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
          </div>
        )}

        {progress.errorCount > 0 && (
          <div className="flex justify-between text-sm text-red-600">
            <span>⚠️ Erros acumulados:</span>
            <span className="font-semibold">{progress.errorCount}</span>
          </div>
        )}

        {durationSeconds !== null && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Duração:</span>
            <span>{durationSeconds}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
