import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('🔄 Iniciando migração do banco de dados...\n');

  const db = await open({
    filename: path.join(__dirname, '../../database.sqlite'),
    driver: sqlite3.Database
  });

  try {
    // Check if migration is needed
    const tableInfo = await db.all("PRAGMA table_info(resumes)");
    const hasNewColumns = tableInfo.some(col => col.name === 'full_profile_scraped');

    if (hasNewColumns) {
      console.log('✅ Banco de dados já está atualizado!\n');
      await db.close();
      return;
    }

    console.log('📝 Adicionando novas colunas à tabela resumes...');

    // Add new columns to resumes table
    await db.exec(`
      ALTER TABLE resumes ADD COLUMN age INTEGER;
      ALTER TABLE resumes ADD COLUMN date_of_birth TEXT;
      ALTER TABLE resumes ADD COLUMN gender TEXT;
      ALTER TABLE resumes ADD COLUMN marital_status TEXT;
      ALTER TABLE resumes ADD COLUMN address TEXT;
      ALTER TABLE resumes ADD COLUMN neighborhood TEXT;
      ALTER TABLE resumes ADD COLUMN city TEXT;
      ALTER TABLE resumes ADD COLUMN state TEXT;
      ALTER TABLE resumes ADD COLUMN zip_code TEXT;
      ALTER TABLE resumes ADD COLUMN country TEXT;
      ALTER TABLE resumes ADD COLUMN career_objective TEXT;
      ALTER TABLE resumes ADD COLUMN qualifications TEXT;
      ALTER TABLE resumes ADD COLUMN salary_expectation TEXT;
      ALTER TABLE resumes ADD COLUMN additional_info TEXT;
      ALTER TABLE resumes ADD COLUMN full_profile_scraped BOOLEAN DEFAULT 0;
      ALTER TABLE resumes ADD COLUMN profile_scrape_error TEXT;
    `);

    console.log('✓ Colunas adicionadas com sucesso');

    console.log('\n📝 Criando tabelas relacionadas...');

    // Create work_experiences table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS work_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        company TEXT,
        position TEXT,
        start_date TEXT,
        end_date TEXT,
        duration TEXT,
        last_salary TEXT,
        activities TEXT,
        is_current BOOLEAN DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tabela work_experiences criada');

    // Create education table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS education (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        degree_type TEXT,
        course TEXT,
        institution TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        display_order INTEGER DEFAULT 0,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tabela education criada');

    // Create courses table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        course_name TEXT,
        institution TEXT,
        duration TEXT,
        completion_year TEXT,
        display_order INTEGER DEFAULT 0,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tabela courses criada');

    // Create languages table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        language TEXT,
        proficiency TEXT,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tabela languages criada');

    // Create skills table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        skill_name TEXT,
        category TEXT,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tabela skills criada');

    console.log('\n📝 Criando índices...');

    // Create indexes
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_full_profile_scraped ON resumes(full_profile_scraped);
      CREATE INDEX IF NOT EXISTS idx_work_exp_resume_id ON work_experiences(resume_id);
      CREATE INDEX IF NOT EXISTS idx_education_resume_id ON education(resume_id);
      CREATE INDEX IF NOT EXISTS idx_courses_resume_id ON courses(resume_id);
      CREATE INDEX IF NOT EXISTS idx_languages_resume_id ON languages(resume_id);
      CREATE INDEX IF NOT EXISTS idx_skills_resume_id ON skills(resume_id);
    `);
    console.log('✓ Índices criados');

    console.log('\n✅ Migração concluída com sucesso!\n');

  } catch (error) {
    console.error('\n❌ Erro durante migração:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run migration
migrate().catch(error => {
  console.error('Falha na migração:', error);
  process.exit(1);
});
