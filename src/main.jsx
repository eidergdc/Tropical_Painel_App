import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

async function cleanupLegacyServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      const legacyCacheKeys = cacheKeys.filter((key) =>
        /workbox|precache|runtime/i.test(key)
      )
      await Promise.all(legacyCacheKeys.map((key) => caches.delete(key)))
    }
  } catch (error) {
    console.warn('Falha ao limpar cache legado do Service Worker:', error)
  }
}

cleanupLegacyServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-center" />
    </BrowserRouter>
  </React.StrictMode>
)
