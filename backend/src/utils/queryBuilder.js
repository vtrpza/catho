/**
 * Utilitário para construir URLs de busca do Catho com filtros
 * Baseado na estrutura REAL de query string do Catho.com.br
 */

export class CathoQueryBuilder {
  constructor(baseQuery) {
    this.params = {
      q: baseQuery,
      pais_id: 31, // Brasil
      'estado_id[-1]': -1,
      'regiaoId[-1]': -1,
      'cidade_id[-1]': -1,
      'zona_id[-1]': -1,
      page: 1,
      onde_buscar: 'todo_curriculo',
      como_buscar: 'todas_palavras',
      tipoBusca: 'busca_palavra_chave'
    };
  }

  /**
   * Adicionar filtro de pretensão salarial
   * Formato do Catho: faixaSal[ID]=ID
   * IDs das faixas salariais:
   * 1 = Até R$ 1.000
   * 2 = R$ 1.000 - R$ 2.000
   * 3 = R$ 2.000 - R$ 3.000
   * 4 = R$ 3.000 - R$ 4.000
   * 5 = R$ 4.000 - R$ 5.000
   * 6 = R$ 5.000 - R$ 6.000
   * 7 = R$ 6.000 - R$ 7.000
   * 8 = R$ 7.000 - R$ 8.000
   * 9 = R$ 8.000 - R$ 10.000
   * 10 = R$ 10.000 - R$ 12.000
   * 11 = R$ 12.000 - R$ 15.000
   * 12 = R$ 15.000 - R$ 20.000
   * 13 = Acima de R$ 20.000
   * @param {Array<number>} salaryRangeIds - Array com IDs das faixas salariais
   */
  setSalaryRanges(salaryRangeIds = []) {
    if (salaryRangeIds && salaryRangeIds.length > 0) {
      salaryRangeIds.forEach((rangeId) => {
        this.params[`faixaSal[${rangeId}]`] = rangeId;
      });
    }
    return this;
  }

  /**
   * Adicionar filtros de idade
   * Formato do Catho: idade[ID]=ID
   * Valores: 1 (18-20), 2 (21-25), 3 (26-30), 4 (31-40), 5 (41-50), 6 (50+)
   * @param {Array<number>} ageRanges - Array com IDs das faixas etárias
   */
  setAgeRanges(ageRanges = []) {
    if (ageRanges && ageRanges.length > 0) {
      ageRanges.forEach((range) => {
        this.params[`idade[${range}]`] = range;
      });
    }
    return this;
  }

  /**
   * Adicionar filtro de gênero
   * Formato do Catho: generoMasculino[true]=true ou generoFeminino[true]=true
   * @param {string} gender - 'M' (Masculino), 'F' (Feminino), 'ambos' (padrão)
   */
  setGender(gender = 'ambos') {
    if (gender === 'M') {
      this.params['generoMasculino[true]'] = 'true';
    } else if (gender === 'F') {
      this.params['generoFeminino[true]'] = 'true';
    }
    // Se 'ambos', não adiciona nenhum filtro
    return this;
  }

  /**
   * Adicionar filtros de área profissional
   * Formato do Catho: areap_id[ID]=ID
   * Exemplos de IDs: 51 (TI), 209 (Dev/Programação), 14 (Comercial/Vendas)
   * @param {Array<number>} areaIds - Array com IDs das áreas profissionais
   */
  setProfessionalAreas(areaIds = []) {
    if (areaIds && areaIds.length > 0) {
      areaIds.forEach((areaId) => {
        this.params[`areap_id[${areaId}]`] = areaId;
      });
    }
    return this;
  }

  /**
   * Adicionar filtros de nível hierárquico
   * Formato: nivelh_id[ID]=ID
   * IDs: 1=Estagiário, 2=Trainee, 3=Assistente/Auxiliar, 4=Analista, 5=Coordenador/Supervisor, 6=Gerente/Diretor
   * @param {Array<number>} levelIds - Array com IDs dos níveis
   */
  setHierarchicalLevels(levelIds = []) {
    if (levelIds && levelIds.length > 0) {
      levelIds.forEach((levelId) => {
        this.params[`nivelh_id[${levelId}]`] = levelId;
      });
    }
    return this;
  }

  /**
   * Filtrar por data de atualização do currículo
   * @param {number} days - Número de dias (1, 7, 15, 30, 60, 90)
   */
  setLastUpdated(days = 90) {
    if (days) {
      this.params.dataAtualizacao = days;
    }
    return this;
  }

  /**
   * Adicionar filtro de situação profissional
   * @param {string} situation - 'unemployed' ou 'employed'
   */
  setCandidateSituation(situation = 'indifferent') {
    if (!situation || situation === 'indifferent') {
      return this;
    }

    if (situation === 'unemployed') {
      this.params.empregado = 'false';
    } else if (situation === 'employed') {
      this.params.empregado = 'true';
    }
    return this;
  }

  /**
   * Adicionar filtro de estado
   * @param {number} estadoId - ID do estado
   */
  setEstado(estadoId) {
    if (estadoId) {
      delete this.params['estado_id[-1]'];
      this.params['estado_id[0]'] = estadoId;
    }
    return this;
  }

