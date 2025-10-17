# Enhanced Profile Scraping - Implementation Guide

## Overview

The Catho Collector has been upgraded from basic list scraping to **deep profile scraping**, collecting 10x more data per candidate including:

- ✅ **Personal Information**: Age, DOB, gender, marital status, full address
- ✅ **Career Details**: Objectives, qualifications, salary expectations
- ✅ **Work History**: Complete timeline with companies, positions, dates, activities, salaries
- ✅ **Education**: Degrees, institutions, dates
- ✅ **Certifications**: Courses, institutions, durations, completion years
- ✅ **Languages**: With proficiency levels (Básico, Intermediário, Avançado, Fluente)
- ✅ **Skills**: Extracted from additional information section

## Database Schema

### Main Table: `resumes`
**New Fields:**
```sql
-- Personal Data
age INTEGER
date_of_birth TEXT
gender TEXT
marital_status TEXT
address TEXT
neighborhood TEXT
city TEXT
state TEXT
zip_code TEXT
country TEXT

-- Career Information
career_objective TEXT
qualifications TEXT
salary_expectation TEXT
additional_info TEXT

-- Control Flags
full_profile_scraped BOOLEAN
profile_scrape_error TEXT
```

### Related Tables

#### `work_experiences`
```sql
id INTEGER PRIMARY KEY
resume_id INTEGER (FK)
company TEXT
position TEXT
start_date TEXT (MM/YYYY)
end_date TEXT (MM/YYYY or "Atual")
duration TEXT
last_salary TEXT
activities TEXT
is_current BOOLEAN
display_order INTEGER
```

#### `education`
```sql
id INTEGER PRIMARY KEY
resume_id INTEGER (FK)
degree_type TEXT (e.g., "Graduação", "Técnico")
course TEXT
institution TEXT
start_date TEXT
end_date TEXT
status TEXT
display_order INTEGER
```

#### `courses`
```sql
id INTEGER PRIMARY KEY
resume_id INTEGER (FK)
course_name TEXT
institution TEXT
duration TEXT (e.g., "Curta (até 40 horas)")
completion_year TEXT
display_order INTEGER
```

#### `languages`
```sql
id INTEGER PRIMARY KEY
resume_id INTEGER (FK)
language TEXT
proficiency TEXT (Básico, Intermediário, Avançado, Fluente)
```

#### `skills`
```sql
id INTEGER PRIMARY KEY
resume_id INTEGER (FK)
skill_name TEXT
category TEXT (e.g., "Linguagens de Programação")
```

## API Usage

### Get Resumes with Full Profile Data

```javascript
GET /api/resumes?includeRelated=true&page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "resumes": [
    {
      "id": 1,
      "name": "João Pedro Peixoto",
      "age": 29,
      "gender": "Masculino",
      "city": "São João de Meriti",
      "state": "RJ",
      "career_objective": "Desenvolvedor",
      "qualifications": "Sou um profissional da área de tecnologia...",
      "salary_expectation": "A partir de R$ 4.000,00",
      "full_profile_scraped": 1,

      "work_experiences": [
        {
          "company": "Autônomo/Freelance",
          "position": "Técnico em Instalação e Manutenção",
          "start_date": "01/2019",
          "end_date": "Atual",
          "duration": "6 anos e 9 meses",
          "activities": "Instalação e manutenção de SDAI...",
          "is_current": 1
        }
      ],

      "education": [
        {
          "degree_type": "Graduação",
          "course": "Engenharia de Telecomunicações",
          "institution": "CEFET/RJ",
          "start_date": "01/2019",
          "end_date": "09/2025"
        }
      ],

      "courses": [
        {
          "course_name": "Cybersecurity Essentials",
          "institution": "Cisco Networking Academy",
          "duration": "Curta (até 40 horas)",
          "completion_year": "2022"
        }
      ],

      "languages": [
        { "language": "Inglês", "proficiency": "Intermediário" },
        { "language": "Espanhol", "proficiency": "Básico" }
      ],

      "skills": [
        { "skill_name": "C", "category": "Linguagens de Programação" },
        { "skill_name": "Python", "category": "Linguagens de Programação" }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Get Single Resume with Full Details

```javascript
GET /api/resumes/:id
```

Returns a single resume with all related data automatically included if `full_profile_scraped` is true.

## Scraping Configuration

### Enable/Disable Full Profile Scraping

**Backend Configuration:**
```javascript
// In cathoScraper.scrape() options:
{
  scrapeFullProfiles: true,      // Enable deep scraping (default: true)
  profileDelay: 2500,             // Delay between profiles in ms (default: 2500)
  maxPages: 10,                   // Max pages to scrape
  delay: 2000                     // Delay between pages
}
```

### How It Works

1. **List Page Scraping**: Collects profile URLs from search results
2. **Profile Navigation**: For each URL, navigates to individual profile page
3. **Data Extraction**: Extracts all sections using page.evaluate()
4. **Database Storage**: Saves to main table + related tables
5. **Progress Tracking**: Logs "Profile X/Y" for monitoring

### Performance & Safety

- **Randomized Delays**: `profileDelay + random(0-1000ms)` to avoid detection
- **Error Handling**: Failed profiles don't stop the process
- **Retry Logic**: Profiles marked with `profile_scrape_error` can be re-scraped
- **Rate Limiting**: Configurable delays between profiles and pages

## Extraction Patterns

The scraper uses the following strategies to extract data:

### Personal Data
```javascript
// From "Dados Pessoais" section
const personalSection = document.querySelector('h2:contains("Dados Pessoais")').parentElement;
// Extract using regex patterns:
/Sexo:\s*([^\n]+)/i
/Estado Civil:\s*([^\n]+)/i
/Data de nascimento:\s*(\d{2}\/\d{2}\/\d{4})/i
// etc.
```

### Work Experience
```javascript
// Find "Experiência Profissional" section
// Loop through h3/h4 company names
// Extract from surrounding text:
/Cargo:\s*([^-\n]+)/i
/(\d{2}\/\d{4})\s*(?:até|-)?\s*(\d{2}\/\d{4}|Atual)/i
/Principais atividades:\s*([^\n]+)/i
```

### Education
```javascript
// Find "Formação" section
// Extract degree and course from title: "Graduação em Engenharia"
// Institution from next line
// Dates using pattern: /(\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{4})/i
```

### Languages
```javascript
// From "Idiomas" section
// Pattern: /([A-Za-zçãõáéíóú]+)\s+(Básico|Intermediário|Avançado|Fluente)/gi
```

### Skills
```javascript
// From "Informações Adicionais" section
// Extract patterns like:
/Linguagens de Programação:\s*([^\n]+)/i
// Split by commas/semicolons
```

## Progress Monitoring

### Console Output
```
📄 Processando página 1/10...
✓ Coletados 20 currículos desta página
📈 Total coletado até agora: 20

