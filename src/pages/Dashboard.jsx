import { useState, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import toast from 'react-hot-toast'
import { auth, db } from '../firebase'
import { updateServerAndPropagateToDevices, buildListUrl } from '../lib/updateServerAndDevices'

const tabDevices = 'devices'
const tabLists = 'lists'
const tabSupport = 'support'
const tabAppUpdate = 'app_update'
const defaultPlanDays = 30

const planOptions = [
  { value: 7, label: '7 dias (Semanal)' },
  { value: 15, label: '15 dias (Quinzenal)' },
  { value: 30, label: '30 dias (Mensal)' },
  { value: 90, label: '90 dias (Trimestral)' },
  { value: 180, label: '180 dias (Semestral)' },
  { value: 365, label: '365 dias (Anual)' },
]

const defaultSupportInfo = {
  supportType: 'WhatsApp',
  supportValue: '+1 (240) 432-5144',
  supportLink: 'https://wa.me/12404325144',
  supportMessage: 'Escaneie para falar com o suporte',
  supportEmail: 'support@tropicalplaytv.com',
  isActive: true,
}

const defaultAppConfig = {
  latest_version: '1.0.3',
  version_code: '3',
  force_update: false,
  update_message: 'Nova versão disponível com melhorias',
  downloader_code: '8345921',
}

const defaultAndroidAppConfig = {
  latest_version: '1.0.3',
  version_code: '3',
  force_update: false,
  update_message: 'Nova versão Android disponível com melhorias',
  update_url: 'https://seusite.com/app.apk',
}

function normalizeSupportInfo(data = {}) {
  return {
    supportType: data.supportType || defaultSupportInfo.supportType,
    supportValue: data.supportValue || defaultSupportInfo.supportValue,
    supportLink: data.supportLink || defaultSupportInfo.supportLink,
    supportMessage: data.supportMessage || defaultSupportInfo.supportMessage,
    supportEmail: data.supportEmail || defaultSupportInfo.supportEmail,
    isActive: data.isActive ?? defaultSupportInfo.isActive,
  }
}

function normalizeAppConfig(data = {}) {
  const parsedVersionCode = Number(data.version_code)
  return {
    latest_version: String(data.latest_version || defaultAppConfig.latest_version),
    version_code: Number.isFinite(parsedVersionCode) && parsedVersionCode > 0
      ? String(parsedVersionCode)
      : defaultAppConfig.version_code,
    force_update: !!data.force_update,
    update_message: String(data.update_message || defaultAppConfig.update_message),
    downloader_code: String(data.downloader_code || defaultAppConfig.downloader_code),
  }
}

function normalizeAndroidAppConfig(data = {}) {
  const parsedVersionCode = Number(data.android_version_code)
  return {
    latest_version: String(data.android_latest_version || defaultAndroidAppConfig.latest_version),
    version_code: Number.isFinite(parsedVersionCode) && parsedVersionCode > 0
      ? String(parsedVersionCode)
      : defaultAndroidAppConfig.version_code,
    force_update: !!data.android_force_update,
    update_message: String(
      data.android_update_message || defaultAndroidAppConfig.update_message
    ),
    update_url: String(data.android_update_url || defaultAndroidAppConfig.update_url),
  }
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return '-'
  return timestamp.toDate().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function timestampToInputDate(timestamp) {
  if (!timestamp?.toDate) return ''
  const date = timestamp.toDate()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function inputDateToTimestamp(value) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return Timestamp.fromDate(parsed)
}

function getExpiryDateByPlanDays(planDays) {
  const days = Number(planDays)
  if (!Number.isFinite(days) || days <= 0) return null
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date
}

export default function Dashboard() {
  const [tab, setTab] = useState(tabDevices)
  const [devices, setDevices] = useState([])
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Device form
  const [editingDevice, setEditingDevice] = useState(null)
  const [deviceForm, setDeviceForm] = useState({
    userNumber: '',
    paymentStatus: false,
    lists: [],
    createdAt: '',
    expiresAt: '',
    planDays: String(defaultPlanDays),
  })
  const [savingDevice, setSavingDevice] = useState(false)

  // Server form (Configurações)
  const [editingServer, setEditingServer] = useState(null)
  const [serverForm, setServerForm] = useState({
    name: '',
    dns: '',
    complement: '',
  })
  const [savingServer, setSavingServer] = useState(false)

  // Support Info form (TV Support Settings)
  const [supportForm, setSupportForm] = useState(defaultSupportInfo)
  const [savedSupportInfo, setSavedSupportInfo] = useState(defaultSupportInfo)
  const [loadingSupport, setLoadingSupport] = useState(true)
  const [savingSupport, setSavingSupport] = useState(false)

  // App version control form
  const [appConfigForm, setAppConfigForm] = useState(defaultAppConfig)
  const [savedAppConfig, setSavedAppConfig] = useState(defaultAppConfig)
  const [androidAppConfigForm, setAndroidAppConfigForm] = useState(defaultAndroidAppConfig)
  const [savedAndroidAppConfig, setSavedAndroidAppConfig] = useState(defaultAndroidAppConfig)
  const [loadingAppConfig, setLoadingAppConfig] = useState(true)
  const [savingAppConfig, setSavingAppConfig] = useState(false)
  const [savingAndroidAppConfig, setSavingAndroidAppConfig] = useState(false)

  const user = auth.currentUser

  useEffect(() => {
    loadDevices()
    loadServers()
    loadSupportInfo()
    loadAppConfig()
  }, [])

  async function loadDevices() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'devices'))
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() ?? 0
        const tb = b.createdAt?.toDate?.()?.getTime() ?? 0
        return tb - ta
      })
      setDevices(list)
    } catch (e) {
      toast.error('Erro ao carregar dispositivos')
    } finally {
      setLoading(false)
    }
  }

  async function loadServers() {
    try {
      const snap = await getDocs(collection(db, 'servers'))
      setServers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      toast.error('Erro ao carregar servidores')
    }
  }

  async function loadSupportInfo() {
    setLoadingSupport(true)
    try {
      const supportRef = doc(db, 'app_settings', 'support_info')
      const supportSnap = await getDoc(supportRef)

      if (supportSnap.exists()) {
        const normalized = normalizeSupportInfo(supportSnap.data())
        setSupportForm(normalized)
        setSavedSupportInfo(normalized)
      } else {
        setSupportForm(defaultSupportInfo)
        setSavedSupportInfo(defaultSupportInfo)
      }
    } catch (e) {
      toast.error('Erro ao carregar configurações de suporte')
    } finally {
      setLoadingSupport(false)
    }
  }

  async function loadAppConfig() {
    setLoadingAppConfig(true)
    try {
      const appConfigRef = doc(db, 'app_settings', 'app_config')
      const appConfigSnap = await getDoc(appConfigRef)

      if (appConfigSnap.exists()) {
        const data = appConfigSnap.data()
        const normalized = normalizeAppConfig(data)
        const normalizedAndroid = normalizeAndroidAppConfig(data)
        setAppConfigForm(normalized)
        setSavedAppConfig(normalized)
        setAndroidAppConfigForm(normalizedAndroid)
        setSavedAndroidAppConfig(normalizedAndroid)
      } else {
        setAppConfigForm(defaultAppConfig)
        setSavedAppConfig(defaultAppConfig)
        setAndroidAppConfigForm(defaultAndroidAppConfig)
        setSavedAndroidAppConfig(defaultAndroidAppConfig)
      }
    } catch (e) {
      toast.error('Erro ao carregar configuração de versão')
    } finally {
      setLoadingAppConfig(false)
    }
  }

  const filteredDevices = devices.filter(
    (d) =>
      String(d.userNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.lists || []).some((l) =>
        String(l.name || '').toLowerCase().includes(search.toLowerCase())
      )
  )

  async function handleLogout() {
    await signOut(auth)
  }

  // ---- Device handlers ----
  function openEditDevice(device) {
    setEditingDevice(device)
    setDeviceForm({
      userNumber: device.userNumber || '',
      paymentStatus: device.paymentStatus ?? false,
      lists: (device.lists || []).map((l) => ({ ...l })),
      createdAt: timestampToInputDate(device.createdAt),
      expiresAt: timestampToInputDate(device.expiresAt),
      planDays: String(device.planDays || defaultPlanDays),
    })
  }

  function clearDeviceForm() {
    setEditingDevice(null)
    setDeviceForm({
      userNumber: '',
      paymentStatus: false,
      lists: [],
      createdAt: '',
      expiresAt: '',
      planDays: String(defaultPlanDays),
    })
  }

  async function saveDevice(e) {
    e.preventDefault()
    setSavingDevice(true)
    try {
      const listsWithUrl = await Promise.all(
        (deviceForm.lists || []).map(async (item) => {
          const server = servers.find((s) => s.id === item.serverId)
          const dns = server?.dns || ''
          const complement = server?.complement || ''
          const url = buildListUrl(
            dns,
            complement,
            item.username || '',
            item.password || ''
          )
          return {
            ...item,
            name: server?.name || item.name,
            url,
          }
        })
      )

      const payload = {
        userNumber: deviceForm.userNumber,
        paymentStatus: !!deviceForm.paymentStatus,
        lists: listsWithUrl,
        updatedAt: serverTimestamp(),
      }

      if (editingDevice) {
        const createdAt = inputDateToTimestamp(deviceForm.createdAt)
        const expiresAt = inputDateToTimestamp(deviceForm.expiresAt)
        if (createdAt) payload.createdAt = createdAt
        if (expiresAt) payload.expiresAt = expiresAt
        await updateDoc(doc(db, 'devices', editingDevice.id), payload)
        toast.success('Dispositivo atualizado')
      } else {
        const userNumber = String(deviceForm.userNumber || '').trim()
        const planDays = Number(deviceForm.planDays || defaultPlanDays)
        const expiresAtDate = getExpiryDateByPlanDays(planDays)
        if (!userNumber) {
          toast.error('Informe o número do usuário.')
          setSavingDevice(false)
          return
        }
        if (!expiresAtDate) {
          toast.error('Selecione um plano válido.')
          setSavingDevice(false)
          return
        }
        payload.createdAt = serverTimestamp()
        payload.expiresAt = Timestamp.fromDate(expiresAtDate)
        payload.planDays = planDays
        await setDoc(doc(db, 'devices', userNumber), payload)
        toast.success('Dispositivo adicionado')
      }
      clearDeviceForm()
      loadDevices()
    } catch (err) {
      console.error('Erro ao salvar dispositivo:', err)
      toast.error(err.message || 'Erro ao salvar dispositivo')
    } finally {
      setSavingDevice(false)
    }
  }

  async function deleteDevice(id) {
    if (!confirm('Excluir este dispositivo?')) return
    try {
      await deleteDoc(doc(db, 'devices', id))
      toast.success('Dispositivo excluído')
      loadDevices()
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  async function setPaymentStatus(deviceId, paid) {
    try {
      await updateDoc(doc(db, 'devices', deviceId), {
        paymentStatus: !!paid,
        updatedAt: serverTimestamp(),
      })
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, paymentStatus: !!paid } : d
        )
      )
      toast.success(paid ? 'Marcado como pago' : 'Marcado como pendente')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  // ---- Server (Configurações) handlers ----
  function openEditServer(server) {
    setEditingServer(server)
    setServerForm({
      name: server.name || '',
      dns: server.dns || '',
      complement: server.complement || '',
    })
  }

  function clearServerForm() {
    setEditingServer(null)
    setServerForm({ name: '', dns: '', complement: '' })
  }

  async function saveServer(e) {
    e.preventDefault()
    setSavingServer(true)
    try {
      if (editingServer) {
        await updateServerAndPropagateToDevices(editingServer.id, {
          name: serverForm.name,
          dns: serverForm.dns,
          complement: serverForm.complement,
        })
        toast.success(
          'Servidor atualizado. As URLs foram atualizadas em todos os dispositivos que usam este servidor.'
        )
      } else {
        await addDoc(collection(db, 'servers'), {
          name: serverForm.name,
          dns: serverForm.dns,
          complement: serverForm.complement,
          createdAt: serverTimestamp(),
        })
        toast.success('Servidor adicionado')
      }
      clearServerForm()
      loadServers()
      loadDevices()
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar servidor')
    } finally {
      setSavingServer(false)
    }
  }

  async function deleteServer(server) {
    if (!confirm(`Excluir o servidor "${server.name}"?`)) return
    try {
      await deleteDoc(doc(db, 'servers', server.id))
      toast.success('Servidor excluído')
      clearServerForm()
      loadServers()
    } catch {
      toast.error('Erro ao excluir servidor')
    }
  }

  async function saveSupportInfo(e) {
    e.preventDefault()
    setSavingSupport(true)
    try {
      const payload = {
        supportType: String(supportForm.supportType || '').trim(),
        supportValue: String(supportForm.supportValue || '').trim(),
        supportLink: String(supportForm.supportLink || '').trim(),
        supportMessage: String(supportForm.supportMessage || '').trim(),
        supportEmail: String(supportForm.supportEmail || '').trim(),
        isActive: !!supportForm.isActive,
      }

      await setDoc(
        doc(db, 'app_settings', 'support_info'),
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setSupportForm(payload)
      setSavedSupportInfo(payload)
      toast.success('Informações de suporte salvas com sucesso')
    } catch (err) {
      console.error('Erro ao salvar suporte:', err)
      toast.error('Não foi possível salvar as informações de suporte')
    } finally {
      setSavingSupport(false)
    }
  }

  async function saveAppConfig(e) {
    e.preventDefault()
    setSavingAppConfig(true)
    try {
      const versionCode = Number(appConfigForm.version_code)
      const downloaderCode = String(appConfigForm.downloader_code || '').trim()

      if (!Number.isFinite(versionCode) || versionCode <= 0) {
        toast.error('Código da versão deve ser um número válido.')
        setSavingAppConfig(false)
        return
      }

      if (!downloaderCode) {
        toast.error('Código do Downloader é obrigatório.')
        setSavingAppConfig(false)
        return
      }

      const payload = {
        latest_version: String(appConfigForm.latest_version || '').trim(),
        version_code: versionCode,
        force_update: !!appConfigForm.force_update,
        update_message: String(appConfigForm.update_message || '').trim(),
        downloader_code: downloaderCode,
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'app_settings', 'app_config'), payload, { merge: true })

      const normalized = normalizeAppConfig(payload)
      setAppConfigForm(normalized)
      setSavedAppConfig(normalized)
      toast.success('Configuração de atualização salva com sucesso')
    } catch (err) {
      console.error('Erro ao salvar configuração de atualização:', err)
      toast.error('Não foi possível salvar a configuração de atualização')
    } finally {
      setSavingAppConfig(false)
    }
  }

  async function saveAndroidAppConfig(e) {
    e.preventDefault()
    setSavingAndroidAppConfig(true)
    try {
      const versionCode = Number(androidAppConfigForm.version_code)
      const updateUrl = String(androidAppConfigForm.update_url || '').trim()

      if (!Number.isFinite(versionCode) || versionCode <= 0) {
        toast.error('Código da versão Android deve ser um número válido.')
        setSavingAndroidAppConfig(false)
        return
      }

      if (!updateUrl) {
        toast.error('Link de atualização Android é obrigatório.')
        setSavingAndroidAppConfig(false)
        return
      }

      const payload = {
        android_latest_version: String(androidAppConfigForm.latest_version || '').trim(),
        android_version_code: versionCode,
        android_force_update: !!androidAppConfigForm.force_update,
        android_update_message: String(androidAppConfigForm.update_message || '').trim(),
        android_update_url: updateUrl,
        android_updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'app_settings', 'app_config'), payload, { merge: true })

      const normalized = normalizeAndroidAppConfig(payload)
      setAndroidAppConfigForm(normalized)
      setSavedAndroidAppConfig(normalized)
      toast.success('Configuração de atualização Android salva com sucesso')
    } catch (err) {
      console.error('Erro ao salvar configuração Android:', err)
      toast.error('Não foi possível salvar a configuração Android')
    } finally {
      setSavingAndroidAppConfig(false)
    }
  }

  function getServerName(serverId) {
    return servers.find((s) => s.id === serverId)?.name || 'Servidor não encontrado'
  }

  const hasSupportChanges =
    JSON.stringify(normalizeSupportInfo(supportForm)) !==
    JSON.stringify(normalizeSupportInfo(savedSupportInfo))
  const hasAppConfigChanges =
    JSON.stringify(normalizeAppConfig(appConfigForm)) !==
    JSON.stringify(normalizeAppConfig(savedAppConfig))
  const hasAndroidAppConfigChanges =
    JSON.stringify(normalizeAndroidAppConfig(androidAppConfigForm)) !==
    JSON.stringify(normalizeAndroidAppConfig(savedAndroidAppConfig))
  const planExpiryPreview = getExpiryDateByPlanDays(deviceForm.planDays)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/10 to-red-50/10">
      <header className="border-b border-gray-200 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <img
              className="h-10 w-auto"
              src="/tropical-play.svg"
              alt="Tropical Play"
            />
            <span className="text-lg font-semibold text-gray-900">
              Tropical Play - Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary py-2"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
        <div className="glass-card">
          <nav className="flex border-b border-gray-200" aria-label="Tabs">
            <button
              type="button"
              className={`nav-tab ${tab === tabDevices ? 'nav-tab-active' : 'nav-tab-inactive'}`}
              onClick={() => setTab(tabDevices)}
            >
              Dispositivos e Listas
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === tabLists ? 'nav-tab-active' : 'nav-tab-inactive'}`}
              onClick={() => setTab(tabLists)}
            >
              Configurações
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === tabSupport ? 'nav-tab-active' : 'nav-tab-inactive'}`}
              onClick={() => setTab(tabSupport)}
            >
              Support Info
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === tabAppUpdate ? 'nav-tab-active' : 'nav-tab-inactive'}`}
              onClick={() => setTab(tabAppUpdate)}
            >
              Atualização do Aplicativo
            </button>
          </nav>

          <div className="mobile-container">
            {tab === tabDevices && (
              <div className="space-y-8">
                {/* Form add/edit device */}
                <div className="glass-card mobile-card bg-gradient-to-r from-orange-50 to-red-50">
                  <h2 className="mb-6 text-xl font-semibold text-gray-900">
                    {editingDevice ? 'Editar Dispositivo' : 'Adicionar Novo Dispositivo'}
                  </h2>
                  <form onSubmit={saveDevice} className="space-y-6">
                    {!editingDevice && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Número do Usuário
                        </label>
                        <input
                          type="text"
                          value={deviceForm.userNumber}
                          onChange={(e) =>
                            setDeviceForm((f) => ({ ...f, userNumber: e.target.value }))
                          }
                          className="input-field"
                          placeholder="123456"
                        />
                      </div>
                    )}
                    {!editingDevice && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Plano
                        </label>
                        <select
                          value={deviceForm.planDays}
                          onChange={(e) =>
                            setDeviceForm((f) => ({ ...f, planDays: e.target.value }))
                          }
                          className="input-field"
                        >
                          {planOptions.map((plan) => (
                            <option key={plan.value} value={String(plan.value)}>
                              {plan.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-gray-500">
                          Vencimento previsto:{' '}
                          <span className="font-medium text-gray-700">
                            {planExpiryPreview
                              ? planExpiryPreview.toLocaleDateString('pt-BR')
                              : '-'}
                          </span>
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Status do Pagamento
                      </label>
                      <select
                        value={deviceForm.paymentStatus ? 'true' : 'false'}
                        onChange={(e) =>
                          setDeviceForm((f) => ({
                            ...f,
                            paymentStatus: e.target.value === 'true',
                          }))
                        }
                        className="input-field"
                      >
                        <option value="false">Pendente</option>
                        <option value="true">Pago</option>
                      </select>
                    </div>
                    {editingDevice && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Data de criação
                          </label>
                          <input
                            type="date"
                            value={deviceForm.createdAt || ''}
                            onChange={(e) =>
                              setDeviceForm((f) => ({ ...f, createdAt: e.target.value }))
                            }
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Data de vencimento
                          </label>
                          <input
                            type="date"
                            value={deviceForm.expiresAt || ''}
                            onChange={(e) =>
                              setDeviceForm((f) => ({ ...f, expiresAt: e.target.value }))
                            }
                            className="input-field"
                          />
                        </div>
                      </div>
                    )}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-gray-900">Listas M3U</h3>
                      <p className="text-sm text-gray-500">
                        Adicione listas ao dispositivo. Servidor, usuário e senha são
                        preenchidos por lista.
                      </p>
                      {(deviceForm.lists || []).map((list, idx) => (
                        <div
                          key={idx}
                          className="grid gap-3 rounded-lg border border-gray-200 bg-white/50 p-3 sm:grid-cols-2 md:grid-cols-4"
                        >
                          <div>
                            <label className="text-xs text-gray-500">Servidor</label>
                            <select
                              value={list.serverId || ''}
                              onChange={(e) =>
                                setDeviceForm((f) => {
                                  const lists = [...(f.lists || [])]
                                  lists[idx] = {
                                    ...lists[idx],
                                    serverId: e.target.value,
                                    name:
                                      servers.find((s) => s.id === e.target.value)
                                        ?.name || '',
                                  }
                                  return { ...f, lists }
                                })
                              }
                              className="input-field"
                            >
                              <option value="">Selecione</option>
                              {servers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Usuário</label>
                            <input
                              type="text"
                              value={list.username || ''}
                              onChange={(e) =>
                                setDeviceForm((f) => {
                                  const lists = [...(f.lists || [])]
                                  lists[idx] = { ...lists[idx], username: e.target.value }
                                  return { ...f, lists }
                                })
                              }
                              className="input-field"
                              placeholder="Username"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Senha</label>
                            <input
                              type="text"
                              value={list.password || ''}
                              onChange={(e) =>
                                setDeviceForm((f) => {
                                  const lists = [...(f.lists || [])]
                                  lists[idx] = { ...lists[idx], password: e.target.value }
                                  return { ...f, lists }
                                })
                              }
                              className="input-field"
                              placeholder="Senha"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() =>
                                setDeviceForm((f) => ({
                                  ...f,
                                  lists: (f.lists || []).filter((_, i) => i !== idx),
                                }))
                              }
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setDeviceForm((f) => ({
                            ...f,
                            lists: [...(f.lists || []), { serverId: '', username: '', password: '' }],
                          }))
                        }
                        className="text-sm text-orange-600 hover:text-orange-800"
                      >
                        + Adicionar lista
                      </button>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-3">
                      {editingDevice && (
                        <button
                          type="button"
                          onClick={clearDeviceForm}
                          className="btn-secondary w-full sm:w-auto"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={savingDevice}
                        className="btn-primary w-full sm:w-auto"
                      >
                        {savingDevice ? 'Processando...' : editingDevice ? 'Atualizar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Device list */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
                    <input
                      type="text"
                      placeholder="Pesquisar por número de usuário ou nome da lista..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="input-field flex-1"
                    />
                    <span className="text-sm text-gray-500">
                      {filteredDevices.length}{' '}
                      {filteredDevices.length === 1 ? 'dispositivo' : 'dispositivos'} encontrado
                      {filteredDevices.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="table-container">
                    <div className="overflow-x-auto scrollbar-hide">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="table-header">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Número do Usuário
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Listas
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Criado em
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Vence em
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Status
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white/50 backdrop-blur-sm">
                          {loading ? (
                            <tr>
                              <td colSpan={6} className="table-cell text-center">
                                Carregando...
                              </td>
                            </tr>
                          ) : filteredDevices.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="table-cell text-center">
                                Nenhum dispositivo encontrado.
                              </td>
                            </tr>
                          ) : (
                            filteredDevices.map((device) => (
                              <tr key={device.id} className="table-row">
                                <td className="table-cell font-medium text-gray-900">
                                  {device.userNumber}
                                </td>
                                <td className="table-cell">
                                  <div className="space-y-1">
                                    {(device.lists || []).map((list, i) => (
                                      <div
                                        key={i}
                                        className="flex flex-col sm:flex-row sm:items-center sm:space-x-2"
                                      >
                                        <span className="text-gray-900">
                                          {getServerName(list.serverId)}
                                        </span>
                                        <a
                                          href={list.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm text-orange-600 hover:text-orange-700"
                                        >
                                          Ver Lista
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="table-cell">{formatDate(device.createdAt)}</td>
                                <td className="table-cell">{formatDate(device.expiresAt)}</td>
                                <td className="table-cell">
                                  <select
                                    value={String(device.paymentStatus)}
                                    onChange={(e) =>
                                      setPaymentStatus(device.id, e.target.value === 'true')
                                    }
                                    className={`status-badge ${
                                      device.paymentStatus ? 'status-badge-paid' : 'status-badge-pending'
                                    }`}
                                  >
                                    <option value="false">Pendente</option>
                                    <option value="true">Pago</option>
                                  </select>
                                </td>
                                <td className="table-cell space-x-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openEditDevice(device)}
                                    className="text-orange-600 transition-colors duration-200 hover:text-orange-900"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteDevice(device.id)}
                                    className="text-red-600 transition-colors duration-200 hover:text-red-900"
                                  >
                                    Excluir
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === tabLists && (
              <div className="space-y-8">
                {/* Form add/edit server */}
                <div className="glass-card mobile-card bg-gradient-to-r from-orange-50 to-red-50">
                  <h2 className="mb-6 text-xl font-semibold text-gray-900">
                    {editingServer ? 'Editar Servidor' : 'Adicionar Novo Servidor'}
                  </h2>
                  <form onSubmit={saveServer} className="space-y-6">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Nome do Servidor
                      </label>
                      <input
                        type="text"
                        value={serverForm.name}
                        onChange={(e) =>
                          setServerForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="input-field"
                        placeholder="Ex: Tropical Play TV 1"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        DNS do Servidor
                      </label>
                      <input
                        type="text"
                        value={serverForm.dns}
                        onChange={(e) =>
                          setServerForm((f) => ({ ...f, dns: e.target.value }))
                        }
                        className="input-field"
                        placeholder="http://server.tropicalplaytv.com:80"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Complemento do DNS
                      </label>
                      <input
                        type="text"
                        value={serverForm.complement}
                        onChange={(e) =>
                          setServerForm((f) => ({ ...f, complement: e.target.value }))
                        }
                        className="input-field"
                        placeholder="&type=m3u_plus&output=mpegts"
                      />
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-3">
                      {editingServer && (
                        <button
                          type="button"
                          onClick={clearServerForm}
                          className="btn-secondary w-full sm:w-auto"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={savingServer}
                        className="btn-primary w-full sm:w-auto"
                      >
                        {savingServer
                          ? 'Salvando e atualizando dispositivos...'
                          : editingServer
                            ? 'Salvar e atualizar todos'
                            : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Server list */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Servidores cadastrados</h3>
                  <div className="table-container">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="table-header">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                            Nome do servidor
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                            DNS
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                            Complemento DNS
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 md:px-6">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white/50 backdrop-blur-sm">
                        {servers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="table-cell text-center">
                              Nenhum servidor cadastrado.
                            </td>
                          </tr>
                        ) : (
                          servers.map((server) => (
                            <tr key={server.id} className="table-row">
                              <td className="table-cell font-medium text-gray-900">
                                {server.name}
                              </td>
                              <td className="table-cell text-orange-600">{server.dns}</td>
                              <td className="table-cell text-gray-600">
                                {server.complement || '-'}
                              </td>
                              <td className="table-cell space-x-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditServer(server)}
                                  className="text-orange-600 transition-colors duration-200 hover:text-orange-900"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteServer(server)}
                                  className="text-red-600 transition-colors duration-200 hover:text-red-900"
                                >
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {tab === tabSupport && (
              <div className="space-y-8">
                <div className="glass-card mobile-card bg-gradient-to-r from-orange-50 to-red-50">
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">TV Support Settings</h2>
                  <p className="mb-6 text-sm text-gray-600">
                    Configuração principal de suporte exibida no aplicativo de TV.
                  </p>

                  {loadingSupport ? (
                    <p className="text-sm text-gray-500">Carregando informações de suporte...</p>
                  ) : (
                    <form onSubmit={saveSupportInfo} className="space-y-6">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          supportType
                        </label>
                        <select
                          value={supportForm.supportType}
                          onChange={(e) =>
                            setSupportForm((f) => ({ ...f, supportType: e.target.value }))
                          }
                          className="input-field"
                        >
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Telegram">Telegram</option>
                          <option value="Email">Email</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          supportValue
                        </label>
                        <input
                          type="text"
                          value={supportForm.supportValue}
                          onChange={(e) =>
                            setSupportForm((f) => ({ ...f, supportValue: e.target.value }))
                          }
                          className="input-field"
                          placeholder="+1 (240) 432-5144"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          supportLink
                        </label>
                        <input
                          type="text"
                          value={supportForm.supportLink}
                          onChange={(e) =>
                            setSupportForm((f) => ({ ...f, supportLink: e.target.value }))
                          }
                          className="input-field"
                          placeholder="https://wa.me/12404325144"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          supportMessage
                        </label>
                        <input
                          type="text"
                          value={supportForm.supportMessage}
                          onChange={(e) =>
                            setSupportForm((f) => ({ ...f, supportMessage: e.target.value }))
                          }
                          className="input-field"
                          placeholder="Escaneie para falar com o suporte"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          supportEmail
                        </label>
                        <input
                          type="email"
                          value={supportForm.supportEmail}
                          onChange={(e) =>
                            setSupportForm((f) => ({ ...f, supportEmail: e.target.value }))
                          }
                          className="input-field"
                          placeholder="support@tropicalplaytv.com"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 p-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">isActive</p>
                          <p className="text-xs text-gray-500">
                            Ative para exibir as informações no app de TV.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={!!supportForm.isActive}
                            onChange={(e) =>
                              setSupportForm((f) => ({ ...f, isActive: e.target.checked }))
                            }
                            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                        </label>
                      </div>

                      <div className="flex justify-end">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                          <span
                            className={`text-xs ${
                              hasSupportChanges ? 'text-orange-700' : 'text-green-700'
                            }`}
                          >
                            {hasSupportChanges ? 'Existem alterações não salvas' : 'Sem alterações pendentes'}
                          </span>
                          <button
                            type="submit"
                            disabled={savingSupport}
                            className="btn-primary w-full sm:w-auto"
                          >
                            {savingSupport ? 'Salvando...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {!loadingSupport && (
                  <div className="glass-card mobile-card bg-white">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Preview salvo</h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          savedSupportInfo.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {savedSupportInfo.isActive ? 'Ativo no app de TV' : 'Inativo no app de TV'}
                      </span>
                    </div>

                    <div className="space-y-3 text-sm">
                      <p>
                        <span className="font-medium text-gray-700">supportType:</span>{' '}
                        <span className="text-gray-900">{savedSupportInfo.supportType}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">supportValue:</span>{' '}
                        <span className="text-gray-900">{savedSupportInfo.supportValue}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">supportLink:</span>{' '}
                        <a
                          href={savedSupportInfo.supportLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-orange-600 hover:text-orange-700"
                        >
                          {savedSupportInfo.supportLink}
                        </a>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">supportMessage:</span>{' '}
                        <span className="text-gray-900">{savedSupportInfo.supportMessage}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">supportEmail:</span>{' '}
                        <span className="text-gray-900">{savedSupportInfo.supportEmail}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === tabAppUpdate && (
              <div className="space-y-8">
                <div className="glass-card mobile-card bg-gradient-to-r from-orange-50 to-red-50">
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">
                    Atualização do Aplicativo - Fire TV
                  </h2>
                  <p className="mb-6 text-sm text-gray-600">
                    Controle da versão mais recente, obrigatoriedade, mensagem e código do Downloader.
                  </p>

                  {loadingAppConfig ? (
                    <p className="text-sm text-gray-500">Carregando configuração de atualização...</p>
                  ) : (
                    <form onSubmit={saveAppConfig} className="space-y-6">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Última versão
                        </label>
                        <input
                          type="text"
                          value={appConfigForm.latest_version}
                          onChange={(e) =>
                            setAppConfigForm((f) => ({ ...f, latest_version: e.target.value }))
                          }
                          className="input-field"
                          placeholder="1.0.2"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Código da versão
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={appConfigForm.version_code}
                          onChange={(e) =>
                            setAppConfigForm((f) => ({ ...f, version_code: e.target.value }))
                          }
                          className="input-field"
                          placeholder="2"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 p-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Atualização obrigatória</p>
                          <p className="text-xs text-gray-500">
                            Marque para indicar que o app deve exigir a atualização.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={!!appConfigForm.force_update}
                            onChange={(e) =>
                              setAppConfigForm((f) => ({ ...f, force_update: e.target.checked }))
                            }
                            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                        </label>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Mensagem de atualização
                        </label>
                        <input
                          type="text"
                          value={appConfigForm.update_message}
                          onChange={(e) =>
                            setAppConfigForm((f) => ({ ...f, update_message: e.target.value }))
                          }
                          className="input-field"
                          placeholder="Nova versão disponível com melhorias"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Código do Downloader
                        </label>
                        <input
                          type="text"
                          value={appConfigForm.downloader_code}
                          onChange={(e) =>
                            setAppConfigForm((f) => ({ ...f, downloader_code: e.target.value }))
                          }
                          className="input-field"
                          placeholder="8345921"
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                          <span
                            className={`text-xs ${
                              hasAppConfigChanges ? 'text-orange-700' : 'text-green-700'
                            }`}
                          >
                            {hasAppConfigChanges ? 'Existem alterações não salvas' : 'Sem alterações pendentes'}
                          </span>
                          <button
                            type="submit"
                            disabled={savingAppConfig}
                            className="btn-primary w-full sm:w-auto"
                          >
                            {savingAppConfig ? 'Salvando...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {!loadingAppConfig && (
                  <div className="glass-card mobile-card bg-white">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">
                      Dados salvos Fire TV (app_config)
                    </h3>
                    <div className="space-y-3 text-sm">
                      <p>
                        <span className="font-medium text-gray-700">latest_version:</span>{' '}
                        <span className="text-gray-900">{savedAppConfig.latest_version}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">version_code:</span>{' '}
                        <span className="text-gray-900">{savedAppConfig.version_code}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">force_update:</span>{' '}
                        <span className="text-gray-900">
                          {savedAppConfig.force_update ? 'true' : 'false'}
                        </span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">update_message:</span>{' '}
                        <span className="text-gray-900">{savedAppConfig.update_message}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">downloader_code:</span>{' '}
                        <span className="text-gray-900">{savedAppConfig.downloader_code}</span>
                      </p>
                    </div>
                  </div>
                )}

                <div className="glass-card mobile-card bg-gradient-to-r from-orange-50 to-red-50">
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">
                    Atualização do Aplicativo - Android Celular
                  </h2>
                  <p className="mb-6 text-sm text-gray-600">
                    Controle da versão Android com link direto para download da atualização.
                  </p>

                  {loadingAppConfig ? (
                    <p className="text-sm text-gray-500">Carregando configuração Android...</p>
                  ) : (
                    <form onSubmit={saveAndroidAppConfig} className="space-y-6">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Última versão (Android)
                        </label>
                        <input
                          type="text"
                          value={androidAppConfigForm.latest_version}
                          onChange={(e) =>
                            setAndroidAppConfigForm((f) => ({
                              ...f,
                              latest_version: e.target.value,
                            }))
                          }
                          className="input-field"
                          placeholder="1.0.3"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Código da versão (Android)
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={androidAppConfigForm.version_code}
                          onChange={(e) =>
                            setAndroidAppConfigForm((f) => ({
                              ...f,
                              version_code: e.target.value,
                            }))
                          }
                          className="input-field"
                          placeholder="3"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 p-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Atualização obrigatória (Android)
                          </p>
                          <p className="text-xs text-gray-500">
                            Marque para exigir atualização no app Android.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={!!androidAppConfigForm.force_update}
                            onChange={(e) =>
                              setAndroidAppConfigForm((f) => ({
                                ...f,
                                force_update: e.target.checked,
                              }))
                            }
                            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                        </label>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Mensagem de atualização (Android)
                        </label>
                        <input
                          type="text"
                          value={androidAppConfigForm.update_message}
                          onChange={(e) =>
                            setAndroidAppConfigForm((f) => ({
                              ...f,
                              update_message: e.target.value,
                            }))
                          }
                          className="input-field"
                          placeholder="Nova versão Android disponível com melhorias"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Link de atualização (Android)
                        </label>
                        <input
                          type="text"
                          value={androidAppConfigForm.update_url}
                          onChange={(e) =>
                            setAndroidAppConfigForm((f) => ({
                              ...f,
                              update_url: e.target.value,
                            }))
                          }
                          className="input-field"
                          placeholder="https://seusite.com/app.apk"
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                          <span
                            className={`text-xs ${
                              hasAndroidAppConfigChanges ? 'text-orange-700' : 'text-green-700'
                            }`}
                          >
                            {hasAndroidAppConfigChanges
                              ? 'Existem alterações Android não salvas'
                              : 'Sem alterações Android pendentes'}
                          </span>
                          <button
                            type="submit"
                            disabled={savingAndroidAppConfig}
                            className="btn-primary w-full sm:w-auto"
                          >
                            {savingAndroidAppConfig ? 'Salvando...' : 'Save Android'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {!loadingAppConfig && (
                  <div className="glass-card mobile-card bg-white">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">
                      Dados salvos Android (app_config)
                    </h3>
                    <div className="space-y-3 text-sm">
                      <p>
                        <span className="font-medium text-gray-700">android_latest_version:</span>{' '}
                        <span className="text-gray-900">{savedAndroidAppConfig.latest_version}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">android_version_code:</span>{' '}
                        <span className="text-gray-900">{savedAndroidAppConfig.version_code}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">android_force_update:</span>{' '}
                        <span className="text-gray-900">
                          {savedAndroidAppConfig.force_update ? 'true' : 'false'}
                        </span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">android_update_message:</span>{' '}
                        <span className="text-gray-900">{savedAndroidAppConfig.update_message}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">android_update_url:</span>{' '}
                        <a
                          href={savedAndroidAppConfig.update_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-orange-600 hover:text-orange-700"
                        >
                          {savedAndroidAppConfig.update_url}
                        </a>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
