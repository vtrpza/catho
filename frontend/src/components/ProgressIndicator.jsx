import React from 'react';

export default function ProgressIndicator({ progress, isRunning }) {
  if (!isRunning && progress.status === 'idle') {
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
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`rounded-lg border-2 p-4 mb-6 ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          {getStatusText()}
        </h3>
        {progress.status === 'running' && (
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-700">
          <span>📄 Página atual:</span>
          <span className="font-semibold">{progress.currentPage || 0}</span>
        </div>

        <div className="flex justify-between text-sm text-gray-700">
          <span>📊 Currículos coletados:</span>
          <span className="font-semibold">{progress.scraped || 0}</span>
        </div>

        {progress.status === 'running' && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-primary-600 h-2.5 rounded-full transition-all duration-300 animate-pulse"
                style={{ width: '100%' }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
