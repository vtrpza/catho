import { getDatabase } from '../config/database.js';
import XLSX from 'xlsx';

export class ResumeService {
  async getAllResumes(options = {}) {
    const db = getDatabase();
    const {
      page = 1,
      limit = 20,
      search = '',
      searchQuery = '',
      sessionId = '',
      includeRelated = false
    } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM resumes WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR job_title LIKE ? OR location LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (searchQuery) {
      query += ' AND search_query = ?';
      params.push(searchQuery);
    }

    if (sessionId) {
      query += ' AND session_id = ?';
      params.push(sessionId);
    }

    query += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    let resumes = await db.all(query, params);

    // Enriquecer com dados relacionados se solicitado
    if (includeRelated) {
      resumes = await Promise.all(
        resumes.map(resume => this.enrichResumeWithRelatedData(resume))
      );
    }

    // Contar total
    let countQuery = 'SELECT COUNT(*) as total FROM resumes WHERE 1=1';
    const countParams = [];

    if (search) {
      countQuery += ' AND (name LIKE ? OR job_title LIKE ? OR location LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (searchQuery) {
      countQuery += ' AND search_query = ?';
      countParams.push(searchQuery);
    }

    if (sessionId) {
      countQuery += ' AND session_id = ?';
      countParams.push(sessionId);
    }

    const { total } = await db.get(countQuery, countParams);

    return {
      resumes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getResumeById(id, includeRelated = true) {
    const db = getDatabase();
    const resume = await db.get('SELECT * FROM resumes WHERE id = ?', [id]);

    if (!resume) return null;

    if (includeRelated && resume.full_profile_scraped) {
      // Buscar dados relacionados
      resume.work_experiences = await db.all(
        'SELECT * FROM work_experiences WHERE resume_id = ? ORDER BY display_order',
        [id]
      );

      resume.education = await db.all(
        'SELECT * FROM education WHERE resume_id = ? ORDER BY display_order',
        [id]
      );

      resume.courses = await db.all(
        'SELECT * FROM courses WHERE resume_id = ? ORDER BY display_order',
        [id]
      );

      resume.languages = await db.all(
        'SELECT * FROM languages WHERE resume_id = ?',
        [id]
      );

      resume.skills = await db.all(
        'SELECT * FROM skills WHERE resume_id = ?',
        [id]
      );
    }

    return resume;
  }

  async enrichResumeWithRelatedData(resume) {
    const db = getDatabase();

    if (!resume || !resume.full_profile_scraped) {
      return resume;
    }

    // Buscar dados relacionados
    resume.work_experiences = await db.all(
      'SELECT * FROM work_experiences WHERE resume_id = ? ORDER BY display_order',
      [resume.id]
    );

    resume.education = await db.all(
      'SELECT * FROM education WHERE resume_id = ? ORDER BY display_order',
      [resume.id]
    );

    resume.courses = await db.all(
      'SELECT * FROM courses WHERE resume_id = ? ORDER BY display_order',
      [resume.id]
    );

    resume.languages = await db.all(
      'SELECT * FROM languages WHERE resume_id = ?',
      [resume.id]
    );

    resume.skills = await db.all(
      'SELECT * FROM skills WHERE resume_id = ?',
      [resume.id]
    );

    return resume;
  }

  async deleteResume(id) {
    const db = getDatabase();
    const result = await db.run('DELETE FROM resumes WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async clearAllData() {
    const db = getDatabase();

    try {
      // Delete from all tables (CASCADE will handle related tables automatically)
      await db.run('DELETE FROM resumes');

      // Reset autoincrement counters
      await db.run('DELETE FROM sqlite_sequence WHERE name="resumes"');
      await db.run('DELETE FROM sqlite_sequence WHERE name="work_experiences"');
      await db.run('DELETE FROM sqlite_sequence WHERE name="education"');
      await db.run('DELETE FROM sqlite_sequence WHERE name="courses"');
      await db.run('DELETE FROM sqlite_sequence WHERE name="languages"');
      await db.run('DELETE FROM sqlite_sequence WHERE name="skills"');

      // Get counts to confirm
      const counts = {
        resumes: (await db.get('SELECT COUNT(*) as count FROM resumes')).count,
        work_experiences: (await db.get('SELECT COUNT(*) as count FROM work_experiences')).count,
        education: (await db.get('SELECT COUNT(*) as count FROM education')).count,
        courses: (await db.get('SELECT COUNT(*) as count FROM courses')).count,
        languages: (await db.get('SELECT COUNT(*) as count FROM languages')).count,
        skills: (await db.get('SELECT COUNT(*) as count FROM skills')).count
      };

      return { success: true, counts };

    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  async getStatistics() {
    const db = getDatabase();

    const stats = await db.get(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT search_query) as unique_searches,
        COUNT(DISTINCT location) as unique_locations
      FROM resumes
    `);

    const recentSearches = await db.all(`
      SELECT search_query, COUNT(*) as count, MAX(scraped_at) as last_scraped
      FROM resumes
      WHERE search_query IS NOT NULL
      GROUP BY search_query
      ORDER BY last_scraped DESC
      LIMIT 10
    `);

    return {
      ...stats,
      recentSearches
    };
  }

  async exportResumes(format = 'json', filters = {}) {
    const db = getDatabase();

    let query = 'SELECT * FROM resumes';
    const params = [];

    if (filters.searchQuery) {
      query += ' WHERE search_query = ?';
      params.push(filters.searchQuery);
    }

    query += ' ORDER BY scraped_at DESC';

    let resumes = await db.all(query, params);

    // Enriquecer com dados relacionados para todos os formatos
    resumes = await Promise.all(
      resumes.map(resume => this.enrichResumeWithRelatedData(resume))
    );

    if (format === 'json') {
      return JSON.stringify(resumes, null, 2);
    }

    if (format === 'xlsx') {
      return this.convertToXLSX(resumes);
    }

    throw new Error('Formato não suportado');
  }

  convertToXLSX(resumes) {
    if (resumes.length === 0) {
      // Return empty workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['Nenhum currículo encontrado']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Currículos');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    const workbook = XLSX.utils.book_new();

    // Aba 1: Dados principais dos currículos
    const mainData = resumes.map(r => ({
      'ID': r.id,
      'Nome': r.name || '',
      'Idade': r.age || '',
      'Gênero': r.gender || '',
      'Estado Civil': r.marital_status || '',
      'Cidade': r.city || '',
      'Estado': r.state || '',
      'Bairro': r.neighborhood || '',
      'Endereço': r.address || '',
      'CEP': r.zip_code || '',
      'País': r.country || '',
      'Cargo Interesse': r.career_objective || r.job_title || '',
      'Qualificações': r.qualifications || '',
      'Pretensão Salarial': r.salary_expectation || '',
      'Email': r.contact_email || '',
      'Telefone': r.contact_phone || '',
      'URL Perfil': r.profile_url || '',
      'Última Atualização': r.last_updated || '',
      'Coletado em': r.scraped_at || '',
      'Busca': r.search_query || '',
      'Perfil Completo': r.full_profile_scraped ? 'Sim' : 'Não'
    }));

    const mainSheet = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(workbook, mainSheet, 'Currículos');

    // Aba 2: Experiências Profissionais
    const experiences = [];
    resumes.forEach(r => {
      if (r.work_experiences && r.work_experiences.length > 0) {
        r.work_experiences.forEach(exp => {
          experiences.push({
            'ID Currículo': r.id,
            'Nome': r.name,
            'Empresa': exp.company || '',
            'Cargo': exp.position || '',
            'Data Início': exp.start_date || '',
            'Data Fim': exp.end_date || '',
            'Duração': exp.duration || '',
            'Último Salário': exp.last_salary || '',
            'Atividades': exp.activities || '',
            'Atual': exp.is_current ? 'Sim' : 'Não'
          });
        });
      }
    });

    if (experiences.length > 0) {
      const expSheet = XLSX.utils.json_to_sheet(experiences);
      XLSX.utils.book_append_sheet(workbook, expSheet, 'Experiências');
    }

    // Aba 3: Formação Acadêmica
    const education = [];
    resumes.forEach(r => {
      if (r.education && r.education.length > 0) {
        r.education.forEach(edu => {
          education.push({
            'ID Currículo': r.id,
            'Nome': r.name,
            'Tipo': edu.degree_type || '',
            'Curso': edu.course || '',
            'Instituição': edu.institution || '',
            'Data Início': edu.start_date || '',
            'Data Fim': edu.end_date || '',
            'Status': edu.status || ''
          });
        });
      }
    });

    if (education.length > 0) {
      const eduSheet = XLSX.utils.json_to_sheet(education);
      XLSX.utils.book_append_sheet(workbook, eduSheet, 'Formação');
    }

    // Aba 4: Cursos e Certificações
    const courses = [];
    resumes.forEach(r => {
      if (r.courses && r.courses.length > 0) {
        r.courses.forEach(course => {
          courses.push({
            'ID Currículo': r.id,
            'Nome': r.name,
            'Curso': course.course_name || '',
            'Instituição': course.institution || '',
            'Duração': course.duration || '',
            'Ano Conclusão': course.completion_year || ''
          });
        });
      }
    });

    if (courses.length > 0) {
      const coursesSheet = XLSX.utils.json_to_sheet(courses);
      XLSX.utils.book_append_sheet(workbook, coursesSheet, 'Cursos');
    }

    // Aba 5: Idiomas
    const languages = [];
    resumes.forEach(r => {
      if (r.languages && r.languages.length > 0) {
        r.languages.forEach(lang => {
          languages.push({
            'ID Currículo': r.id,
            'Nome': r.name,
            'Idioma': lang.language || '',
            'Proficiência': lang.proficiency || ''
          });
        });
      }
    });

    if (languages.length > 0) {
      const langSheet = XLSX.utils.json_to_sheet(languages);
      XLSX.utils.book_append_sheet(workbook, langSheet, 'Idiomas');
    }

    // Aba 6: Habilidades
    const skills = [];
    resumes.forEach(r => {
      if (r.skills && r.skills.length > 0) {
        r.skills.forEach(skill => {
          skills.push({
            'ID Currículo': r.id,
            'Nome': r.name,
            'Habilidade': skill.skill_name || '',
            'Categoria': skill.category || ''
          });
        });
      }
    });

    if (skills.length > 0) {
      const skillsSheet = XLSX.utils.json_to_sheet(skills);
      XLSX.utils.book_append_sheet(workbook, skillsSheet, 'Habilidades');
    }

    // Gerar buffer XLSX
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
