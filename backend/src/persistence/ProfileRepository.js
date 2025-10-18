/**
 * Profile Repository - Handles database operations for full profile data
 */
export class ProfileRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Save full profile with all related data
   */
  async saveFullProfile(profileUrl, profileData, searchQuery) {
    let transactionStarted = false;
    let resumeId = null;

    const {
      personalData = {},
      careerInfo = {},
      workExperiences = [],
      education = [],
      courses = [],
      languages = [],
      skills = [],
      additionalInfo = null
    } = profileData;

    try {
      await this.db.exec('BEGIN TRANSACTION');
      transactionStarted = true;

      const existing = await this.db.get('SELECT id FROM resumes WHERE profile_url = ?', [profileUrl]);

      if (existing) {
        await this.db.run(
          `UPDATE resumes SET
            age = ?, date_of_birth = ?, gender = ?, marital_status = ?,
            address = ?, neighborhood = ?, city = ?, state = ?, zip_code = ?, country = ?,
            contact_email = ?, contact_phone = ?,
            career_objective = ?, qualifications = ?, salary_expectation = ?,
            additional_info = ?, full_profile_scraped = 1, profile_scrape_error = NULL
          WHERE profile_url = ?`,
          [
            personalData.age || null,
            personalData.date_of_birth || null,
            personalData.gender || null,
            personalData.marital_status || null,
            personalData.address || null,
            personalData.neighborhood || null,
            personalData.city || null,
            personalData.state || null,
            personalData.zip_code || null,
            personalData.country || null,
            personalData.email || null,
            personalData.phone || null,
            careerInfo.career_objective || null,
            careerInfo.qualifications || null,
            careerInfo.salary_expectation || null,
            additionalInfo || null,
            profileUrl
          ]
        );
        resumeId = existing.id;
        await this.clearRelatedData(resumeId);
      } else {
        const result = await this.db.run(
          `INSERT INTO resumes
           (name, profile_url, search_query, age, date_of_birth, gender, marital_status,
            address, neighborhood, city, state, zip_code, country, contact_email, contact_phone,
            career_objective, qualifications, salary_expectation, additional_info,
            full_profile_scraped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            'Nome não extraído',
            profileUrl,
            searchQuery,
            personalData.age || null,
            personalData.date_of_birth || null,
            personalData.gender || null,
            personalData.marital_status || null,
            personalData.address || null,
            personalData.neighborhood || null,
            personalData.city || null,
            personalData.state || null,
            personalData.zip_code || null,
            personalData.country || null,
            personalData.email || null,
            personalData.phone || null,
            careerInfo.career_objective || null,
            careerInfo.qualifications || null,
            careerInfo.salary_expectation || null,
            additionalInfo || null
          ]
        );
        resumeId = result.lastID;
      }

      await this.saveWorkExperiences(resumeId, workExperiences || []);
      await this.saveEducation(resumeId, education || []);
      await this.saveCourses(resumeId, courses || []);
      await this.saveLanguages(resumeId, languages || []);
      await this.saveSkills(resumeId, skills || []);

      await this.db.exec('COMMIT');
      transactionStarted = false;

      return resumeId;

    } catch (error) {
      if (transactionStarted) {
        await this.db.exec('ROLLBACK').catch(() => {});
      }

      console.error('❌ Error saving full profile:', error.message);

      try {
        await this.db.run(
          'UPDATE resumes SET profile_scrape_error = ? WHERE profile_url = ?',
          [error.message, profileUrl]
        );
      } catch (e) {
        // Ignore error when saving error
      }

      throw error;
    }
  }

  /**
   * Clear related data for a resume
   */
  async clearRelatedData(resumeId) {
    await this.db.run('DELETE FROM work_experiences WHERE resume_id = ?', [resumeId]);
    await this.db.run('DELETE FROM education WHERE resume_id = ?', [resumeId]);
    await this.db.run('DELETE FROM courses WHERE resume_id = ?', [resumeId]);
    await this.db.run('DELETE FROM languages WHERE resume_id = ?', [resumeId]);
    await this.db.run('DELETE FROM skills WHERE resume_id = ?', [resumeId]);
  }

  /**
   * Save work experiences
   */
  async saveWorkExperiences(resumeId, experiences) {
    for (const exp of experiences) {
      await this.db.run(
        `INSERT INTO work_experiences
         (resume_id, company, position, start_date, end_date, duration, last_salary, activities, is_current, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resumeId,
          exp.company,
          exp.position,
          exp.start_date,
          exp.end_date,
          exp.duration,
          exp.last_salary,
          exp.activities,
          exp.is_current ? 1 : 0,
          exp.display_order
        ]
      );
    }
  }

  /**
   * Save education
   */
  async saveEducation(resumeId, education) {
    for (const edu of education) {
      await this.db.run(
        `INSERT INTO education
         (resume_id, degree_type, course, institution, start_date, end_date, status, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [resumeId, edu.degree_type, edu.course, edu.institution, edu.start_date, edu.end_date, edu.status, edu.display_order]
      );
    }
  }

  /**
   * Save courses
   */
  async saveCourses(resumeId, courses) {
    for (const course of courses) {
      await this.db.run(
        `INSERT INTO courses
         (resume_id, course_name, institution, duration, completion_year, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [resumeId, course.course_name, course.institution, course.duration, course.completion_year, course.display_order]
      );
    }
  }

  /**
   * Save languages
   */
  async saveLanguages(resumeId, languages) {
    for (const lang of languages) {
      await this.db.run(
        `INSERT INTO languages (resume_id, language, proficiency) VALUES (?, ?, ?)`,
        [resumeId, lang.language, lang.proficiency]
      );
    }
  }

  /**
   * Save skills
   */
  async saveSkills(resumeId, skills) {
    for (const skill of skills) {
      await this.db.run(
        `INSERT INTO skills (resume_id, skill_name, category) VALUES (?, ?, ?)`,
        [resumeId, skill.skill_name, skill.category]
      );
    }
  }

  /**
   * Get full profile by resume ID
   */
  async getFullProfile(resumeId) {
    try {
      const resume = await this.db.get('SELECT * FROM resumes WHERE id = ?', [resumeId]);
      if (!resume) return null;

      const workExperiences = await this.db.all(
        'SELECT * FROM work_experiences WHERE resume_id = ? ORDER BY display_order',
        [resumeId]
      );

      const education = await this.db.all(
        'SELECT * FROM education WHERE resume_id = ? ORDER BY display_order',
        [resumeId]
      );

      const courses = await this.db.all(
        'SELECT * FROM courses WHERE resume_id = ? ORDER BY display_order',
        [resumeId]
      );

      const languages = await this.db.all(
        'SELECT * FROM languages WHERE resume_id = ?',
        [resumeId]
      );

      const skills = await this.db.all(
        'SELECT * FROM skills WHERE resume_id = ?',
        [resumeId]
      );

      return {
        ...resume,
        workExperiences,
        education,
        courses,
        languages,
        skills
      };
    } catch (error) {
      console.error('❌ Error getting full profile:', error.message);
      return null;
    }
  }
}
