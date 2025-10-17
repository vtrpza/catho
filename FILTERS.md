# 🔍 Filtros Avançados - Catho Collector

Este documento lista todos os filtros disponíveis para refinar sua busca de currículos no Catho.

## 📋 Sumário

- [Pretensão Salarial](#pretensão-salarial)
- [Faixa Etária](#faixa-etária)
- [Sexo](#sexo)
- [Áreas Profissionais](#áreas-profissionais)
- [Exemplos de Uso](#exemplos-de-uso)

## 💰 Pretensão Salarial

Filtre candidatos por faixa salarial desejada.

### Parâmetros

- `salaryMin`: Salário mínimo (em Reais)
- `salaryMax`: Salário máximo (em Reais)

### Faixas Sugeridas

```javascript
{
  "ATE_1K": { min: 0, max: 1000 },
  "1K_2K": { min: 1000, max: 2000 },
  "2K_3K": { min: 2000, max: 3000 },
  "3K_4K": { min: 3000, max: 4000 },
  "4K_5K": { min: 4000, max: 5000 },
  "5K_7K": { min: 5000, max: 7000 },
  "7K_10K": { min: 7000, max: 10000 },
  "10K_15K": { min: 10000, max: 15000 },
  "15K_20K": { min: 15000, max: 20000 },
  "ACIMA_20K": { min: 20000, max: 99999 }
}
```

## 👥 Faixa Etária

Filtre candidatos por idade.

### Parâmetros

- `ageRanges`: Array de IDs das faixas etárias

### Valores Disponíveis

| ID | Faixa Etária |
|----|--------------|
| 1  | 18 a 20 anos |
| 2  | 21 a 25 anos |
| 3  | 26 a 30 anos |
| 4  | 31 a 40 anos |
| 5  | 41 a 50 anos |
| 6  | Acima de 50 anos |

### Exemplo

```javascript
ageRanges: [2, 3, 4]  // 21-40 anos
```

## ⚥ Sexo

Filtre candidatos por gênero.

### Parâmetros

- `gender`: String com o valor do gênero

### Valores Disponíveis

- `'M'` - Masculino
- `'F'` - Feminino
- `'ambos'` - Ambos (padrão)

## 💼 Áreas Profissionais

Filtre candidatos por área de atuação.

### Parâmetros

- `professionalAreas`: Array de IDs das áreas profissionais

### Principais Áreas

| ID | Área Profissional |
|----|-------------------|
| 47 | Administrativa |
| 1 | Administrativo Comercial |
| 3 | Administrativo/Operacional |
| 111 | Análise de Sistemas |
| 8 | Atendimento ao Cliente |
| 11 | Bancária |
| 13 | Biotecnologia/Biomédicas |
| 113 | Ciência da Computação |
| 14 | Comercial/Vendas |
| 15 | Comércio Exterior |
| 19 | Contabilidade |
| 20 | Departamento Pessoal |
| 209 | **Desenvolvimento/Programação** ⭐ |
| 24 | Educação/Ensino |
| 125 | Engenharia de Sistemas |
| 18 | Engenharia Civil |
| 32 | Engenharia de Produção |
| 34 | Engenharia Elétrica/Eletrônica |
| 35 | Engenharia Mecânica |
| 2 | Financeira/Administrativa |
| 51 | **Informática/TI** ⭐ |
| 52 | Internet/E-Commerce |
| 54 | Jurídica |
| 1956 | Logística |
| 55 | Logística/Suprimentos |
| 56 | Manutenção |
| 57 | Marketing |
| 58 | Médico/Hospitalar |
| 67 | Qualidade |
| 68 | Recursos Humanos |
| 70 | Segurança do Trabalho |
| 212 | Suporte Técnico |
| 75 | Telecomunicações |

## 📝 Exemplos de Uso

### Exemplo 1: Busca Simples

```bash
POST /api/scrape
Content-Type: application/json

{
  "query": "Desenvolvedor Frontend",
  "maxPages": 3,
  "delay": 2000
}
```

### Exemplo 2: Com Filtro de Salário

```bash
POST /api/scrape
Content-Type: application/json

{
  "query": "Desenvolvedor React",
  "maxPages": 5,
  "delay": 2000,
  "salaryMin": 5000,
  "salaryMax": 10000
}
```

### Exemplo 3: Filtros Múltiplos

```bash
POST /api/scrape
Content-Type: application/json

{
  "query": "Desenvolvedor Full Stack",
  "maxPages": 5,
  "delay": 2000,
  "salaryMin": 7000,
  "salaryMax": 15000,
  "ageRanges": [3, 4],
  "gender": "ambos",
  "professionalAreas": [209, 51, 113]
}
```

### Exemplo 4: Busca Específica para TI

```bash
POST /api/scrape
Content-Type: application/json

{
  "query": "Python Django",
  "maxPages": 10,
  "delay": 3000,
  "salaryMin": 8000,
  "salaryMax": 20000,
  "ageRanges": [3, 4, 5],
  "professionalAreas": [209, 51, 111, 113, 212]
}
```

## 🎯 Dicas de Uso

### 1. Combinar Filtros

Para resultados mais precisos, combine múltiplos filtros:

```javascript
{
  query: "Desenvolvedor Mobile",
  salaryMin: 6000,
  ageRanges: [2, 3, 4],  // 21-40 anos
  professionalAreas: [209, 51]  // Dev + TI
}
```

### 2. Área Profissional vs Query

- **Query**: Busca por palavra-chave no currículo completo
- **Área Profissional**: Filtra pela área cadastrada pelo candidato

**Recomendação**: Use ambos para melhores resultados!

```javascript
{
  query: "React Native",  // Busca a tecnologia
  professionalAreas: [209, 51]  // Filtra área de Dev/TI
}
```

### 3. Faixas Etárias Estratégicas

- **Júnior**: `[1, 2]` (18-25 anos)
- **Pleno**: `[2, 3, 4]` (21-40 anos)
- **Sênior**: `[4, 5, 6]` (31+ anos)

### 4. Salário + Experiência

Combine salário com idade para segmentar melhor:

```javascript
// Júnior
{ salaryMax: 4000, ageRanges: [1, 2] }

// Pleno
{ salaryMin: 5000, salaryMax: 10000, ageRanges: [3, 4] }

// Sênior
{ salaryMin: 10000, ageRanges: [4, 5, 6] }
```

## 🚀 Usando no Frontend

O frontend precisa enviar os filtros no corpo da requisição:

```javascript
const filters = {
  query: "Desenvolvedor Python",
  maxPages: 5,
  delay: 2000,
  salaryMin: 6000,
  salaryMax: 12000,
  ageRanges: [3, 4],  // 26-40 anos
  gender: "ambos",
  professionalAreas: [209, 51]  // Dev + TI
};

await scraperAPI.startScrape(filters.query, filters);
```

## 📊 Performance

- **Sem filtros**: ~20 currículos por página
- **Com filtros**: Pode variar bastante dependendo dos critérios
- **Recomendação**: Comece com filtros amplos e refine conforme necessário

## ⚠️ Observações

1. Nem todos os candidatos preenchem todas as informações
2. Filtros muito restritivos podem resultar em poucos ou nenhum resultado
3. O Catho pode ter limitações de busca (ex: máximo de resultados)
4. Use delays adequados (mínimo 2000ms) para evitar bloqueio

## 🔗 Referências

- Códigos extraídos da estrutura HTML do Catho.com.br
- IDs das áreas profissionais são os mesmos usados pelo Catho
- Valores de faixas etárias seguem o padrão do site

---

**Última atualização**: 2025-10-16
