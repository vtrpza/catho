import { BaseExtractor } from './BaseExtractor.js';
import { ContactExtractor } from './ContactExtractor.js';
import { humanizedWait, simulateHumanBehavior } from '../utils/antiDetection.js';

/**
 * Extracts full profile data from a profile page
 */
export class ProfileExtractor extends BaseExtractor {
  constructor() {
    super();
    this.contactExtractor = new ContactExtractor();
  }

  /**
   * Extract full profile data
   * @param {Page} page - Puppeteer page
   * @param {string} profileUrl - Profile URL
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} {success, data, error}
   */
  async extract(page, context = {}) {
    try {
      const { profileUrl } = context;

      console.log(`  📄 Accessing profile: ${profileUrl}`);

      const startTime = Date.now();
      await page.goto(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      const requestTime = Date.now() - startTime;

      // Humanized wait
      await humanizedWait(page, 2000, 0.4);

      // Simulate reading the profile
      await simulateHumanBehavior(page);

      // Extract contact info by clicking buttons
      const contactInfo = await this.contactExtractor.extract(page, context);

      // Extract all profile data
      const profileData = await page.evaluate(() => {
        const data = {
          personalData: {},
          careerInfo: {},
          workExperiences: [],
          education: [],
          courses: [],
          languages: [],
          skills: [],
          additionalInfo: ''
        };

        // ===== PERSONAL DATA =====
        try {
          const nameElement = document.querySelector('h1, .candidate-name');
          if (nameElement) {
            const headerText = nameElement.textContent.trim();
            const ageMatch = headerText.match(/(\d+)\s*anos/i);
            if (ageMatch) data.personalData.age = parseInt(ageMatch[1]);
          }

          const personalSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Dados Pessoais')
          )?.parentElement;

          if (personalSection) {
            const text = personalSection.textContent;

            const genderMatch = text.match(/Sexo:\s*([^\n]+)/i);
            if (genderMatch) data.personalData.gender = genderMatch[1].trim();

            const maritalMatch = text.match(/Estado Civil:\s*([^\n]+)/i);
            if (maritalMatch) data.personalData.marital_status = maritalMatch[1].trim();

            const dobMatch = text.match(/Data de nascimento:\s*(\d{2}\/\d{2}\/\d{4})/i);
            if (dobMatch) data.personalData.date_of_birth = dobMatch[1].trim();

            const cityMatch = text.match(/Cidade:\s*([^\n]+)/i);
            if (cityMatch) {
              const cityState = cityMatch[1].trim();
              data.personalData.city = cityState.split(' - ')[0] || cityState;
              data.personalData.state = cityState.split(' - ')[1] || '';
            }

            const neighborhoodMatch = text.match(/Bairro:\s*([^\n]+)/i);
            if (neighborhoodMatch) data.personalData.neighborhood = neighborhoodMatch[1].trim();

            const addressMatch = text.match(/Endereço:\s*([^\n]+)/i);
            if (addressMatch) data.personalData.address = addressMatch[1].trim();

            const cepMatch = text.match(/CEP:\s*([^\n]+)/i);
            if (cepMatch) data.personalData.zip_code = cepMatch[1].trim();

            const countryMatch = text.match(/País:\s*([^\n]+)/i);
            if (countryMatch) data.personalData.country = countryMatch[1].trim();
          }
        } catch (e) {
          console.error('Error extracting personal data:', e);
        }

        // ===== CAREER OBJECTIVE =====
        try {
          const objectiveSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Objetivo e qualificações')
          )?.parentElement;

          if (objectiveSection) {
            const cargoMatch = objectiveSection.textContent.match(/Cargo de interesse:\s*([^\n]+)/i);
            if (cargoMatch) data.careerInfo.career_objective = cargoMatch[1].trim();

            const qualMatch = objectiveSection.textContent.match(/Qualificações:\s*([^\n]+(?:\n(?!Experiência|Formação|Cursos|Idiomas).+)*)/i);
            if (qualMatch) data.careerInfo.qualifications = qualMatch[1].trim();
          }
        } catch (e) {
          console.error('Error extracting career objective:', e);
        }

        // ===== SALARY EXPECTATION =====
        try {
          const resumoSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Resumo do CV')
          )?.parentElement;

          if (resumoSection) {
            const salaryMatch = resumoSection.textContent.match(/Pretensão salarial:\s*([^\n]+)/i);
            if (salaryMatch) data.careerInfo.salary_expectation = salaryMatch[1].trim();
          }
        } catch (e) {
          console.error('Error extracting salary:', e);
        }

        // ===== WORK EXPERIENCE =====
        try {
          const expSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Experiência Profissional')
          )?.parentElement;

          if (expSection) {
            const companies = expSection.querySelectorAll('h3, h4, strong');

            companies.forEach((companyElement, idx) => {
              const companyText = companyElement.textContent.trim();
              if (!companyText || companyText.includes('Experiência Profissional')) return;

              const nextText = companyElement.parentElement.textContent;

              const exp = {
                company: companyText,
                position: '',
                start_date: '',
                end_date: '',
                duration: '',
                last_salary: '',
                activities: '',
                is_current: false,
                display_order: idx
              };

              const cargoMatch = nextText.match(/Cargo:\s*([^-\n]+)/i);
              if (cargoMatch) exp.position = cargoMatch[1].trim();

              const dateMatch = nextText.match(/(\d{2}\/\d{4})\s*(?:até|-)?\s*(\d{2}\/\d{4}|Atual)/i);
              if (dateMatch) {
                exp.start_date = dateMatch[1];
                exp.end_date = dateMatch[2];
                if (dateMatch[2].includes('Atual')) exp.is_current = true;
              }

              const durationMatch = nextText.match(/(\d+\s*(?:ano|anos|mês|meses)(?:\s*e\s*\d+\s*(?:mês|meses))?)/i);
              if (durationMatch) exp.duration = durationMatch[1].trim();

              const salaryMatch = nextText.match(/Último salário:\s*([^\n]+)/i);
              if (salaryMatch) exp.last_salary = salaryMatch[1].trim();

              const activitiesMatch = nextText.match(/Principais atividades:\s*([^\n]+(?:\n(?!Cargo:|Último salário:).+)*)/i);
              if (activitiesMatch) exp.activities = activitiesMatch[1].trim();

              data.workExperiences.push(exp);
            });
          }
        } catch (e) {
          console.error('Error extracting work experience:', e);
        }

        // ===== EDUCATION =====
        try {
          const eduSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Formação')
          )?.parentElement;

          if (eduSection) {
            const degrees = eduSection.querySelectorAll('h3, h4, strong');

            degrees.forEach((degreeElement, idx) => {
              const degreeText = degreeElement.textContent.trim();
              if (!degreeText || degreeText.includes('Formação')) return;

              const nextText = degreeElement.parentElement.textContent;

              const edu = {
                degree_type: degreeText.split(' em ')[0] || degreeText,
                course: degreeText.split(' em ')[1] || '',
                institution: '',
                start_date: '',
                end_date: '',
                status: 'Concluído',
                display_order: idx
              };

              const lines = nextText.split('\n').filter(l => l.trim());
              if (lines.length > 1) edu.institution = lines[1].trim();

              const dateMatch = nextText.match(/(\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{4})/i);
              if (dateMatch) {
                edu.start_date = dateMatch[1];
                edu.end_date = dateMatch[2];
              }

              data.education.push(edu);
            });
          }
        } catch (e) {
          console.error('Error extracting education:', e);
        }

