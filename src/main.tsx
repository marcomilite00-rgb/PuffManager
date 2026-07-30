import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Abilita la pseudoclasse :active su iOS (tutti i browser)
if (typeof window !== 'undefined') {
  document.addEventListener('touchstart', () => {}, { passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

