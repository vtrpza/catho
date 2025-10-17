# 🎯 Exemplos Práticos de Uso dos Filtros

Baseado na estrutura REAL da URL do Catho.com.br

## 📋 Estrutura da API

```bash
POST /api/scrape
Content-Type: application/json
```

## 🔥 Exemplos Práticos

### 1. Busca Básica - Desenvolvedor Frontend

```json
{
  "query": "Desenvolvedor Frontend",
  "maxPages": 5,
  "delay": 2000
}
```

### 2. Dev Júnior - Faixa Salarial Baixa

```json
{
  "query": "Desenvolvedor Junior",
  "maxPages": 5,
  "delay": 2000,
  "salaryRanges": [2, 3, 4],
  "ageRanges": [1, 2, 3],
  "hierarchicalLevels": [1, 2, 3],
  "professionalAreas": [209, 51, 113],
  "lastUpdated": 30
}
```

**Explicação:**
- `salaryRanges: [2, 3, 4]` = R$ 1k-2k, R$ 2k-3k, R$ 3k-4k
- `ageRanges: [1, 2, 3]` = 18-30 anos
- `hierarchicalLevels: [1, 2, 3]` = Estagiário, Trainee, Assistente
- `professionalAreas: [209, 51, 113]` = Dev/Programação, TI, Ciência da Computação
- `lastUpdated: 30` = Atualizados nos últimos 30 dias

### 3. Dev Pleno/Sênior - Alta Performance

```json
{
  "query": "Desenvolvedor Full Stack",
  "maxPages": 10,
  "delay": 2000,
  "salaryRanges": [9, 10, 11, 12],
  "ageRanges": [3, 4, 5],
  "hierarchicalLevels": [4, 5],
  "professionalAreas": [209, 51, 111, 113, 125],
  "lastUpdated": 15
}
```

**Explicação:**
- `salaryRanges: [9, 10, 11, 12]` = R$ 8k-20k
- `ageRanges: [3, 4, 5]` = 26-50 anos
- `hierarchicalLevels: [4, 5]` = Analista, Coordenador
- `professionalAreas: [209, 51, 111, 113, 125]` = Dev, TI, Análise de Sistemas, Ciência da Computação, Eng. Sistemas
- `lastUpdated: 15` = Atualizados nos últimos 15 dias

### 4. Tech Lead / Arquiteto - Top 10%

```json
{
  "query": "Arquiteto de Software",
  "maxPages": 10,
  "delay": 3000,
  "salaryRanges": [12, 13],
  "ageRanges": [4, 5, 6],
  "hierarchicalLevels": [5, 6],
  "professionalAreas": [209, 111, 113, 125],
  "lastUpdated": 7
}
```

**Explicação:**
- `salaryRanges: [12, 13]` = R$ 15k-20k+
- `ageRanges: [4, 5, 6]` = 31+ anos
- `hierarchicalLevels: [5, 6]` = Coordenador, Gerente/Diretor
- `lastUpdated: 7` = Atualizados na última semana

### 5. Vendedores - Foco em Comércio

```json
{
  "query": "Vendedor Externo",
  "maxPages": 5,
  "delay": 2000,
  "salaryRanges": [4, 5, 6, 7],
  "ageRanges": [2, 3, 4],
  "professionalAreas": [14, 1],
  "hierarchicalLevels": [3, 4],
  "lastUpdated": 30
}
```

**Explicação:**
- `salaryRanges: [4, 5, 6, 7]` = R$ 3k-7k
- `professionalAreas: [14, 1]` = Comercial/Vendas, Administrativo Comercial

### 6. Recursos Humanos - Experiência Média

```json
{
  "query": "Analista de RH",
  "maxPages": 7,
  "delay": 2000,
  "salaryRanges": [6, 7, 8, 9, 10],
  "ageRanges": [3, 4],
  "professionalAreas": [68, 20],
  "hierarchicalLevels": [4],
  "gender": "ambos",
  "lastUpdated": 30
}
```

**Explicação:**
- `professionalAreas: [68, 20]` = Recursos Humanos, Departamento Pessoal
- `hierarchicalLevels: [4]` = Analista
- `gender: "ambos"` = Masculino e Feminino

### 7. Engenheiros - Várias Áreas

```json
{
  "query": "Engenheiro",
  "maxPages": 10,
  "delay": 2000,
  "salaryRanges": [10, 11, 12, 13],
  "ageRanges": [3, 4, 5],
  "professionalAreas": [18, 32, 34, 35, 125],
  "hierarchicalLevels": [4, 5, 6],
  "lastUpdated": 30
}
```

**Explicação:**
- `professionalAreas: [18, 32, 34, 35, 125]` = Civil, Produção, Elétrica, Mecânica, Sistemas

### 8. Estagiários e Trainees - Entrada no Mercado

```json
{
  "query": "Estagiário Programação",
  "maxPages": 5,
  "delay": 2000,
  "salaryRanges": [1, 2, 3],
  "ageRanges": [1, 2],
  "professionalAreas": [209, 51, 113],
  "hierarchicalLevels": [1, 2],
  "lastUpdated": 15
}
```

