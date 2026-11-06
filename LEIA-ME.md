# Acompanhamento de Pedidos — PCP e Assistência | V4 para Firebase independente

Projeto **acompanhamentopcpass**. Estes arquivos já foram configurados para seu projeto novo; não usam o projeto SAT.

## Ordem de implantação (projeto novo)

1. Firebase > Firestore Database > Criar banco de dados > edição Standard (se aparecer) > (default) > região desejada > iniciar em modo de produção. **Não use modo de teste**.
2. Firebase > Authentication > Sign-in method > ativar **Email/Password (E-mail/Senha)**. O método Anônimo não é necessário aqui.
3. Firebase > Authentication > Users > Add user: criar uma conta por pessoa. Guarde o UID de cada conta. Nunca coloque senhas nos arquivos ou no GitHub.
4. Firebase > Firestore Database > Data > Criar coleção `usuarios`. Criar um documento com ID exatamente igual ao UID de cada funcionário e campos `nome` (string, por exemplo João), `ativo` (boolean true) e `papel` (string, por exemplo PCP ou Assistência). Perfis não são autocriados pelo site.
5. Firebase > Firestore Database > Rules: copie **todo** o conteúdo do `firestore.rules` deste pacote e publique. Ele é exclusivo deste projeto, sem liberação do painel SAT. Não use `allow read, write: if true`.
6. GitHub: criar repositório separado `acompanhamento-pedidos` com visibilidade Public (requisito usual do GitHub Pages gratuito). Enviar os arquivos `index.html`, `app.js`, `firebase-config.js`, `.nojekyll` na raiz. Não há credenciais secretas nesse arquivo de configuração.
7. GitHub > Settings > Pages > Deploy from a branch > main > /(root) > Save. Abrir o link após a publicação.
8. Testar com **dados fictícios**: fazer login, cadastrar PV, alterar status PCP e Assistência, registrar comentário e anexo pequeno, testar Abrir/Baixar em outra sessão autorizada; confirmar autoria e datas no histórico.

## Como funciona

- Autenticação por email/senha e perfis pré-autorizados na coleção `/usuarios/{uid}`. O nome é obtido desse documento e associado a interações e alterações.
- Pedidos em `/pedidos`; eventos de alteração em `/pedidos/{id}/eventos`; comentários em `/pedidos/{id}/interacoes`; anexos em blocos pequenos em `/pedidos/{id}/arquivos`.
- Anexos: JPG, PNG, WEBP ou PDF, no máximo 3 por interação, até 2 MiB por arquivo. Botões Abrir e Baixar. Usa quota do **Firestore Spark**, não o Cloud Storage para novos arquivos.
- Plano gratuito tem cotas limitadas; arquivos em Base64 ocupam mais espaço e demandam diversas operações. Não há antivírus, limpeza automática de uploads parciais ou hospedagem privada no GitHub Pages gratuito.
- As regras limitam operações a perfis ativos, mas administradores do Firebase podem alterar o banco. Usuários autorizados podem ler todos os pedidos/anexos, sem segregação PCP vs Assistência.
- Neste projeto novo, não habilite autenticação anônima ou regras de acesso anônimo do SAT.
- A UI foi verificada anteriormente com simulação local; **a conexão real com este projeto novo ainda depende das configurações acima e deve ser testada.**
