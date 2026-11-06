# Acompanhamento de Pedidos — V5 | Permissões por Setor

Projeto Firebase: **acompanhamentopcpass**. Preserva todas as funcionalidades da V4, inclusive o login, comentários, anexos em blocos no Firestore, histórico de mudanças, filtros, dashboard e PDF.

## Regra de negócio

- Usuários com `/usuarios/{UID}.papel = "PCP"` podem editar **somente Status PCP**.
- Usuários com `/usuarios/{UID}.papel = "Assistência"` ou `"Assistência Técnica"` podem editar **somente Status Assistência**.
- Ambos podem visualizar os dois status, cadastrar pedidos, editar os dados gerais do PV e registrar comentários/anexos. O histórico continua sendo gerado automaticamente.
- Usuários ativos com `papel` diferente destes podem ler e comentar, mas não conseguem editar nenhum status.
- A permissão é verificada no **Firestore**, não apenas na interface. Não conceda a usuários acesso administrativo ao console Firebase, pois as regras de cliente não restringem administradores.

## Publicação / atualização (sem apagar pedidos)

1. No Firebase Console > Firestore Database > **Dados** > `usuarios` > abra o documento de cada funcionário (identificado pelo UID do Authentication). Confirme o campo `papel` com **um dos valores exatos acima**, tipo **string**. Não altere `nome` ou `ativo`. Faça isso para todos os funcionários antes de publicar as novas regras.
2. Firestore Database > **Regras**: faça backup das regras atuais. Cole **TODO** o conteúdo de `firestore.rules` deste pacote e clique em **Publicar**. Este projeto é independente do SAT.
3. No repositório GitHub do Acompanhamento de Pedidos, substitua os arquivos **`index.html`** e **`app.js`** pelos desta V5, na raiz do repositório. `firebase-config.js` e `.nojekyll` não precisam mudar.
4. Em GitHub > Settings > Pages, a publicação por branch `main`, pasta `/(root)`, continua igual. Aguarde a conclusão da implantação; atualize a página com Ctrl+F5.
5. Verifique com duas contas (uma PCP, outra Assistência), alterando os status autorizados e garantindo que o outro status é apenas visualização. Confira o registro automático no histórico.

**Atenção:** publicar o `app.js` sem as regras novas deixa a proteção apenas visual. Publicar as regras novas antes de atualizar o `app.js` pode causar erro de permissão no aplicativo antigo, pois ele tentará atualizar status dos dois setores. Atualize ambos numa mesma janela de manutenção; prefira publicar as regras e os arquivos sem usuários alterando pedidos durante a troca.

**Arquivos para GitHub:** `index.html`, `app.js`, `firebase-config.js` e `.nojekyll`.
**Somente no Firebase:** `firestore.rules`.

## Estrutura Firestore

- `usuarios/{UID}`: `nome` (string), `ativo` (boolean), `papel` (string)
- `pedidos/{ID}`: PV e status independentes
- `pedidos/{ID}/eventos`: histórico de alterações
- `pedidos/{ID}/interacoes`: comentários com autoria
- `pedidos/{ID}/arquivos`: anexos até 2 MiB/arquivo em blocos Firestore

Este projeto não depende de Storage/Blaze para novos anexos. As cotas Spark são limitadas.