  /**
   * Adicionar filtro de cidade
   * @param {number} cidadeId - ID da cidade
   */
  setCidade(cidadeId) {
    if (cidadeId) {
      delete this.params['cidade_id[-1]'];
      this.params['cidade_id[0]'] = cidadeId;
    }
    return this;
  }

  /**
   * Definir número da página
   * @param {number} page - Número da página
   */
  setPage(page = 1) {
    this.params.page = page;
    return this;
  }

  /**
   * Construir a URL completa
   * @returns {string} URL com todos os parâmetros
   */
  build() {
    const queryString = Object.entries(this.params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return `https://www.catho.com.br/curriculos/busca/?${queryString}`;
  }

  /**
   * Obter apenas os parâmetros (sem a URL base)
   * @returns {Object} Objeto com os parâmetros
   */
  getParams() {
    return { ...this.params };
  }
}

// Constantes úteis para os filtros
export const IDADE_RANGES = {
  '18_20': 1,
  '21_25': 2,
  '26_30': 3,
  '31_40': 4,
  '41_50': 5,
  '50_PLUS': 6
};

export const GENDER = {
  MASCULINO: 'M',
  FEMININO: 'F',
  AMBOS: 'ambos'
};

// IDs das faixas salariais do Catho
export const SALARY_RANGES = {
  ATE_1K: 1,
  '1K_2K': 2,
  '2K_3K': 3,
  '3K_4K': 4,
  '4K_5K': 5,
  '5K_6K': 6,
  '6K_7K': 7,
  '7K_8K': 8,
  '8K_10K': 9,
  '10K_12K': 10,
  '12K_15K': 11,
  '15K_20K': 12,
  'ACIMA_20K': 13
};

// Níveis hierárquicos
export const HIERARCHICAL_LEVELS = {
  ESTAGIARIO: 1,
  TRAINEE: 2,
  ASSISTENTE_AUXILIAR: 3,
  ANALISTA: 4,
  COORDENADOR_SUPERVISOR: 5,
  GERENTE_DIRETOR: 6
};

// Principais áreas profissionais do Catho
export const AREAS_PROFISSIONAIS = {
  ADMINISTRATIVA: 47,
  ADMINISTRATIVO_COMERCIAL: 1,
  ADMINISTRATIVO_OPERACIONAL: 3,
  ANALISE_SISTEMAS: 111,
  ARTES: 6,
  ARTES_GRAFICAS: 7,
  ATENDIMENTO_CLIENTE: 8,
  AUTOMACAO_INDUSTRIAL: 9,
  BANCARIA: 11,
  BIBLIOTECONOMIA: 12,
  BIOLOGIA: 1943,
  BIOTECNOLOGIA: 13,
  CIENCIA_COMPUTACAO: 113,
  COMERCIAL_VENDAS: 14,
  COMERCIO_EXTERIOR: 15,
  COMUNICACAO_VISUAL: 158,
  CONTABILIDADE: 19,
  DEPARTAMENTO_PESSOAL: 20,
  DESENHO_INDUSTRIAL: 21,
  DESENVOLVIMENTO_PROGRAMACAO: 209,
  DIGITADOR: 1498,
  ECONOMIA: 23,
  EDUCACAO_ENSINO: 24,
  ENERGIA: 25,
  ENFERMAGEM: 26,
  ENGENHARIA_SISTEMAS: 125,
  ENGENHARIA_CIVIL: 18,
  ENGENHARIA_PRODUCAO: 32,
  ENGENHARIA_ELETRICA: 34,
  ENGENHARIA_MECANICA: 35,
  ENGENHARIA_OUTROS: 38,
  ESTATISTICA: 40,
  FARMACIA: 43,
  FINANCEIRA_ADMINISTRATIVA: 2,
  HOTELARIA_TURISMO: 48,
  INDUSTRIAL: 50,
  INFORMATICA_TI: 51,
  INTERNET_ECOMMERCE: 52,
  JORNALISMO: 53,
  JURIDICA: 54,
  LOGISTICA: 1956,
  LOGISTICA_SUPRIMENTOS: 55,
  MANUTENCAO: 56,
  MARKETING: 57,
  MEDICO_HOSPITALAR: 58,
  MEIO_AMBIENTE: 31,
  MODA: 60,
  OUTROS: 1929,
  PROCESSAMENTO_DADOS: 141,
  PSICOLOGIA: 176,
  PSICOLOGIA_CLINICA: 65,
  PUBLICIDADE_PROPAGANDA: 66,
  QUALIDADE: 67,
  RECURSOS_HUMANOS: 68,
  SEGURANCA_TRABALHO: 70,
  SERVICO_SOCIAL: 71,
  SUPORTE_TECNICO: 212,
  TELECOMUNICACOES: 75,
  VENDAS: 14
};

// Data de atualização (em dias)
export const LAST_UPDATED_OPTIONS = {
  '1_DIA': 1,
  '7_DIAS': 7,
  '15_DIAS': 15,
  '30_DIAS': 30,
  '60_DIAS': 60,
  '90_DIAS': 90,
  '180_DIAS': 180,
  '365_DIAS': 365,
  '548_DIAS': 548,
  '730_DIAS': 730
};
