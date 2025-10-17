import { CathoAuth } from './cathoAuth.js';
import { getDatabase } from '../config/database.js';
import { CathoQueryBuilder } from '../utils/queryBuilder.js';
import {
  simulateHumanBehavior,
  humanizedWait,
  randomDelay,
  getAdaptiveDelay,
  exponentialBackoff
} from '../utils/antiDetection.js';
import { getCheckpointService } from './checkpointService.js';
import { BatchProcessor, batchInsertResumes } from '../utils/batchProcessor.js';

export class CathoScraper {
  constructor(email, password) {
    this.auth = new CathoAuth(email, password);
    this.resumes = [];
    this.isRunning = false;
    this.progress = {
      total: 0,
      scraped: 0,
      currentPage: 0,
      status: 'idle'
    };
    this.errorCount = 0; // Track errors for adaptive delays
    this.lastRequestTime = 0; // Track response times
    this.sessionId = null; // Checkpoint session ID
    this.checkpointService = null; // Checkpoint service instance
  }

  async scrape(searchQuery, options = {}) {
    try {
      this.isRunning = true;
      this.progress.status = 'running';
      this.progress.scraped = 0;
      this.resumes = [];

      // Initialize checkpoint service
      this.checkpointService = await getCheckpointService();

      // Create or resume checkpoint
      if (options.resumeSession) {
        const checkpoint = await this.checkpointService.getCheckpoint(options.resumeSession);
        if (checkpoint && this.checkpointService.canResume(checkpoint)) {
          this.sessionId = checkpoint.session_id;
          console.log(`📥 Retomando sessão: ${this.sessionId}`);
          await this.checkpointService.resumeCheckpoint(this.sessionId);
        }
      }

      if (!this.sessionId) {
        this.sessionId = this.checkpointService.generateSessionId(searchQuery);
        await this.checkpointService.createCheckpoint(this.sessionId, searchQuery, options);
      }

      const maxPages = options.maxPages || 5;
      const delayBetweenPages = options.delay || 2000;
      const scrapeFullProfiles = options.scrapeFullProfiles !== false; // Default true
      const profileDelay = options.profileDelay || 2500;
      const enableParallel = options.enableParallel !== false; // Default true
      const concurrency = options.concurrency || 3; // Default 3 workers

      // Construir URL com filtros avançados
      const queryBuilder = new CathoQueryBuilder(searchQuery);

      // Aplicar filtros se fornecidos
      if (options.salaryRanges && options.salaryRanges.length > 0) {
        queryBuilder.setSalaryRanges(options.salaryRanges);
      }
      if (options.ageRanges && options.ageRanges.length > 0) {
        queryBuilder.setAgeRanges(options.ageRanges);
      }
      if (options.gender) {
        queryBuilder.setGender(options.gender);
      }
      if (options.professionalAreas && options.professionalAreas.length > 0) {
        queryBuilder.setProfessionalAreas(options.professionalAreas);
      }
      if (options.hierarchicalLevels && options.hierarchicalLevels.length > 0) {
        queryBuilder.setHierarchicalLevels(options.hierarchicalLevels);
      }
      if (options.lastUpdated) {
        queryBuilder.setLastUpdated(options.lastUpdated);
      }

      const searchUrl = queryBuilder.build();

      console.log(`\n🎯 Iniciando coleta para: "${searchQuery}"`);
      console.log(`🔗 URL: ${searchUrl}`);

      // Fazer login e navegar para a busca
      await this.auth.init();
      await this.auth.login();
      const page = this.auth.getPage();

      const startTime = Date.now();
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      this.lastRequestTime = Date.now() - startTime;

      // Aguardar os resultados carregarem com tempo humanizado
      await humanizedWait(page, 3000, 0.3);

      // Simular comportamento humano (scroll, movimento do mouse)
      await simulateHumanBehavior(page);

      // Extrair número total de resultados (se disponível)
      try {
        const totalResults = await page.evaluate(() => {
          const totalElement = document.querySelector('.total-results, .results-count, [data-testid="results-count"]');
          return totalElement ? totalElement.textContent : '0';
        });
        console.log(`📊 Total de resultados encontrados: ${totalResults}`);
      } catch (error) {
        console.log('⚠️ Não foi possível obter o total de resultados');
      }

      // Iterar pelas páginas
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        this.progress.currentPage = pageNum;
        console.log(`\n📄 Processando página ${pageNum}/${maxPages}...`);

        try {
          // Extrair currículos da página atual
          const pageResumes = await this.extractResumesFromPage(page, searchQuery);

          if (pageResumes.length === 0) {
            console.log('⚠️ Nenhum currículo encontrado nesta página. Finalizando...');
            break;
          }

          this.resumes.push(...pageResumes);
          this.progress.scraped = this.resumes.length;

          console.log(`✓ Coletados ${pageResumes.length} currículos desta página`);
          console.log(`📈 Total coletado até agora: ${this.resumes.length}`);

          // Salvar dados básicos no banco de dados (usando batch insert para performance)
          await this.saveResumesBatch(pageResumes);

          // Update checkpoint after saving resumes
          await this.checkpointService.updateCheckpoint(this.sessionId, {
            currentPage: pageNum,
            profilesScraped: this.resumes.length,
            errorCount: this.errorCount
          });

          // Se habilitado, scrape perfis completos
          if (scrapeFullProfiles && pageResumes.length > 0) {
            // Extract profile URLs
            const profileUrls = pageResumes
              .filter(r => r.profile_url)
              .map(r => r.profile_url);

            if (profileUrls.length === 0) {
              console.log(`  ⚠️ Nenhum perfil com URL disponível nesta página`);
            } else if (enableParallel && profileUrls.length >= 3) {
              // Use parallel processing for 3+ profiles
              console.log(`\n🚀 Iniciando coleta PARALELA de ${profileUrls.length} perfis (${concurrency} workers)...`);

              const batchProcessor = new BatchProcessor(this.auth.browser, {
                concurrency,
                maxBatchSize: 50,
                profileDelay
              });

              const results = await batchProcessor.processBatch(
                profileUrls,
                // Scrape function
                async (workerPage, url) => {
                  return await this.scrapeProfilePage(workerPage, url, null);
                },
                // Save function
                async (url, data) => {
                  await this.saveFullProfile(url, data, searchQuery);
                }
              );

              console.log(`  ✅ Paralelo concluído: ${results.succeeded}/${results.processed} sucessos`);

              // Update error count from batch results
              this.errorCount += results.failed;

            } else {
              // Use sequential processing for < 3 profiles or if parallel disabled
              console.log(`\n🔍 Iniciando coleta SEQUENCIAL de ${profileUrls.length} perfis...`);

              for (let i = 0; i < profileUrls.length; i++) {
                const url = profileUrls[i];
                const resume = pageResumes[i];

                try {
                  console.log(`  📋 Perfil ${i + 1}/${profileUrls.length}: ${resume.name}`);

                  // Scrape perfil completo
                  const profileResult = await this.scrapeProfilePage(page, url, null);

                  if (profileResult.success) {
                    // Salvar perfil completo no banco
                    await this.saveFullProfile(url, profileResult.data, searchQuery);
                    console.log(`  ✅ Perfil salvo com sucesso`);
                  } else {
                    console.log(`  ⚠️ Erro ao coletar perfil: ${profileResult.error}`);
                  }

                  // Delay entre perfis para evitar bloqueio (com adaptação)
                  if (i < profileUrls.length - 1) {
                    const adaptiveDelay = getAdaptiveDelay(profileDelay, this.errorCount, this.lastRequestTime);
                    await humanizedWait(page, adaptiveDelay, 0.4);

                    // Simular comportamento humano ocasionalmente
                    if (Math.random() > 0.7) {
                      await simulateHumanBehavior(page);
                    }
                  }

                } catch (error) {
                  console.error(`  ❌ Erro ao processar perfil de ${resume.name}:`, error.message);
                  this.errorCount++;
                  continue;
                }
              }
            }

            // Voltar para a página de busca para continuar navegação
            console.log(`  🔙 Retornando para página de busca...`);
            await page.goto(searchUrl + `&pagina=${pageNum + 1}`, {
              waitUntil: 'networkidle2',
              timeout: 30000
            }).catch(() => {});
          }

          // Verificar se há próxima página
          const hasNextPage = await this.goToNextPage(page);

          if (!hasNextPage) {
            console.log('ℹ️ Não há mais páginas disponíveis');
            break;
          }

          // Delay entre páginas com adaptação e humanização
          const adaptivePageDelay = getAdaptiveDelay(delayBetweenPages, this.errorCount, this.lastRequestTime);
          await humanizedWait(page, adaptivePageDelay, 0.35);

          // Simular comportamento humano antes de mudar de página
          await simulateHumanBehavior(page);

        } catch (error) {
          console.error(`❌ Erro ao processar página ${pageNum}:`, error.message);
          break;
        }
      }

      this.progress.status = 'completed';
      this.progress.total = this.resumes.length;

      // Mark checkpoint as completed
      if (this.sessionId) {
        await this.checkpointService.completeCheckpoint(this.sessionId);
      }

      console.log(`\n✅ Coleta finalizada! Total: ${this.resumes.length} currículos`);

      return {
        success: true,
        total: this.resumes.length,
        resumes: this.resumes,
        sessionId: this.sessionId
      };

    } catch (error) {
      this.progress.status = 'error';
      console.error('❌ Erro durante scraping:', error);

      // Mark checkpoint as failed
      if (this.sessionId) {
        await this.checkpointService.failCheckpoint(this.sessionId, error.message);
      }

      throw error;
    } finally {
      this.isRunning = false;
      await this.auth.close();
    }
  }

  /**
   * Extract contact info (email and phone) by clicking reveal buttons
   */
  async extractContactInfo(page) {
    const contactInfo = {
      email: null,
      phone: null
    };

    try {
      // Find and click "Ver telefone" button (with MUI/styled components classes)
      console.log('  📞 Procurando botão "Ver telefone"...');

      const phoneButtonClicked = await page.evaluate(() => {
        // Find button with "Ver telefone" text and SmartphoneIcon
        const buttons = Array.from(document.querySelectorAll('button'));
        const phoneButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const hasIcon = btn.querySelector('svg[data-testid="SmartphoneIcon"]');
          return (text.includes('ver telefone') || text.includes('telefone')) && hasIcon;
        });

        if (phoneButton) {
          phoneButton.click();
          return true;
        }
        return false;
      });

      if (phoneButtonClicked) {
        console.log('  📞 Botão "Ver telefone" clicado, aguardando dados...');

        // Wait for phone to appear (give it time to load)
        await page.waitForTimeout(randomDelay(2000, 3000));

        // Extract phone after it loads
        contactInfo.phone = await page.evaluate(() => {
          // Look for phone patterns in the entire page (it should be visible now)
          const pageText = document.body.textContent;

          // Brazilian phone patterns: (11) 99999-9999 or (11) 9999-9999 or 11999999999
          const phonePatterns = [
            /\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/g,  // (11) 99999-9999 or (11) 9999-9999
            /\d{11}/g,  // 11999999999
            /\d{10}/g   // 1199999999
          ];

          for (const pattern of phonePatterns) {
            const matches = pageText.match(pattern);
            if (matches && matches.length > 0) {
              // Return the first valid-looking phone number
              for (const match of matches) {
                const cleaned = match.replace(/\D/g, '');
                // Brazilian phones: 10 digits (with area code) or 11 digits (with 9)
                if (cleaned.length === 10 || cleaned.length === 11) {
                  return match.trim();
                }
              }
            }
          }
          return null;
        });

        if (contactInfo.phone) {
          console.log(`  ✅ Telefone encontrado: ${contactInfo.phone}`);
        } else {
          console.log(`  ⚠️ Telefone não encontrado após clicar`);
        }
      } else {
        console.log(`  ⚠️ Botão "Ver telefone" não encontrado`);
      }

      // Small delay between actions
      await page.waitForTimeout(randomDelay(1000, 1500));

      // Find and click "Ver email" button (with MUI/styled components classes)
      console.log('  📧 Procurando botão "Ver email"...');

      const emailButtonClicked = await page.evaluate(() => {
        // Find button with "Ver email" text and MailOutlineIcon
        const buttons = Array.from(document.querySelectorAll('button'));
        const emailButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const hasIcon = btn.querySelector('svg[data-testid="MailOutlineIcon"]');
          return (text.includes('Ver email') || text.includes('ver e-mail') || text.includes('email')) && hasIcon;
        });

        if (emailButton) {
          emailButton.click();
          return true;
        }
        return false;
      });

      if (emailButtonClicked) {
        console.log('  📧 Botão "Ver email" clicado, aguardando dados...');

        // Wait for email to appear (give it time to load)
        await page.waitForTimeout(randomDelay(2000, 3000));

        // Extract email after it loads
        contactInfo.email = await page.evaluate(() => {
          // Look for email patterns in the entire page (it should be visible now)
          const pageText = document.body.textContent;

          // Email pattern
          const emailMatch = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          return emailMatch ? emailMatch[0] : null;
        });

        if (contactInfo.email) {
          console.log(`  ✅ Email encontrado: ${contactInfo.email}`);
        } else {
          console.log(`  ⚠️ Email não encontrado após clicar`);
        }
      } else {
        console.log(`  ⚠️ Botão "Ver email" não encontrado`);
      }

    } catch (error) {
      console.log(`  ⚠️ Erro ao extrair contato: ${error.message}`);
    }

    return contactInfo;
  }

  async scrapeProfilePage(page, profileUrl, resumeId) {
    try {
      console.log(`  📄 Acessando perfil: ${profileUrl}`);

      const startTime = Date.now();
      await page.goto(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      this.lastRequestTime = Date.now() - startTime;

      // Aguardar com tempo humanizado
      await humanizedWait(page, 2000, 0.4);

      // Simular leitura do perfil
      await simulateHumanBehavior(page);

      // Extract email and phone by clicking buttons
      const contactInfo = await this.extractContactInfo(page);

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

        // ===== DADOS PESSOAIS =====
        try {
          // Nome e idade do header
          const nameElement = document.querySelector('h1, .candidate-name');
          if (nameElement) {
            const headerText = nameElement.textContent.trim();
            const ageMatch = headerText.match(/(\d+)\s*anos/i);
            if (ageMatch) data.personalData.age = parseInt(ageMatch[1]);
          }

          // Seção de Dados Pessoais
          const personalSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Dados Pessoais')
          )?.parentElement;

          if (personalSection) {
            const text = personalSection.textContent;

            // Extrair informações com regex
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
          console.error('Erro ao extrair dados pessoais:', e);
        }

        // ===== OBJETIVO E QUALIFICAÇÕES =====
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
          console.error('Erro ao extrair objetivo:', e);
        }

        // ===== RESUMO DO CV (Pretensão salarial) =====
        try {
          const resumoSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Resumo do CV')
          )?.parentElement;

          if (resumoSection) {
            const salaryMatch = resumoSection.textContent.match(/Pretensão salarial:\s*([^\n]+)/i);
            if (salaryMatch) data.careerInfo.salary_expectation = salaryMatch[1].trim();
          }
        } catch (e) {
          console.error('Erro ao extrair resumo:', e);
        }

        // ===== EXPERIÊNCIA PROFISSIONAL =====
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

              // Extrair cargo
              const cargoMatch = nextText.match(/Cargo:\s*([^-\n]+)/i);
              if (cargoMatch) exp.position = cargoMatch[1].trim();

              // Extrair datas e duração
              const dateMatch = nextText.match(/(\d{2}\/\d{4})\s*(?:até|-)?\s*(\d{2}\/\d{4}|Atual)/i);
              if (dateMatch) {
                exp.start_date = dateMatch[1];
                exp.end_date = dateMatch[2];
                if (dateMatch[2].includes('Atual')) exp.is_current = true;
              }

              const durationMatch = nextText.match(/(\d+\s*(?:ano|anos|mês|meses)(?:\s*e\s*\d+\s*(?:mês|meses))?)/i);
              if (durationMatch) exp.duration = durationMatch[1].trim();

              // Extrair salário
              const salaryMatch = nextText.match(/Último salário:\s*([^\n]+)/i);
              if (salaryMatch) exp.last_salary = salaryMatch[1].trim();

              // Extrair atividades
              const activitiesMatch = nextText.match(/Principais atividades:\s*([^\n]+(?:\n(?!Cargo:|Último salário:).+)*)/i);
              if (activitiesMatch) exp.activities = activitiesMatch[1].trim();

              data.workExperiences.push(exp);
            });
          }
        } catch (e) {
          console.error('Erro ao extrair experiências:', e);
        }

        // ===== FORMAÇÃO =====
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

              // Extrair instituição
              const lines = nextText.split('\n').filter(l => l.trim());
              if (lines.length > 1) edu.institution = lines[1].trim();

              // Extrair datas
              const dateMatch = nextText.match(/(\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{4})/i);
              if (dateMatch) {
                edu.start_date = dateMatch[1];
                edu.end_date = dateMatch[2];
              }

              data.education.push(edu);
            });
          }
        } catch (e) {
          console.error('Erro ao extrair formação:', e);
        }

        // ===== CURSOS =====
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

              // Extrair instituição
              const lines = nextText.split('\n').filter(l => l.trim());
              if (lines.length > 1) course.institution = lines[1].trim();

              // Extrair duração
              const durationMatch = nextText.match(/(Curta|Média|Longa)\s*\([^)]+\)/i);
              if (durationMatch) course.duration = durationMatch[0].trim();

              // Extrair ano
              const yearMatch = nextText.match(/Ano de conclusão:\s*(\d{4})/i);
              if (yearMatch) course.completion_year = yearMatch[1];

              data.courses.push(course);
            });
          }
        } catch (e) {
          console.error('Erro ao extrair cursos:', e);
        }

        // ===== IDIOMAS =====
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
          console.error('Erro ao extrair idiomas:', e);
        }

        // ===== HABILIDADES (Informações Adicionais) =====
        try {
          const infoSection = Array.from(document.querySelectorAll('h2, h3')).find(h =>
            h.textContent.includes('Informações Adicionais')
          )?.parentElement;

          if (infoSection) {
            data.additionalInfo = infoSection.textContent.trim();

            // Tentar extrair habilidades técnicas mencionadas
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
          console.error('Erro ao extrair habilidades:', e);
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

      console.log(`  ✓ Perfil extraído com sucesso`);
      return { success: true, data: profileData };

    } catch (error) {
      console.error(`  ❌ Erro ao extrair perfil:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async extractResumesFromPage(page, searchQuery) {
    try {
      // Aguardar os cards de currículo carregarem (baseado na estrutura real do Catho)
      await page.waitForSelector('article.sc-fvtFIe, article', { timeout: 10000 });

      const resumes = await page.evaluate((query) => {
        const results = [];

        // Buscar os articles (cards de currículo) - estrutura real do Catho
        const cards = Array.from(document.querySelectorAll('article.sc-fvtFIe, article'));

        console.log(`Encontrados ${cards.length} cards na página`);

        cards.forEach((card, index) => {
          try {
            // Extrair nome - está dentro de h2 > a > b
            const nameElement = card.querySelector('h2 a b, h2 b, h2 a');
            const name = nameElement ? nameElement.textContent.trim() : 'Nome não disponível';

            // Extrair localização - tag p com classe específica
            const locationElement = card.querySelector('p.sc-eZkCL, p[class*="eZkCL"]');
            const location = locationElement ? locationElement.textContent.trim() : '';

            // Extrair cargo (job title) - h3 dentro da div de experiência
            const jobTitleElement = card.querySelector('h3.sc-dCFHLb, h3[class*="dCFHLb"]');
            const jobTitle = jobTitleElement ? jobTitleElement.textContent.trim() : '';

            // Extrair experiência - texto após "Experiência:"
            const experienceSection = card.querySelector('.sc-kdBSHD, [class*="kdBSHD"]');
            let experience = '';
            if (experienceSection) {
              const experienceText = experienceSection.textContent;
              // Extrair duração (ex: "9 meses na Freelancer")
              const match = experienceText.match(/(\d+\s*(ano|anos|mês|meses|month|months).*?)(?=Idioma|$)/i);
              if (match) {
                experience = match[1].trim();
              }
            }

            // Extrair link do perfil
            const profileLink = card.querySelector('h2 a')?.getAttribute('href') || '';
            const profileUrl = profileLink.startsWith('http') ? profileLink : `https://www.catho.com.br${profileLink}`;

            // Extrair pretensão salarial (como resumo adicional)
            const salaryElement = card.querySelector('p.sc-bypJrT, p[class*="bypJrT"], strong');
            const salary = salaryElement ? salaryElement.textContent.trim() : '';

            // Extrair data de atualização
            const updateElement = card.querySelector('span.sc-fxwrCY, span[class*="fxwrCY"]');
            const lastUpdated = updateElement ? updateElement.textContent.trim() : '';

            // Extrair idiomas
            const languageElement = card.querySelector('p.sc-iHbSHJ, p[class*="iHbSHJ"]');
            const languages = languageElement ? languageElement.textContent.replace('Idioma(s):', '').trim() : '';

            // Criar um resumo com as informações disponíveis
            const summary = [
              experience ? `Experiência: ${experience}` : '',
              salary ? `Pretensão: ${salary}` : '',
              languages ? `Idiomas: ${languages}` : '',
              lastUpdated ? `Atualizado: ${lastUpdated}` : ''
            ].filter(Boolean).join(' | ');

            // Contato não está visível sem clicar nos botões, então deixar vazio
            const email = '';
            const phone = '';

            results.push({
              name,
              job_title: jobTitle,
              location,
              experience,
              summary: summary.substring(0, 500), // Limitar tamanho
              contact_email: email,
              contact_phone: phone,
              profile_url: profileUrl,
              last_updated: lastUpdated,
              search_query: query
            });
          } catch (err) {
            console.error(`Erro ao extrair currículo ${index + 1}:`, err);
          }
        });

        return results;
      }, searchQuery);

      console.log(`✓ Extraídos ${resumes.length} currículos da página`);
      return resumes;
    } catch (error) {
      console.error('❌ Erro ao extrair currículos:', error);
      return [];
    }
  }

  async goToNextPage(page) {
    try {
      // Procurar pelo botão de próxima página usando JavaScript
      const nextButton = await page.evaluateHandle(() => {
        // Tentar diferentes estratégias para encontrar o botão de próxima página

        // 1. Por atributo rel="next"
        let btn = document.querySelector('a[rel="next"]');
        if (btn && !btn.classList.contains('disabled')) return btn;

        // 2. Por classes de paginação
        btn = document.querySelector('.pagination .next:not(.disabled)');
        if (btn) return btn;

        // 3. Por texto do botão
        const buttons = Array.from(document.querySelectorAll('button, a'));
        btn = buttons.find(b => {
          const text = b.textContent.toLowerCase().trim();
          return (text.includes('próxim') || text.includes('next') || text === '>') &&
                 !b.disabled &&
                 !b.classList.contains('disabled') &&
                 b.getAttribute('aria-disabled') !== 'true';
        });

        return btn || null;
      });

      // Verificar se encontrou o botão
      const buttonExists = await page.evaluate(btn => btn !== null, nextButton);

      if (!buttonExists) {
        return false;
      }

      // Clicar no botão de próxima página
      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      ]);

      // Aguardar um pouco após a navegação
      await page.waitForTimeout(1000);

      return true;
    } catch (error) {
      console.log('⚠️ Não foi possível ir para a próxima página:', error.message);
      return false;
    }
  }

  async saveResumes(resumes) {
    const db = getDatabase();

    for (const resume of resumes) {
      try {
        await db.run(
          `INSERT OR REPLACE INTO resumes
           (name, job_title, location, experience, summary, contact_email, contact_phone, profile_url, last_updated, search_query)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            resume.name,
            resume.job_title,
            resume.location,
            resume.experience,
            resume.summary,
            resume.contact_email,
            resume.contact_phone,
            resume.profile_url,
            resume.last_updated,
            resume.search_query
          ]
        );
      } catch (error) {
        console.error('❌ Erro ao salvar currículo:', error.message);
      }
    }
  }

  /**
   * Save resumes using batch insert for better performance
   */
  async saveResumesBatch(resumes) {
    if (!resumes || resumes.length === 0) return;

    const db = getDatabase();

    try {
      await batchInsertResumes(db, resumes);
    } catch (error) {
      console.error('❌ Erro no batch insert, tentando salvar individualmente:', error.message);
      // Fallback to individual inserts if batch fails
      await this.saveResumes(resumes);
    }
  }

  async saveFullProfile(profileUrl, profileData, searchQuery) {
    const db = getDatabase();

    try {
      const { personalData, careerInfo, workExperiences, education, courses, languages, skills, additionalInfo } = profileData;

      // Verificar se já existe um registro com essa URL
      const existing = await db.get('SELECT id FROM resumes WHERE profile_url = ?', [profileUrl]);

      let resumeId;

      if (existing) {
        // Atualizar registro existente
        await db.run(
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

        // Limpar dados antigos relacionados
        await db.run('DELETE FROM work_experiences WHERE resume_id = ?', [resumeId]);
        await db.run('DELETE FROM education WHERE resume_id = ?', [resumeId]);
        await db.run('DELETE FROM courses WHERE resume_id = ?', [resumeId]);
        await db.run('DELETE FROM languages WHERE resume_id = ?', [resumeId]);
        await db.run('DELETE FROM skills WHERE resume_id = ?', [resumeId]);

      } else {
        // Inserir novo registro
        const result = await db.run(
          `INSERT INTO resumes
           (name, profile_url, search_query, age, date_of_birth, gender, marital_status,
            address, neighborhood, city, state, zip_code, country, contact_email, contact_phone,
            career_objective, qualifications, salary_expectation, additional_info,
            full_profile_scraped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            'Nome não extraído', // Nome será atualizado se disponível
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

      // Salvar experiências profissionais
      for (const exp of workExperiences) {
        await db.run(
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

      // Salvar formação acadêmica
      for (const edu of education) {
        await db.run(
          `INSERT INTO education
           (resume_id, degree_type, course, institution, start_date, end_date, status, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [resumeId, edu.degree_type, edu.course, edu.institution, edu.start_date, edu.end_date, edu.status, edu.display_order]
        );
      }

      // Salvar cursos
      for (const course of courses) {
        await db.run(
          `INSERT INTO courses
           (resume_id, course_name, institution, duration, completion_year, display_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [resumeId, course.course_name, course.institution, course.duration, course.completion_year, course.display_order]
        );
      }

      // Salvar idiomas
      for (const lang of languages) {
        await db.run(
          `INSERT INTO languages (resume_id, language, proficiency) VALUES (?, ?, ?)`,
          [resumeId, lang.language, lang.proficiency]
        );
      }

      // Salvar habilidades
      for (const skill of skills) {
        await db.run(
          `INSERT INTO skills (resume_id, skill_name, category) VALUES (?, ?, ?)`,
          [resumeId, skill.skill_name, skill.category]
        );
      }

      return resumeId;

    } catch (error) {
      console.error('❌ Erro ao salvar perfil completo:', error.message);

      // Marcar erro no perfil
      try {
        await db.run(
          'UPDATE resumes SET profile_scrape_error = ? WHERE profile_url = ?',
          [error.message, profileUrl]
        );
      } catch (e) {
        // Ignorar erro ao salvar erro
      }

      throw error;
    }
  }

  getProgress() {
    return this.progress;
  }

  isScraperRunning() {
    return this.isRunning;
  }

  /**
   * Retry failed profile scraping with exponential backoff
   * @param {*} page - Puppeteer page instance
   * @param {string} profileUrl - Profile URL to scrape
   * @param {number} maxRetries - Maximum number of retry attempts
   * @returns {Promise<object>} Profile data or error
   */
  async retryProfileScraping(page, profileUrl, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffDelay = exponentialBackoff(attempt, 2000, 30000);
          console.log(`  🔄 Tentativa ${attempt + 1}/${maxRetries} após ${Math.round(backoffDelay / 1000)}s...`);
          await page.waitForTimeout(backoffDelay);

          // Check if auth is still valid, re-login if needed
          const currentUrl = page.url();
          if (currentUrl.includes('login')) {
            console.log('  🔑 Sessão expirou, fazendo login novamente...');
            await this.auth.login();
          }
        }

        // Try scraping the profile
        const result = await this.scrapeProfilePage(page, profileUrl, null);

        if (result.success) {
          if (attempt > 0) {
            console.log(`  ✅ Sucesso na tentativa ${attempt + 1}`);
          }
          return result;
        } else {
          lastError = result.error;
        }

      } catch (error) {
        lastError = error.message;
        console.log(`  ⚠️ Tentativa ${attempt + 1}/${maxRetries} falhou: ${error.message}`);

        // Increment error count for adaptive delays
        this.errorCount++;

        // Check for specific error types that shouldn't be retried
        if (error.message.includes('Profile not found') ||
            error.message.includes('404')) {
          console.log(`  ❌ Perfil não encontrado, pulando retries...`);
          return { success: false, error: 'Profile not found' };
        }
      }
    }

    // All retries failed
    console.log(`  ❌ Todas as ${maxRetries} tentativas falharam`);
    return { success: false, error: lastError || 'Max retries exceeded' };
  }

  /**
   * Update scrape attempt tracking in database
   */
  async updateScrapeAttempt(profileUrl, success = false, error = null) {
    const db = getDatabase();

    try {
      if (success) {
        await db.run(
          `UPDATE resumes SET
            scrape_attempts = scrape_attempts + 1,
            last_scrape_attempt = CURRENT_TIMESTAMP,
            scrape_status = 'completed'
          WHERE profile_url = ?`,
          [profileUrl]
        );
      } else {
        await db.run(
          `UPDATE resumes SET
            scrape_attempts = scrape_attempts + 1,
            last_scrape_attempt = CURRENT_TIMESTAMP,
            scrape_status = 'failed',
            profile_scrape_error = ?
          WHERE profile_url = ?`,
          [error, profileUrl]
        );
      }
    } catch (dbError) {
      console.error('❌ Erro ao atualizar tentativas de scrape:', dbError.message);
    }
  }

  /**
   * Batch retry failed profiles
   * Finds profiles with errors and retries them
   */
  async retryFailedProfiles(maxRetries = 3, limit = 50) {
    const db = getDatabase();

    try {
      console.log('\n🔄 Iniciando retry de perfis falhados...');

      // Find failed profiles (with attempts < maxRetries)
      const failedProfiles = await db.all(
        `SELECT profile_url, name, scrape_attempts, profile_scrape_error
         FROM resumes
         WHERE scrape_status = 'failed'
         AND scrape_attempts < ?
         AND profile_url IS NOT NULL
         ORDER BY last_scrape_attempt ASC
         LIMIT ?`,
        [maxRetries, limit]
      );

      if (failedProfiles.length === 0) {
        console.log('✅ Nenhum perfil para retry');
        return { success: true, retried: 0, succeeded: 0, failed: 0 };
      }

      console.log(`📋 Encontrados ${failedProfiles.length} perfis para retry`);

      // Initialize browser if needed
      if (!this.auth.getPage()) {
        await this.auth.init();
        await this.auth.login();
      }

      const page = this.auth.getPage();
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < failedProfiles.length; i++) {
        const profile = failedProfiles[i];
        console.log(`\n📋 Retry ${i + 1}/${failedProfiles.length}: ${profile.name}`);

        const result = await this.retryProfileScraping(page, profile.profile_url, 2);

        if (result.success) {
          await this.saveFullProfile(profile.profile_url, result.data, '');
          await this.updateScrapeAttempt(profile.profile_url, true);
          succeeded++;
        } else {
          await this.updateScrapeAttempt(profile.profile_url, false, result.error);
          failed++;
        }

        // Adaptive delay between profiles
        if (i < failedProfiles.length - 1) {
          const adaptiveDelay = getAdaptiveDelay(3000, this.errorCount, this.lastRequestTime);
          await humanizedWait(page, adaptiveDelay, 0.4);
        }
      }

      console.log(`\n✅ Retry concluído: ${succeeded} sucessos, ${failed} falhas`);

      return {
        success: true,
        retried: failedProfiles.length,
        succeeded,
        failed
      };

    } catch (error) {
      console.error('❌ Erro durante retry de perfis:', error);
      return { success: false, error: error.message };
    }
  }
}
