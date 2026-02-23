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

Os arquivos gerados ficam em `dist/`. O `index.html` na raiz do repositório é o ponto de entrada do Vite; ao fazer build, use o conteúdo de `dist/` para publicar.

## Estrutura do Firebase

- **Coleção `servers`**: cada documento tem `name`, `dns`, `complement` (e opcionalmente `createdAt`, `updatedAt`). O ID do documento é o `serverId` usado em `devices.lists`.
- **Coleção `devices`**: cada documento tem `userNumber`, `paymentStatus`, `createdAt`, `expiresAt`, e `lists` (array). Cada item de `lists` tem `serverId`, `name`, `username`, `password`, `url` (URL completa da lista M3U).

A URL é montada assim: `${dns}/get.php?username=${username}&password=${password}${complement}`.
