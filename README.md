# 📚 Catho Collector

Aplicação web para coletar currículos do [Catho.com.br](https://www.catho.com.br/curriculos/busca/) com interface intuitiva em português brasileiro.

## 🎯 Funcionalidades

- ✅ **Autenticação automatizada** no Catho.com.br
- 🔍 **Busca por palavras-chave** (cargo, skills, etc.)
- 📊 **Coleta paginada** de currículos
- 💾 **Armazenamento em banco de dados** SQLite
- 🌐 **Interface web moderna** em React
- 📥 **Exportação** em CSV e JSON
- ⏱️ **Indicador de progresso** em tempo real
- 🎨 **Design responsivo** com Tailwind CSS

## 🏗️ Arquitetura

### Backend
- **Node.js** + Express
- **Puppeteer** para web scraping
- **SQLite** para banco de dados
- API REST com endpoints documentados

### Frontend
- **React** + Vite
- **Tailwind CSS** para estilização
- **Axios** para comunicação com API

## 📋 Pré-requisitos

- Node.js 18+ instalado
- NPM ou Yarn
- Conta ativa no Catho.com.br
- Windows, Linux ou macOS

## 🚀 Instalação

### 1. Clone o repositório (ou use os arquivos existentes)

```bash
cd catho-collector
```

### 2. Configure as credenciais

O arquivo `.env` já existe na raiz do projeto com suas credenciais:

```env
EMAIL=seu_email@catho.com.br
PASSWORD=sua_senha
```

### 3. Instale as dependências do Backend

```bash
cd backend
npm install
```

### 4. Instale as dependências do Frontend

```bash
cd ../frontend
npm install
```

## 🎮 Como Usar

### 1. Inicie o Backend

Em um terminal, navegue até a pasta `backend` e execute:

```bash
npm run dev
```

O servidor estará disponível em `http://localhost:3000`

### 2. Inicie o Frontend

Em outro terminal, navegue até a pasta `frontend` e execute:

```bash
npm run dev
```

A interface estará disponível em `http://localhost:5173`

### 3. Use a Aplicação

1. Acesse `http://localhost:5173` no navegador
2. Preencha o formulário de busca:
   - **Cargo/Palavra-chave**: Ex: "Desenvolvedor Frontend", "Analista de Dados"
   - **Número de Páginas**: Quantas páginas deseja coletar (1-20)
   - **Intervalo**: Tempo de espera entre páginas em ms (recomendado: 2000ms)
3. Clique em "🚀 Iniciar Busca"
4. Acompanhe o progresso em tempo real
5. Visualize os currículos coletados na tabela
6. Exporte os resultados em CSV ou JSON

## 📡 API Endpoints

### Scraping

#### `POST /api/scrape`
Inicia uma nova coleta de currículos

**Body:**
```json
{
  "query": "Desenvolvedor Frontend",
  "maxPages": 5,
  "delay": 2000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coleta iniciada com sucesso",
  "query": "Desenvolvedor Frontend",
  "options": {
    "maxPages": 5,
    "delay": 2000
  }
}
```

#### `GET /api/status`
Retorna o status da coleta em andamento

**Response:**
```json
{
  "isRunning": true,
  "progress": {
    "status": "running",
    "scraped": 45,
    "currentPage": 3
  }
}
```

### Currículos

#### `GET /api/resumes`
Lista todos os currículos coletados

**Query Parameters:**
- `page`: Número da página (default: 1)
- `limit`: Itens por página (default: 20)
- `search`: Busca por nome, cargo ou localização
- `searchQuery`: Filtrar por busca original

**Response:**
```json
{
  "success": true,
  "resumes": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### `GET /api/resumes/:id`
Retorna detalhes de um currículo específico

#### `DELETE /api/resumes/:id`
Exclui um currículo

#### `GET /api/statistics`
Retorna estatísticas gerais

#### `GET /api/export?format=csv&searchQuery=`
Exporta currículos em CSV ou JSON

## 🗄️ Estrutura do Banco de Dados

```sql
CREATE TABLE resumes (
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
  search_query TEXT
);
```

## 📁 Estrutura do Projeto

```
catho-collector/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # Configuração SQLite
│   │   ├── controllers/
│   │   │   ├── scrapeController.js  # Controller de scraping
│   │   │   └── resumeController.js  # Controller de currículos
│   │   ├── services/
│   │   │   ├── cathoAuth.js         # Autenticação Catho
│   │   │   ├── cathoScraper.js      # Lógica de scraping
│   │   │   └── resumeService.js     # Operações de DB
│   │   ├── routes/
│   │   │   └── index.js             # Rotas da API
│   │   └── server.js                # Servidor Express
│   ├── package.json
│   └── database.sqlite              # Banco de dados (gerado)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchForm.jsx       # Formulário de busca
│   │   │   ├── ResumeTable.jsx      # Tabela de currículos
│   │   │   ├── ProgressIndicator.jsx # Indicador de progresso
│   │   │   ├── ExportButtons.jsx    # Botões de exportação
│   │   │   └── Toast.jsx            # Notificações
│   │   ├── services/
│   │   │   └── api.js               # Cliente API
│   │   ├── App.jsx                  # Componente principal
│   │   ├── main.jsx                 # Entry point
│   │   └── index.css                # Estilos globais
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── index.html
├── .env                             # Credenciais (não commitar!)
├── .gitignore
└── README.md
```

## ⚙️ Configurações Avançadas

### Ajustar delays e limites

Edite os valores padrão em [backend/src/controllers/scrapeController.js](backend/src/controllers/scrapeController.js):

```javascript
const { query, maxPages = 5, delay = 2000 } = req.body;
```

### Modificar seletores do Catho

Se o Catho alterar o HTML, ajuste os seletores em [backend/src/services/cathoScraper.js](backend/src/services/cathoScraper.js):

```javascript
const selectors = [
  '[data-testid="resume-card"]',
  '.resume-card',
  // adicione novos seletores aqui
];
```

## 🔒 Segurança e Boas Práticas

1. **Nunca compartilhe** seu arquivo `.env`
2. **Use delays adequados** entre requisições (mínimo 2 segundos)
3. **Respeite os termos de uso** do Catho.com.br
4. **Não abuse** da coleta (evite muitas páginas por vez)
5. **Proteja os dados coletados** conforme a LGPD

## 🐛 Solução de Problemas

### Backend não inicia

```bash
cd backend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Erro de autenticação

- Verifique se as credenciais no `.env` estão corretas
- Tente fazer login manual no Catho para verificar se a conta está ativa
- O Catho pode ter alterado a página de login (verifique os seletores)
- Ative o modo debug para ver o navegador em ação (veja abaixo)

### Modo Debug (ver navegador durante scraping)

Adicione no arquivo `.env` na raiz do projeto:
```env
DEBUG_MODE=true
```

Isso fará o navegador abrir visualmente para você ver o que está acontecendo durante o login e scraping. Útil para debugar problemas de autenticação.

### Nenhum currículo coletado

- Aumente o timeout em `cathoScraper.js`
- Verifique os seletores CSS no código
- Ative o modo debug para ver o navegador
- Verifique se a busca retorna resultados no site do Catho manualmente

### Erro "Database não inicializado"

```bash
cd backend
rm database.sqlite
npm run dev  # O banco será recriado automaticamente
```

## 🚀 Produção

### Build do Frontend

```bash
cd frontend
npm run build
```

Os arquivos otimizados estarão em `frontend/dist/`

### Deploy

Para produção, considere:

1. Use variáveis de ambiente apropriadas
2. Configure HTTPS
3. Use PM2 ou similar para manter o backend rodando
4. Configure rate limiting adicional
5. Implemente logs estruturados

## 📝 Licença

MIT License - Use livremente, mas com responsabilidade.

## ⚠️ Aviso Legal

Esta ferramenta foi criada apenas para fins educacionais. O uso deve estar em conformidade com:

- Termos de Uso do Catho.com.br
- Lei Geral de Proteção de Dados (LGPD)
- Legislação brasileira aplicável

O desenvolvedor não se responsabiliza pelo uso indevido desta ferramenta.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para:

- Reportar bugs
- Sugerir melhorias
- Enviar pull requests

## 📧 Suporte

Para dúvidas ou problemas:

1. Verifique a seção de Solução de Problemas
2. Revise os logs do backend e frontend
3. Abra uma issue no repositório

---

Desenvolvido com ❤️ para facilitar a coleta de currículos
# catho
