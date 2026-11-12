# Acompanhamento de Pedidos — V7 | PV opcional

## Alteração
- O campo **Número PV** não é mais obrigatório no cadastro e na edição dos pedidos.
- Pedidos sem número PV aparecem como **Não informado** na tabela e na aba Registros.
- Um PV pode ser incluído ou alterado posteriormente em **Detalhes**, ficando registrada a alteração no histórico com responsável, data e hora.
- A verificação de PV duplicado só acontece quando um PV foi informado. Pedidos diferentes podem permanecer sem PV.
- Cliente/empresa, vendedor e equipamento continuam obrigatórios.

## Atualização online: Firebase `acompanhamentopcpass`
1. No Firebase > Firestore Database > Regras, faça backup das regras atuais.
2. Publique o `firestore.rules` desta versão V7: a validação permite `pv` como string vazia, sem alterar as permissões por setor e a exclusão lógica.
3. No GitHub do Acompanhamento de Pedidos, substitua somente `index.html` e `app.js` pelos arquivos da V7.
4. Mantenha o `firebase-config.js` atual; a configuração entregue no ZIP também aponta para `acompanhamentopcpass`.
5. Após o Pages publicar, recarregue o site com Ctrl+F5 e teste um pedido fictício sem PV. Abra Detalhes depois, informe o PV e confirme o registro no histórico.

## Compatibilidade
Os pedidos antigos, históricos, status, anexos, registros de criação/exclusão e data combinada permanecem no Firestore. Não exclua o banco ou as coleções. A publicação das regras não modifica os documentos existentes.

## Segurança
O site requer login e perfil ativo na coleção `usuarios`. PCP pode alterar apenas o status PCP e Assistência apenas o da Assistência. As regras devem ser publicadas antes de testar o cadastro sem PV.
