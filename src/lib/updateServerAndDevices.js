import { doc, updateDoc, getDocs, collection, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Monta a URL da lista M3U a partir do DNS e complemento do servidor + username/password do item.
 * Formato: ${dns}/get.php?username=${username}&password=${password}${complement}
 */
export function buildListUrl(dns, complement, username, password) {
  const base = dns.replace(/\/$/, '')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}/get.php${sep}username=${username}&password=${password}${complement || ''}`
}

/**
 * Ao salvar um servidor (edição), atualiza o documento em `servers` e propaga a nova URL
 * para todos os itens em `devices.lists` que usam esse serverId.
 */
export async function updateServerAndPropagateToDevices(serverId, serverData) {
  const { name, dns, complement } = serverData

  // 1) Atualizar o documento do servidor na coleção servers
  const serverRef = doc(db, 'servers', serverId)
  await updateDoc(serverRef, {
    name: name || '',
    dns: dns || '',
    complement: complement || '',
    updatedAt: serverTimestamp(),
  })

  // 2) Buscar todos os devices e montar lista de atualizações
  const devicesSnap = await getDocs(collection(db, 'devices'))
  const toUpdate = []

  devicesSnap.docs.forEach((deviceDoc) => {
    const data = deviceDoc.data()
    const lists = data.lists || []

    const updatedLists = lists.map((item) => {
      if (item.serverId !== serverId) return item

      const newUrl = buildListUrl(
        dns,
        complement,
        item.username || '',
        item.password || ''
      )
      return {
        ...item,
        name: name || item.name,
        url: newUrl,
      }
    })

    const hasThisServer = lists.some((item) => item.serverId === serverId)
    if (hasThisServer) {
      toUpdate.push({ id: deviceDoc.id, lists: updatedLists })
    }
  })

  // Firestore batch permite no máximo 500 operações
  const BATCH_SIZE = 500
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = toUpdate.slice(i, i + BATCH_SIZE)
    chunk.forEach(({ id, lists }) => {
      batch.update(doc(db, 'devices', id), { lists })
    })
    await batch.commit()
  }
  return { updatedDevices: toUpdate.length }
}
