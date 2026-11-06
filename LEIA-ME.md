# Acompanhamento de Pedidos — Versão 6 | PCP e Assistência

## Novidades
- Botão **Excluir** ao lado de Detalhes, com confirmação. Exclusão é lógica (o documento fica no Firestore).
- Aba **Registros**, à direita do Dashboard, exibe quem criou e quem excluiu cada pedido, com data e hora.
- Os pedidos excluídos deixam a lista ativa, dashboard e CSV. Na aba Registros podem ser consultados (somente leitura), mantendo histórico e anexos.
- Campo **Prazo / Data combinada** no cadastro, coluna na tabela, edição em Detalhes e registro automático no histórico de alterações.

## Preparação / publicação
Projeto Firebase: `acompanhamentopcpass` (configuração já preenchida em `firebase-config.js`).

1. Faça backup do arquivo atual `firestore.rules` no console Firebase e dos arquivos atuais do GitHub.
2. Publique **primeiro** o arquivo `firestore.rules` desta V6 em Firebase > Firestore Database > Regras.
3. No GitHub do Acompanhamento de Pedidos, atualize apenas `index.html` e `app.js` com os arquivos desta V6. Deixe `firebase-config.js` como está.
4. Confirme a publicação em Settings > Pages e recarregue com Ctrl+F5.
5. Teste com PV fictício: cadastro, data combinada, edição, histórico, exclusão, aba Registros e consulta de pedido arquivado.

## Permissões
- PCP altera apenas status PCP; Assistência altera apenas status Assistência. Outros dados (inclusive prazo combinado) podem ser editados por usuários ativos.
- **Exclusão lógica pode ser feita por qualquer usuário com perfil ativo**. Nome/UID do autor e carimbo de horário do servidor são gravados no Firestore e o evento é registrado atomicamente.
- Excluídos não podem ser alterados pelo aplicativo e não são apagados fisicamente, inclusive seus comentários e anexos.
- Regras não autorizam exclusão física a partir do cliente.

## Compatibilidade
Pedidos cadastrados nas versões anteriores, sem `agreedDate` ou `deleted`, continuam aparecendo como ativos e com prazo não definido. A nova versão preserva o histórico existente e o conteúdo dos anexos.

## Observação
A aba Registros apresenta os eventos de criação dos documentos existentes e eventos de exclusão da V6. Pedidos que tenham sido excluídos fisicamente no passado não são recuperáveis por esta atualização.
