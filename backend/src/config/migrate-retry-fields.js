import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('🔄 Migrando campos de retry para resumes...\n');

  const db = await open({
    filename: path.join(__dirname, '../../database.sqlite'),
    driver: sqlite3.Database
  });

  try {
    // Check if migration is needed
    const tableInfo = await db.all("PRAGMA table_info(resumes)");
    const hasRetryFields = tableInfo.some(col => col.name === 'scrape_attempts');

    if (hasRetryFields) {
      console.log('✅ Campos de retry já existem!\n');
      await db.close();
      return;
    }

    console.log('📝 Adicionando campos de retry à tabela resumes...');

    // Add retry tracking columns
    await db.exec(`
      ALTER TABLE resumes ADD COLUMN scrape_attempts INTEGER DEFAULT 0;
      ALTER TABLE resumes ADD COLUMN last_scrape_attempt DATETIME;
      ALTER TABLE resumes ADD COLUMN scrape_status TEXT DEFAULT 'pending';
    `);

    console.log('✓ Campos de retry adicionados com sucesso');

    console.log('\n📝 Criando índices para retry fields...');

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scrape_status ON resumes(scrape_status);
      CREATE INDEX IF NOT EXISTS idx_scrape_attempts ON resumes(scrape_attempts);
    `);

    console.log('✓ Índices criados');

    console.log('\n✅ Migração de retry fields concluída!\n');

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
