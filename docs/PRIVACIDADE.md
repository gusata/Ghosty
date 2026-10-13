# Privacidade e dados locais do Edge Ghosty

Esta página descreve o comportamento atual da versão Windows. O Edge Ghosty não envia telemetria de uso ao desenvolvedor.

## Dados que ficam neste dispositivo

- Preferências, atalhos, tema e acessórios do Ghosty, equipe selecionada da Vercel, itens do Bolso e texto que você escolhe guardar ficam no armazenamento local do WebView.
- O Bolso guarda caminhos de arquivos; não move nem apaga os originais. Texto guardado é mantido localmente até você removê-lo.
- O resumo do Codex mantém somente contagens de sessões, tarefas, etapas, aprovações e duração estimada. O histórico é local e eventos com mais de 90 dias são removidos quando o resumo é atualizado.
- O ticker do Codex mantém em memória no máximo 12 eventos recentes: tipo de etapa, nome da ferramenta ou subagente e horário. Ele some ao fechar o aplicativo. Não inclui prompt, resposta, comando, resultado de ferramenta nem identificador da sessão.
- O helper usa uma fila temporária local com tipo de evento, horário, nome/tipo da ferramenta ou subagente e identificador da sessão para correlacionar etapas. O Ghosty apaga cada arquivo de evento ao consumi-lo; o identificador não passa para o ticker nem para o resumo persistido.
- Durante um pedido explícito de aprovação, a fila também mantém um identificador de decisão e uma descrição curta da ação para mostrar o pedido. Essa descrição é apagada quando o evento é consumido, resolvido, cancelado ou expira; não entra no ticker nem no resumo de 7 dias.
- O rascunho do chat fica local enquanto o usuário trabalha no popup. A transcrição local é encerrada/limpa ao fechar ou reiniciar a conversa, conforme o fluxo do chat.

## Conexões opcionais

### GitHub

O usuário cola um token pessoal. O Ghosty valida o token e guarda o segredo no Gerenciador de Credenciais do Windows. Consulta PRs do usuário, revisões pedidas e verificações de CI pela API do GitHub; não cria, edita, aprova nem mescla PRs. Os resultados carregados ficam em memória durante a execução.

### Vercel

O usuário cola um token e pode informar um ID de equipe. O token fica no Gerenciador de Credenciais do Windows; o ID da equipe, que não é segredo, fica nas preferências locais. O Ghosty valida a conta e consulta os cinco deploys mais recentes pela API da Vercel; não inicia, cancela ou altera deploys. Os resultados ficam em memória durante a execução.

### Google Workspace

O Edge Ghosty usa o Client ID OAuth de aplicativo para computador configurado pelo publicador e autoriza a conta Google no navegador do sistema. O usuário não precisa criar um projeto nem um Client ID no Google Cloud. O Ghosty usa OAuth 2.0 com PKCE e retorno por loopback em uma porta local temporária. Tokens de acesso e renovação ficam no Gerenciador de Credenciais do Windows. Desconectar apaga a credencial deste dispositivo, mas não revoga a concessão na Conta Google.

Gmail consulta mensagens não lidas da caixa de entrada e solicita somente os cabeçalhos `From` e `Subject` em modo metadata; o Ghosty não baixa nem envia o corpo das mensagens. A integração pode marcar como lida ou arquivar uma mensagem depois da ação explícita do usuário. A API exige o escopo `gmail.modify` para essas ações, que também permite escrever/enviar; o Ghosty não implementa envio de mensagens. Agenda consulta eventos dos próximos 14 dias com escopo somente de leitura. Tarefas lista tarefas pendentes e permite criar ou concluir itens com o escopo de Tarefas.

O snapshot Google permanece em memória durante a execução. Notificações resumidas, que podem conter remetente/assunto ou título de tarefa/compromisso, ficam no armazenamento local do WebView, limitadas a 50 itens. Não são enviadas ao chat do Codex. Os dados deixam de atualizar quando **Pausar atualizações** está ativo na bandeja. Para remover também a autorização do provedor, use a página de permissões da Conta Google.

### Clima

O usuário escolhe manualmente uma cidade. O nome consultado e as coordenadas dessa cidade são enviados ao serviço Open-Meteo para geocodificação e previsão; não há leitura de localização do Windows nem GPS. A localização escolhida e o snapshot de previsão ficam no armazenamento local do WebView. A interface atribui os dados meteorológicos ao Open-Meteo.

### Chat rápido e arquivos do Bolso

As mensagens enviadas no chat são encaminhadas pelo app-server local ao serviço Codex/OpenAI autenticado pela conta do usuário e ficam sujeitas às políticas desse serviço. O Ghosty encerra a conversa local ao fechar o popup ou iniciar outra conversa; isso não controla a retenção do provedor.

Ao escolher **Perguntar ao Ghosty** para um texto do Bolso, o prompt inclui no máximo os primeiros 6.000 caracteres. O Bolso guarda no máximo 50.000 caracteres desse texto. Para um arquivo, o prompt inclui nome, caminho e tamanho medido localmente; o app não lê, copia nem anexa os bytes automaticamente. Arquivos acima de 25 MiB recebem um aviso para preferir uma cópia menor ou um trecho. Esse valor é uma recomendação de uso, não uma barreira: se o usuário aprovar separadamente um pedido de leitura do Codex, o conteúdo acessado poderá ser processado pelo serviço Codex/OpenAI.

GitHub, Vercel e Google Workspace atualizam ao conectar, a cada cinco minutos e quando o usuário pede uma atualização. O clima atualiza a cada cinco minutos quando há uma cidade salva. A opção **Pausar atualizações** na bandeja bloqueia esses refreshes até retomar. Ela também impede validar tokens novos do GitHub e da Vercel. Desconectar essas integrações remove os tokens e limpa o cache local correspondente.

## Hooks locais do Codex

Conectar o Codex altera o arquivo `hooks.json` do usuário. Antes de gravar, o Ghosty mostra as entradas próprias que serão adicionadas, atualizadas ou removidas. A confirmação é explícita; antes de uma alteração existente, é criado um backup datado. Se o arquivo mudar depois da prévia, a gravação é cancelada e a revisão precisa ser refeita. Entradas de outros hooks são preservadas.

O helper local observa nomes/tipos de eventos e ferramentas para mostrar presença. `PermissionRequest` também pode manter uma descrição curta da ação enquanto aguarda a escolha explícita do usuário no Ghosty. O Codex continua controlando seus prompts, respostas e resultados; o Ghosty não os grava nos eventos de presença.

## Serviços externos usados

- GitHub: `api.github.com`, somente para as consultas acima.
- Vercel: `api.vercel.com`, somente para identificar a conta e consultar deploys.
- Google: OAuth no navegador, `oauth2.googleapis.com`, `openidconnect.googleapis.com`, Gmail API, Google Calendar API e Google Tasks API, conforme os painéis ativados pelo usuário.
- Open-Meteo: geocodificação e previsão para a cidade escolhida manualmente.
- ChatGPT/Codex: OAuth, mensagens e operações explicitamente autorizadas pelo usuário no chat rápido.
- O navegador abre URLs que o usuário escolhe ou que o chat retorna de acordo com as ações autorizadas.

O Ghosty não configura flags privadas de navegador no WebView2. O app mantém seu conteúdo local no WebView e não adiciona um serviço próprio de analytics.
