# Acompanhamento de Pedidos — V4 · Login + histórico + anexos grátis no Firestore

Projeto Firebase: `controle-atendimentos-sat`. GitHub Pages e Firebase Authentication (E-mail/Senha) continuam iguais.

## O que mudou nesta versão

- **Anexos no Firestore Spark** em vez de Cloud Storage: até 3 arquivos de até 2 MB por interação, JPG, PNG, WEBP ou PDF.
- Arquivos divididos em documentos de 96 KiB (convertidos para Base64). O limite técnico de 1 MiB por documento é respeitado.
- Para cada anexo: **Abrir** (nova aba) e **Baixar** dentro dos detalhes do PV. Disponível em diferentes dispositivos após login, sem depender do computador original.
- Comentários, auditoria das mudanças de status PCP/Assistência e nome do autor continuam no Firestore. Nome e data/hora vêm do Firebase, não do usuário.
- Anexos da versão anterior que foram de fato enviados ao Cloud Storage continuam legíveis *se o bucket e suas permissões estiverem disponíveis*. Novos anexos não usam Cloud Storage.

## Como atualizar

1. No GitHub Pages **do painel de pedidos** (não no painel de atendimentos), substitua `index.html` e `app.js` pelos arquivos desta V4. Preserve `firebase-config.js`.
2. No Firebase → Firestore Database → **Rules**, faça cópia das regras atuais. Publique o `firestore.rules` deste pacote **somente depois de comparar e preservar eventuais alterações posteriores**. Ele inclui a coleção de atendimentos e as regras de login/perfil do painel de pedidos.
3. Firebase → Authentication → Sign-in method → **E-mail/Senha** habilitado. Crie contas autorizadas e perfis em `usuarios/{uid}`, campos `nome` (string), `ativo` (boolean=true) e `papel` (string). O sistema **não** possui cadastro público.
4. No GitHub, Settings → Pages → main → /(root). Em site já publicado, atualize com Ctrl+F5.
5. Teste com PV fictício: faça login, envie imagem menor que 2 MB, depois clique **Abrir** e **Baixar**. Teste em outro computador com outra conta autorizada.

### Segurança e limites

- O Firestore Spark oferece uma cota gratuita de 1 GiB armazenado, 50 mil leituras e 20 mil gravações por dia e 10 GiB de saída por mês (cota compartilhada com os registros normais). **Cada arquivo consome mais que seu tamanho original**, por conta da codificação Base64 e índices. Não é armazenamento ilimitado: após esgotar a cota, as operações podem parar de funcionar.
- Este recurso é apropriado para **anexos pequenos e uso interno moderado**. Não substitui um serviço dedicado de arquivos se os anexos crescerem. Se superar 2 MB, reduza o tamanho antes do envio.
- Os arquivos são publicados somente após terminar o envio de todos os blocos. Se um envio falhar, podem sobrar documentos parciais; o administrador deve excluí-los manualmente no console. Não há limpeza automática.
- A segurança depende das regras Firestore: só contas com `usuarios/{uid}.ativo=true` podem ler/criar arquivos. E-mails/senhas não ficam no GitHub.
- Os anexos não são criptografados ponta a ponta, e pessoas com acesso administrativo ao projeto podem lê-los. Não abra PDFs ou imagens não confiáveis.
- **Limite por upload:** até 3 anexos e 2 MB por arquivo; até 24 fragmentos por arquivo. Não há antivírus, retenção automática nem recurso de exclusão de anexos pela interface.
- Os registros do Controle de Atendimentos antigo, na coleção `atendimentos`, continuam usando acesso anônimo: essa parte permanece sem restrição pessoal se não for migrada.

## Observação sobre o plano Blaze

Cloud Storage para Firebase requer Blaze desde fevereiro de 2026. Esta V4 **não usa Cloud Storage para os novos anexos**; por isso, pode utilizar a cota grátis do Firestore Spark sem cadastrar faturamento. O limite de documentos do Firestore é de 1 MiB, por isso é necessário fragmentar o conteúdo.

## Status de validação

O código foi atualizado no pacote e passou por verificações estáticas de consistência e sintaxe. Ainda é necessário publicar as regras, habilitar as contas no projeto real e executar o teste de ponta a ponta em sua conta Firebase. Não houve publicação automática.