        // ===== COURSES =====
        try {
          const coursesSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Cursos e especializações')
          )?.parentElement;

          if (coursesSection) {
            const courseElements = coursesSection.querySelectorAll('h4, strong');

            courseElements.forEach((courseElement, idx) => {
              const courseText = courseElement.textContent.trim();
              if (!courseText || courseText.includes('Cursos e especializações')) return;

              const nextText = courseElement.parentElement.textContent;

              const course = {
                course_name: courseText,
                institution: '',
                duration: '',
                completion_year: '',
                display_order: idx
              };

              const lines = nextText.split('\n').filter(l => l.trim());
              if (lines.length > 1) course.institution = lines[1].trim();

              const durationMatch = nextText.match(/(Curta|Média|Longa)\s*\([^)]+\)/i);
              if (durationMatch) course.duration = durationMatch[0].trim();

              const yearMatch = nextText.match(/Ano de conclusão:\s*(\d{4})/i);
              if (yearMatch) course.completion_year = yearMatch[1];

              data.courses.push(course);
            });
          }
        } catch (e) {
          console.error('Error extracting courses:', e);
        }

        // ===== LANGUAGES =====
        try {
          const langSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Idiomas')
          )?.parentElement;

          if (langSection) {
            const text = langSection.textContent;
            const langMatches = text.matchAll(/([A-Za-zçãõáéíóú]+)\s+(Básico|Intermediário|Avançado|Fluente)/gi);

            for (const match of langMatches) {
              data.languages.push({
                language: match[1].trim(),
                proficiency: match[2].trim()
              });
            }
          }
        } catch (e) {
          console.error('Error extracting languages:', e);
        }

        // ===== ADDITIONAL INFO & SKILLS =====
        try {
          const infoSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Informações Adicionais')
          )?.parentElement;

          if (infoSection) {
            data.additionalInfo = infoSection.textContent.trim();

            const skillPatterns = [
              /Linguagens de Programação:\s*([^\n]+)/i,
              /Tecnologias:\s*([^\n]+)/i,
              /Ferramentas:\s*([^\n]+)/i,
              /Sistemas Operacionais:\s*([^\n]+)/i
            ];

            skillPatterns.forEach(pattern => {
              const match = data.additionalInfo.match(pattern);
              if (match) {
                const skills = match[1].split(/,|;/).map(s => s.trim()).filter(Boolean);
                skills.forEach(skill => {
                  data.skills.push({
                    skill_name: skill,
                    category: pattern.source.split(':')[0].replace(/\\/g, '')
                  });
                });
              }
            });
          }
        } catch (e) {
          console.error('Error extracting skills:', e);
        }

        return data;
      });

      // Add contact info to profile data
      if (contactInfo.email) {
        profileData.personalData.email = contactInfo.email;
      }
      if (contactInfo.phone) {
        profileData.personalData.phone = contactInfo.phone;
      }

      console.log(`  ✓ Profile extracted successfully`);
      return {
        success: true,
        data: profileData,
        requestTime
      };

    } catch (error) {
      this.addError(error, context);
      console.error(`  ❌ Error extracting profile:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate profile data
   */
  validate(profileData) {
    return (
      profileData &&
      profileData.data &&
      (profileData.data.personalData || profileData.data.careerInfo)
    );
  }
}