### 9. Marketing Digital - Foco em E-commerce

```json
{
  "query": "Marketing Digital",
  "maxPages": 5,
  "delay": 2000,
  "salaryRanges": [5, 6, 7, 8, 9],
  "ageRanges": [2, 3, 4],
  "professionalAreas": [57, 52, 66],
  "hierarchicalLevels": [3, 4, 5],
  "lastUpdated": 30
}
```

**Explicação:**
- `professionalAreas: [57, 52, 66]` = Marketing, Internet/E-Commerce, Publicidade

### 10. Busca Ampla - Máximo de Resultados

```json
{
  "query": "Desenvolvedor",
  "maxPages": 20,
  "delay": 3000,
  "ageRanges": [1, 2, 3, 4, 5, 6],
  "professionalAreas": [209, 51, 111, 113, 125, 141, 212],
  "lastUpdated": 90
}
```

**Explicação:**
- Todas as idades
- Todas as áreas relacionadas a TI
- Currículos atualizados nos últimos 90 dias
- Sem filtro salarial (pega todos)

## 📊 Tabela de Referência Rápida

### Faixas Salariais (salaryRanges)

| ID | Faixa |
|----|-------|
| 1  | Até R$ 1.000 |
| 2  | R$ 1.000 - R$ 2.000 |
| 3  | R$ 2.000 - R$ 3.000 |
| 4  | R$ 3.000 - R$ 4.000 |
| 5  | R$ 4.000 - R$ 5.000 |
| 6  | R$ 5.000 - R$ 6.000 |
| 7  | R$ 6.000 - R$ 7.000 |
| 8  | R$ 7.000 - R$ 8.000 |
| 9  | R$ 8.000 - R$ 10.000 |
| 10 | R$ 10.000 - R$ 12.000 |
| 11 | R$ 12.000 - R$ 15.000 |
| 12 | R$ 15.000 - R$ 20.000 |
| 13 | Acima de R$ 20.000 |

### Faixas Etárias (ageRanges)

| ID | Faixa |
|----|-------|
| 1  | 18-20 anos |
| 2  | 21-25 anos |
| 3  | 26-30 anos |
| 4  | 31-40 anos |
| 5  | 41-50 anos |
| 6  | Acima de 50 anos |

### Níveis Hierárquicos (hierarchicalLevels)

| ID | Nível |
|----|-------|
| 1  | Estagiário |
| 2  | Trainee |
| 3  | Assistente/Auxiliar |
| 4  | Analista |
| 5  | Coordenador/Supervisor |
| 6  | Gerente/Diretor |

### Gênero (gender)

- `"M"` - Masculino
- `"F"` - Feminino
- `"ambos"` - Ambos (padrão)

### Atualização (lastUpdated)

- `1` - 1 dia
- `7` - 7 dias (1 semana)
- `15` - 15 dias
- `30` - 30 dias (1 mês)
- `60` - 60 dias (2 meses)
- `90` - 90 dias (3 meses)

### Principais Áreas de TI (professionalAreas)

| ID | Área |
|----|------|
| 51 | Informática/TI |
| 111 | Análise de Sistemas |
| 113 | Ciência da Computação |
| 125 | Engenharia de Sistemas |
| 141 | Processamento de Dados |
| 209 | Desenvolvimento/Programação |
| 212 | Suporte Técnico |
| 52 | Internet/E-Commerce |

## 💡 Dicas Profissionais

### 1. Segmentação por Senioridade

**Júnior:**
```json
{
  "salaryRanges": [2, 3, 4],
  "ageRanges": [1, 2, 3],
  "hierarchicalLevels": [1, 2, 3]
}
```

**Pleno:**
```json
{
  "salaryRanges": [6, 7, 8, 9],
  "ageRanges": [3, 4],
  "hierarchicalLevels": [4]
}
```

**Sênior:**
```json
{
  "salaryRanges": [10, 11, 12, 13],
  "ageRanges": [4, 5, 6],
  "hierarchicalLevels": [5, 6]
}
```

### 2. Otimizando Delays

- **Busca rápida** (poucos resultados): `delay: 1500`
- **Busca normal**: `delay: 2000`
- **Busca segura** (muitas páginas): `delay: 3000`

### 3. Combinando Filtros para Máxima Eficácia

```json
{
  "query": "React Native Developer",
  "salaryRanges": [9, 10, 11],
  "ageRanges": [3, 4],
  "professionalAreas": [209, 51, 113],
  "hierarchicalLevels": [4, 5],
  "lastUpdated": 15
}
```

Isso busca desenvolvedores:
- Com conhecimento em React Native
- Ganhando R$ 8k-15k
- Entre 26-40 anos
- Em áreas de Dev/TI
- Analistas ou Coordenadores
- Atualizados nas últimas 2 semanas

---

**Última atualização**: 2025-10-16
