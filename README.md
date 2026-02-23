# Tropical Play - Painel Admin

Painel administrativo do Tropical Play (React + Vite + Firebase).

## Funcionalidades

- **Login** com e-mail e senha (Firebase Auth)
- **Dispositivos e Listas**: listar, adicionar, editar e excluir dispositivos; cada dispositivo tem listas M3U vinculadas a um servidor (por `serverId`)
- **Configurações**: listar, adicionar, editar e excluir servidores (nome, DNS, complemento DNS)

### Atualização em tempo real ao editar servidor

Ao **editar** um servidor em Configurações e clicar em **"Salvar e atualizar todos"**:

1. O documento do servidor na coleção `servers` é atualizado (nome, DNS, complemento).
2. Todos os documentos da coleção `devices` que possuem em `lists` algum item com esse `serverId` são atualizados: a `url` de cada item é recalculada com o novo DNS e complemento, e o `name` do item é atualizado com o novo nome do servidor.

Assim, qualquer alteração no servidor reflete em todos os dispositivos que usam esse servidor.

## Como rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`. Para fazer build para produção:

```bash
npm run build
```

Os arquivos gerados ficam em `dist/`.

### Deploy (Firebase Hosting)

O projeto tem `firebase.json` configurado para publicar a pasta **`dist/`**. Para ver as alterações no ar:

1. Gere o build: `npm run build`
2. Faça o deploy: `firebase deploy` (ou `firebase deploy --only hosting`)

**Importante:** sempre rode `npm run build` antes de fazer o deploy. O deploy usa o conteúdo de `dist/`, não a pasta raiz. Se você fizer deploy sem rodar o build, o site continua com a versão antiga (ou quebra).

Se usar Vercel/Netlify: configure o comando de build como `npm run build` e a pasta de saída como `dist`.

## Estrutura do Firebase

- **Coleção `servers`**: cada documento tem `name`, `dns`, `complement` (e opcionalmente `createdAt`, `updatedAt`). O ID do documento é o `serverId` usado em `devices.lists`.
- **Coleção `devices`**: cada documento tem `userNumber`, `paymentStatus`, `createdAt`, `expiresAt`, e `lists` (array). Cada item de `lists` tem `serverId`, `name`, `username`, `password`, `url` (URL completa da lista M3U).

A URL é montada assim: `${dns}/get.php?username=${username}&password=${password}${complement}`.