🔍 Iniciando coleta de perfis completos...
  📋 Perfil 1/20: João Pedro Peixoto
  📄 Acessando perfil: https://www.catho.com.br/curriculos/...
  ✓ Perfil extraído com sucesso
  ✅ Perfil salvo com sucesso
  ⏳ Aguardando 3s...

  📋 Perfil 2/20: Maria Silva
  ...
```

### Progress Object
```javascript
{
  status: 'running',      // 'idle' | 'running' | 'completed' | 'error'
  scraped: 45,            // Total resumes collected
  currentPage: 3,         // Current page number
  total: 150              // Total when completed
}
```

## Export with Full Data

The enhanced CSV export now includes additional columns:

```csv
ID,Nome,Idade,Gênero,Cidade,Estado,Cargo Interesse,Pretensão Salarial,Formação,Experiências,Idiomas,Habilidades,...
1,"João Pedro Peixoto",29,"Masculino","São João de Meriti","RJ","Desenvolvedor","A partir de R$ 4.000,00","Engenharia de Telecomunicações - CEFET/RJ","6 anos como Técnico","Inglês (Intermediário), Espanhol (Básico)","C, C++, Python, SQL",…
```

## Benefits

### For Recruiters
- ✅ Complete work history timeline
- ✅ Verified education and certifications
- ✅ Actual skills from candidate descriptions
- ✅ Salary expectations upfront
- ✅ Language proficiency levels
- ✅ Full contact information

### For Lead Qualification
- ✅ Filter by specific skills
- ✅ Match by education level
- ✅ Target by experience duration
- ✅ Sort by last updated profiles
- ✅ Identify current job seekers

### Data Quality
- ✅ Structured data in relational database
- ✅ Ordered work/education history
- ✅ Normalized language proficiency
- ✅ Categorized skills
- ✅ Error tracking per profile

## Troubleshooting

### Profile Scraping Fails

**Check:**
1. Is the profile URL accessible?
2. Is the HTML structure different? (Catho may update)
3. Are there authentication issues?
4. Is the delay too short causing blocks?

**Solution:**
```sql
-- Find profiles with errors
SELECT id, name, profile_url, profile_scrape_error
FROM resumes
WHERE profile_scrape_error IS NOT NULL;

-- Reset for retry
UPDATE resumes
SET full_profile_scraped = 0, profile_scrape_error = NULL
WHERE id = ?;
```

### Slow Scraping

**Optimize:**
- Increase `profileDelay` to 3000-5000ms if getting blocked
- Reduce `maxPages` to process fewer profiles per run
- Set `scrapeFullProfiles: false` to only collect basic list data

### Missing Data

Some profiles may not have all sections. The scraper gracefully handles:
- Missing work experience: `work_experiences` will be empty array
- No education: `education` will be empty array
- No languages listed: `languages` will be empty array

This is **normal** and not an error. Check `full_profile_scraped` flag:
- `1` = Profile was successfully scraped (even if some sections empty)
- `0` = Profile not yet scraped or scraping failed

## Next Steps

1. **Frontend Enhancement**: Update CandidateCard to show full profile data
2. **Advanced Filtering**: Add filters for skills, education level, experience years
3. **Profile Detail Modal**: Create full-screen profile viewer
4. **Re-scraping**: Add UI option to re-scrape specific profiles
5. **Analytics**: Add statistics on skills, education levels, salary ranges

---

**Last Updated**: 2025-10-16
**Version**: 2.0.0 - Enhanced Profile Scraping
