import { ResumeService } from '../services/resumeService.js';

const resumeService = new ResumeService();

export const getResumes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      searchQuery = '',
      includeRelated = 'false',
      sessionId = ''
    } = req.query;

    const result = await resumeService.getAllResumes({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      searchQuery,
      sessionId,
      includeRelated: includeRelated === 'true'
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Erro ao buscar currículos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getResumeById = async (req, res) => {
  try {
    const { id } = req.params;
    const resume = await resumeService.getResumeById(id);

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Currículo não encontrado'
      });
    }

    res.json({
      success: true,
      resume
    });

  } catch (error) {
    console.error('Erro ao buscar currículo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const deleteResume = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await resumeService.deleteResume(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Currículo não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Currículo excluído com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir currículo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const clearAllData = async (req, res) => {
  try {
    const result = await resumeService.clearAllData();

    res.json({
      success: true,
      message: 'Todos os dados foram excluídos com sucesso',
      ...result
    });

  } catch (error) {
    console.error('Erro ao limpar dados:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getStatistics = async (req, res) => {
  try {
    const stats = await resumeService.getStatistics();

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const exportResumes = async (req, res) => {
  try {
    const { format = 'xlsx', searchQuery = '' } = req.query;

    const data = await resumeService.exportResumes(format, { searchQuery });

    const filename = `curriculos_${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } else {
      throw new Error('Formato não suportado. Use "xlsx" ou "json"');
    }

  } catch (error) {
    console.error('Erro ao exportar currículos:', error);

    // Verificar se headers já foram enviados
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};
