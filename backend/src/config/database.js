import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function initDatabase() {
  if (db) return db;

  db = await open({
    filename: path.join(__dirname, '../../database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA synchronous = NORMAL;');
  await db.exec('PRAGMA temp_store = MEMORY;');
  await db.exec('PRAGMA cache_size = -16000;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec('PRAGMA foreign_keys = ON;');

  // Criar tabela de currículos (expandida)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      job_title TEXT,
      location TEXT,
      experience TEXT,
      summary TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      profile_url TEXT UNIQUE,
      last_updated TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      search_query TEXT,
      session_id TEXT,

      -- Dados pessoais expandidos
      age INTEGER,
      date_of_birth TEXT,
      gender TEXT,
      marital_status TEXT,
      address TEXT,
      neighborhood TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,

      -- Informações profissionais detalhadas
      career_objective TEXT,
      qualifications TEXT,
      salary_expectation TEXT,
      additional_info TEXT,

      -- Flags de controle
      full_profile_scraped BOOLEAN DEFAULT 0,
      profile_scrape_error TEXT,

      -- Retry tracking fields
      scrape_attempts INTEGER DEFAULT 0,
      last_scrape_attempt DATETIME,
      scrape_status TEXT DEFAULT 'pending'
    )
  `);

  const resumeColumns = await db.all('PRAGMA table_info(resumes)');
  const hasSessionId = resumeColumns.some(column => column.name === 'session_id');

  if (!hasSessionId) {
    await db.exec(`
      ALTER TABLE resumes ADD COLUMN session_id TEXT;
    `);
    console.log('✓ Coluna session_id adicionada à tabela resumes');
  }

  // Tabela de experiências profissionais
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

  // Tabela de formação acadêmica
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

  // Tabela de cursos e certificações
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

  // Tabela de idiomas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id INTEGER NOT NULL,
      language TEXT,
      proficiency TEXT,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
    )
  `);

  // Tabela de habilidades
  await db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id INTEGER NOT NULL,
      skill_name TEXT,
      category TEXT,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
    )
  `);

  // Criar índices para melhor performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_search_query ON resumes(search_query);
    CREATE INDEX IF NOT EXISTS idx_scraped_at ON resumes(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_full_profile_scraped ON resumes(full_profile_scraped);
    CREATE INDEX IF NOT EXISTS idx_scrape_status ON resumes(scrape_status);
    CREATE INDEX IF NOT EXISTS idx_scrape_attempts ON resumes(scrape_attempts);
    CREATE INDEX IF NOT EXISTS idx_session_id ON resumes(session_id);
    CREATE INDEX IF NOT EXISTS idx_work_exp_resume_id ON work_experiences(resume_id);
    CREATE INDEX IF NOT EXISTS idx_education_resume_id ON education(resume_id);
    CREATE INDEX IF NOT EXISTS idx_courses_resume_id ON courses(resume_id);
    CREATE INDEX IF NOT EXISTS idx_languages_resume_id ON languages(resume_id);
    CREATE INDEX IF NOT EXISTS idx_skills_resume_id ON skills(resume_id);
  `);

  console.log('✓ Banco de dados inicializado');
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database não inicializado. Chame initDatabase() primeiro.');
  }
  return db;
}
