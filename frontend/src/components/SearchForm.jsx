import React, { useState } from 'react';

const SALARY_RANGES = [
  { id: 1, label: 'Ate R$ 1.000' },
  { id: 2, label: 'R$ 1.000 - R$ 2.000' },
  { id: 3, label: 'R$ 2.000 - R$ 3.000' },
  { id: 4, label: 'R$ 3.000 - R$ 4.000' },
  { id: 5, label: 'R$ 4.000 - R$ 5.000' },
  { id: 6, label: 'R$ 5.000 - R$ 6.000' },
  { id: 7, label: 'R$ 6.000 - R$ 7.000' },
  { id: 8, label: 'R$ 7.000 - R$ 8.000' },
  { id: 9, label: 'R$ 8.000 - R$ 10.000' },
  { id: 10, label: 'R$ 10.000 - R$ 12.000' },
  { id: 11, label: 'R$ 12.000 - R$ 15.000' },
  { id: 12, label: 'R$ 15.000 - R$ 20.000' },
  { id: 13, label: 'Acima de R$ 20.000' }
];

const AGE_RANGES = [
  { id: 1, label: '18-20 anos' },
  { id: 2, label: '21-25 anos' },
  { id: 3, label: '26-30 anos' },
  { id: 4, label: '31-40 anos' },
  { id: 5, label: '41-50 anos' },
  { id: 6, label: 'Acima de 50 anos' }
];

const HIERARCHICAL_LEVELS = [
  { id: 1, label: 'Estagiario' },
  { id: 2, label: 'Trainee' },
  { id: 3, label: 'Assistente/Auxiliar' },
  { id: 4, label: 'Analista' },
  { id: 5, label: 'Coordenador/Supervisor' },
  { id: 6, label: 'Gerente/Diretor' }
];

const PROFESSIONAL_AREAS = [
  { id: 209, label: 'Desenvolvimento/Programacao', popular: true },
  { id: 51, label: 'Informatica/TI', popular: true },
  { id: 111, label: 'Analise de Sistemas', popular: true },
  { id: 113, label: 'Ciencia da Computacao' },
  { id: 125, label: 'Engenharia de Sistemas' },
  { id: 212, label: 'Suporte Tecnico' },
  { id: 14, label: 'Comercial/Vendas', popular: true },
  { id: 57, label: 'Marketing' },
  { id: 68, label: 'Recursos Humanos' },
  { id: 19, label: 'Contabilidade' },
  { id: 2, label: 'Financeira/Administrativa' },
  { id: 18, label: 'Engenharia Civil' },
  { id: 32, label: 'Engenharia de Producao' },
  { id: 34, label: 'Engenharia Eletrica' },
  { id: 35, label: 'Engenharia Mecanica' },
  { id: 54, label: 'Juridica' },
  { id: 55, label: 'Logistica/Suprimentos' },
  { id: 8, label: 'Atendimento ao Cliente' }
];

const EDUCATION_LEVELS = [
  { id: 'medio_profissionalizante', label: 'Ensino medio profissionalizante' },
  { id: 'outro', label: 'Outro' }
];

const CANDIDATE_SITUATIONS = [
  { id: 'indifferent', label: 'Indiferente' },
  { id: 'unemployed', label: 'Desempregado' }
];

const DISABILITY_OPTIONS = [
  { id: 'indifferent', label: 'Indiferente' },
  { id: 'with_disability', label: 'Com deficiencia' },
  { id: 'without_disability', label: 'Sem deficiencia' }
];

