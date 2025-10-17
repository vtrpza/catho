import React, { useState } from 'react';
import { resumeAPI } from '../services/api';

export default function ExportButtons({ totalResumes, searchQuery = '' }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format) => {
    try {
      setIsExporting(true);

      const response = await resumeAPI.exportResumes(format, searchQuery);

      // Criar URL do blob com tipo correto
      const mimeType = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/json';

      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);

      // Criar link de download
      const link = document.createElement('a');
      link.href = url;
      link.download = `curriculos_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();

      // Limpar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar currículos. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  if (totalResumes === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">
        📥 Exportar Currículos
      </h2>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => handleExport('xlsx')}
          disabled={isExporting}
          className={`flex-1 py-3 px-6 rounded-md font-semibold transition-colors ${
            isExporting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isExporting ? '⏳ Exportando...' : '📊 Exportar Excel (XLSX)'}
        </button>

        <button
          onClick={() => handleExport('json')}
          disabled={isExporting}
          className={`flex-1 py-3 px-6 rounded-md font-semibold transition-colors ${
            isExporting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isExporting ? '⏳ Exportando...' : '📄 Exportar JSON'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2 text-center">
        📌 O arquivo Excel inclui abas separadas para: Currículos, Experiências, Formação, Cursos, Idiomas e Habilidades
      </p>

      <p className="text-sm text-gray-600 mt-3 text-center">
        {totalResumes} {totalResumes === 1 ? 'currículo disponível' : 'currículos disponíveis'} para exportação
      </p>
    </div>
  );
}
