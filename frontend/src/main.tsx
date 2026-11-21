import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import { StartupIntro } from './StartupIntro.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StartupIntro enabled={Capacitor.isNativePlatform()}>
      <App />
    </StartupIntro>
    <Analytics />
  </StrictMode>,
)