const LAST_UPDATED_OPTIONS = [
  { value: 'indifferent', label: 'Indiferente' },
  { value: 1, label: '1 dia' },
  { value: 7, label: '7 dias' },
  { value: 15, label: '15 dias' },
  { value: 30, label: 'Ate 1 mes' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
  { value: 180, label: 'Ate 6 meses' },
  { value: 365, label: 'Ate 1 ano' },
  { value: 548, label: 'Ate 1 ano e 6 meses' },
  { value: 730, label: 'Ate 2 anos' }
];

export default function SearchForm({ onSearch, isLoading }) {
  const [query, setQuery] = useState('');
  const [maxPages, setMaxPages] = useState(5);
  const [delay, setDelay] = useState(2000);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [salaryRanges, setSalaryRanges] = useState([]);
  const [ageRanges, setAgeRanges] = useState([]);
  const [gender, setGender] = useState('ambos');
  const [professionalAreas, setProfessionalAreas] = useState([]);
  const [hierarchicalLevels, setHierarchicalLevels] = useState([]);
  const [educationLevels, setEducationLevels] = useState([]);
  const [candidateSituation, setCandidateSituation] = useState('indifferent');
  const [disabilityStatus, setDisabilityStatus] = useState('indifferent');
  const [lastUpdated, setLastUpdated] = useState('indifferent');

  const [enableParallel, setEnableParallel] = useState(true);
  const [concurrency, setConcurrency] = useState(3);

  const toggleCheckbox = (value, list, setter) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else {
      setter([...list, value]);
    }
  };

  const buildSearchParams = () => {
    const params = {
      query: query.trim(),
      maxPages,
      delay,
      enableParallel,
      concurrency
    };

    if (salaryRanges.length > 0) params.salaryRanges = salaryRanges;
    if (ageRanges.length > 0) params.ageRanges = ageRanges;
    if (gender !== 'ambos') params.gender = gender;
    if (professionalAreas.length > 0) params.professionalAreas = professionalAreas;
    if (hierarchicalLevels.length > 0) params.hierarchicalLevels = hierarchicalLevels;
    if (educationLevels.length > 0) params.educationLevels = educationLevels;
    if (candidateSituation !== 'indifferent') params.candidateSituation = candidateSituation;
    if (disabilityStatus !== 'indifferent') params.disabilityStatus = disabilityStatus;
    if (lastUpdated !== 'indifferent') params.lastUpdated = parseInt(lastUpdated, 10);

    return params;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    const searchParams = buildSearchParams();
    onSearch(searchParams);
  };

  const clearFilters = () => {
    setSalaryRanges([]);
    setAgeRanges([]);
    setGender('ambos');
    setProfessionalAreas([]);
    setHierarchicalLevels([]);
    setEducationLevels([]);
    setCandidateSituation('indifferent');
    setDisabilityStatus('indifferent');
    setLastUpdated('indifferent');
  };

  const activeFiltersCount =
    salaryRanges.length +
    ageRanges.length +
    (gender !== 'ambos' ? 1 : 0) +
    professionalAreas.length +
    hierarchicalLevels.length +
    educationLevels.length +
    (candidateSituation !== 'indifferent' ? 1 : 0) +
    (disabilityStatus !== 'indifferent' ? 1 : 0) +
    (lastUpdated !== 'indifferent' ? 1 : 0);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Nova busca de curriculos</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
            Cargo ou palavra-chave
          </label>
          <input
            type="text"
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Desenvolvedor Frontend, Analista de Dados..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxPages" className="block text-sm font-medium text-gray-700 mb-2">
              Numero de paginas
            </label>
            <input
              type="number"
              id="maxPages"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value, 10) || 1)}
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Sem limite - colete quantas paginas precisar
            </p>
          </div>

          <div>
            <label htmlFor="delay" className="block text-sm font-medium text-gray-700 mb-2">
              Intervalo (ms)
            </label>
            <input
              type="number"
              id="delay"
              value={delay}
              onChange={(e) => setDelay(parseInt(e.target.value, 10) || 1000)}
              min="1000"
              max="10000"
              step="500"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            disabled={isLoading}
          >
            <span className="font-medium text-gray-700">
              Filtros avancados {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </span>
            <span>{showAdvanced ? '-' : '+'}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-gray-700">Refinar busca</h3>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pretensao salarial</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {SALARY_RANGES.map((range) => (
                  <label key={range.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={salaryRanges.includes(range.id)}
                      onChange={() => toggleCheckbox(range.id, salaryRanges, setSalaryRanges)}
                      className="rounded text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{range.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Faixa etaria</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {AGE_RANGES.map((range) => (
                  <label key={range.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ageRanges.includes(range.id)}
                      onChange={() => toggleCheckbox(range.id, ageRanges, setAgeRanges)}
                      className="rounded text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{range.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Genero</label>
              <div className="flex space-x-4">
                {['ambos', 'M', 'F'].map((option) => (
                  <label key={option} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="gender"
                      value={option}
                      checked={gender === option}
                      onChange={(e) => setGender(e.target.value)}
                      className="text-primary-600"
                      disabled={isLoading}
                    />
                    <span className="text-sm">
                      {option === 'ambos' ? 'Ambos' : option === 'M' ? 'Masculino' : 'Feminino'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nivel hierarquico</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {HIERARCHICAL_LEVELS.map((level) => (
                  <label key={level.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hierarchicalLevels.includes(level.id)}
                      onChange={() => toggleCheckbox(level.id, hierarchicalLevels, setHierarchicalLevels)}
                      className="rounded text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{level.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Escolaridade</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {EDUCATION_LEVELS.map((level) => (
                  <label key={level.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={educationLevels.includes(level.id)}
                      onChange={() => toggleCheckbox(level.id, educationLevels, setEducationLevels)}
                      className="rounded text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{level.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Area profissional</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {PROFESSIONAL_AREAS.map((area) => (
                  <label key={area.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={professionalAreas.includes(area.id)}
                      onChange={() => toggleCheckbox(area.id, professionalAreas, setProfessionalAreas)}
                      className="rounded text-primary-600"
                      disabled={isLoading}
                    />
                    <span>
                      {area.label} {area.popular && '*'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="lastUpdated" className="block text-sm font-medium text-gray-700 mb-2">
                Atualizado nos ultimos
              </label>
              <select
                id="lastUpdated"
                value={lastUpdated}
                onChange={(e) => setLastUpdated(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                disabled={isLoading}
              >
                {LAST_UPDATED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Situacao do candidato</label>
              <div className="flex space-x-4">
                {CANDIDATE_SITUATIONS.map((option) => (
                  <label key={option.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="radio"
                      name="candidateSituation"
                      value={option.id}
                      checked={candidateSituation === option.id}
                      onChange={(e) => setCandidateSituation(e.target.value)}
                      className="text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Deficiencia</label>
              <div className="flex space-x-4">
                {DISABILITY_OPTIONS.map((option) => (
                  <label key={option.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="radio"
                      name="disabilityStatus"
                      value={option.id}
                      checked={disabilityStatus === option.id}
                      onChange={(e) => setDisabilityStatus(e.target.value)}
                      className="text-primary-600"
                      disabled={isLoading}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-300 pt-4 mt-4">
              <h4 className="font-semibold text-gray-700 mb-3">Configuracoes de performance</h4>

              <div className="mb-3">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enableParallel}
                    onChange={(e) => setEnableParallel(e.target.checked)}
                    className="rounded text-primary-600 h-5 w-5"
                    disabled={isLoading}
                  />
                  <div>
                    <span className="font-medium text-gray-700">Processamento paralelo</span>
                    <p className="text-xs text-gray-500">
                      Ate 5x mais rapido (analisa varios perfis ao mesmo tempo)
                    </p>
                  </div>
                </label>
              </div>

              {enableParallel && (
                <div>
                  <label htmlFor="concurrency" className="block text-sm font-medium text-gray-700 mb-2">
                    Numero de workers paralelos
                  </label>
                  <select
                    id="concurrency"
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    disabled={isLoading}
                  >
                    <option value={2}>2 workers (conservador)</option>
                    <option value={3}>3 workers (recomendado)</option>
                    <option value={4}>4 workers (rapido)</option>
                    <option value={5}>5 workers (muito rapido)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Mais workers = mais rapido, mas aumenta o risco de bloqueio
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3">
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className={`w-full md:w-auto px-6 py-3 rounded-md font-semibold text-white transition-colors ${
              isLoading || !query.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Coletando...
              </span>
            ) : (
              `Iniciar busca${activeFiltersCount > 0 ? ` (${activeFiltersCount} filtros)` : ''}`
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
