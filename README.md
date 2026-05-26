# Sistema de analytics para GitHub Pages

Este projeto adiciona um backend Node.js/Express para registrar visitas em tempo real de um site estatico no GitHub Pages. Ele salva os dados inicialmente em JSON local, mostra um painel moderno em `/admin` e foi organizado para trocar o armazenamento por MongoDB no futuro sem mudar as rotas publicas.

## Estrutura criada

```text
backend/
  .gitignore
  package.json
  server.js
  data/
    visitas.json
  public/
    admin.html
    admin.css
    admin.js
    tracker.js
  routes/
    analytics.js
  src/
    storage/
      jsonVisitStore.js
    utils/
      clientInfo.js
      logger.js
frontend/
  analytics.js
README.md
```

## O que o sistema registra

- IP do visitante, capturado pelo backend.
- Pais estimado por IP usando `geoip-lite` e cabecalhos de proxy quando existirem.
- Navegador, sistema operacional e tipo de dispositivo a partir do user-agent.
- Pagina acessada, titulo, origem, idioma, fuso horario e resolucao de tela.
- Horario do acesso.
- Total de visitas, visitantes unicos e visitantes online.
- Logs estruturados no console e em `backend/data/logs/analytics.log`.

## Rodar localmente

Entre na pasta do backend:

```bash
cd backend
npm install
npm run dev
```

A API ficara em:

```text
http://localhost:3000
```

O painel administrativo fica em:

```text
http://localhost:3000/admin
```

Para testar com uma pagina local, coloque antes de `</body>`:

```html
<script defer src="http://localhost:3000/tracker.js"></script>
```

Ao abrir a pagina, o script envia a visita automaticamente para `POST /visita` sem mostrar nada ao visitante.

## Endpoints

### POST `/visita`

Registra uma visita. O IP e o user-agent sao capturados automaticamente pelo backend.

Exemplo de corpo enviado pelo tracker:

```json
{
  "eventType": "pageview",
  "clientId": "gerado-no-navegador",
  "site": "https://usuario.github.io",
  "page": "/projeto/",
  "title": "Minha pagina",
  "referrer": "",
  "language": "pt-BR",
  "timezone": "America/Sao_Paulo",
  "screen": {
    "width": 1920,
    "height": 1080
  }
}
```

### GET `/stats`

Retorna totais, visitantes unicos, visitantes online, paginas mais acessadas, paises, dispositivos, navegadores e dados para o grafico.

### GET `/online`

Retorna os visitantes ativos dentro da janela configurada por `ONLINE_WINDOW_MINUTES`.

### GET `/visitas`

Retorna as visitas recentes. Use `?limit=100` para controlar o limite. O maximo aceito e 1000.

### GET `/health`

Rota simples para verificar se o backend esta online.

## Variaveis de ambiente

Configure estas variaveis no Render:

```text
NODE_VERSION=20
ALLOWED_ORIGINS=https://seu-usuario.github.io
ADMIN_TOKEN=crie-um-token-forte
ONLINE_WINDOW_MINUTES=5
SPAM_WINDOW_SECONDS=20
MAX_STORED_VISITS=50000
```

`ALLOWED_ORIGINS` aceita varias origens separadas por virgula. Para desenvolvimento, o sistema usa `*` se a variavel nao estiver definida.

Se `ADMIN_TOKEN` estiver definido, `/stats`, `/online` e `/visitas` exigem o token. O painel `/admin` pedira esse token automaticamente.

## Deploy no Render

1. Envie este projeto para um repositorio no GitHub.
2. No Render, crie um **New Web Service**.
3. Conecte o repositorio.
4. Em **Root Directory**, coloque:

```text
backend
```

5. Em **Build Command**, coloque:

```bash
npm install
```

6. Em **Start Command**, coloque:

```bash
npm start
```

7. Em **Environment Variables**, adicione:

```text
NODE_VERSION=20
ALLOWED_ORIGINS=https://seu-usuario.github.io
ADMIN_TOKEN=um-token-grande-e-secreto
ONLINE_WINDOW_MINUTES=5
SPAM_WINDOW_SECONDS=20
```

8. Depois do deploy, teste:

```text
https://nome-do-servico.onrender.com/health
https://nome-do-servico.onrender.com/admin
```

Observacao importante: JSON local funciona para comecar gratuitamente, mas em hospedagens como Render os arquivos podem ser perdidos em redeploys ou mudancas de instancia se voce nao usar disco persistente. Para historico permanente em producao, use Render Disk ou troque o storage para MongoDB Atlas. A estrutura `backend/src/storage/` ja separa essa parte para facilitar a troca.

## Conectar ao GitHub Pages

A forma mais simples e carregar o tracker direto do backend no Render. Coloque esta linha antes de `</body>` em todas as paginas HTML do seu site:

```html
<script defer src="https://nome-do-servico.onrender.com/tracker.js"></script>
```

Se preferir hospedar o script junto do GitHub Pages, use o arquivo `frontend/analytics.js` e informe a URL da API:

```html
<script defer src="./frontend/analytics.js" data-api="https://nome-do-servico.onrender.com"></script>
```

Para o seu site atual, adicione o script antes de `</body>` em:

```text
index.html
matematica.html
ia.html
programacao.html
mercado.html
carreira.html
curiosidades.html
```

Depois disso, cada acesso ao GitHub Pages sera enviado automaticamente para a API.

## Painel admin

Abra:

```text
https://nome-do-servico.onrender.com/admin
```

O painel mostra:

- Contador total de visitas.
- Visitantes unicos.
- Visitantes online em tempo real.
- Grafico de acessos dos ultimos 14 dias.
- Ranking de paginas, dispositivos e paises.
- Tabela com IP, pais, navegador, sistema operacional, dispositivo, pagina e horario.

## Protecao contra spam

O backend bloqueia registros repetidos do mesmo visitante na mesma pagina dentro da janela definida por `SPAM_WINDOW_SECONDS`. O tracker tambem envia heartbeats para manter o usuario online sem inflar o total de visitas.

## Preparado para MongoDB

Hoje as visitas sao salvas em:

```text
backend/data/visitas.json
```

Para trocar por MongoDB futuramente, crie um novo adapter em `backend/src/storage/`, mantendo estes metodos:

```js
addVisit(visit)
touchVisitor(visit)
getData()
```

Depois substitua a importacao em `backend/routes/analytics.js`. As rotas e o painel podem continuar iguais.

## Privacidade

Este sistema coleta IP e dados tecnicos do navegador. Para uso publico, inclua uma politica de privacidade no site e informe que dados de acesso sao registrados para analytics e seguranca.
