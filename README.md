# Puff Manager Pro 🌿

Sito gestionale per negozi, costruito con **React + Vite** e pubblicato come **sito web** (Vercel / Netlify).

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Deploy | Vercel / Netlify (build statica `dist/`) |

---

## Funzionalità

- **Vendita** — registra vendite rapide con selezione prodotto/quantità
- **Prenotazioni** — gestisci prenotazioni clienti con stato RESERVED/SOLD/CANCELLED
- **Inventario** — visualizza e aggiorna lo stock per variante prodotto
- **Cassa** — riepilogo incassi con filtri per periodo e staff
- **Storico** — archivio vendite con ricerca e filtri avanzati
- **Promemoria** — sistema di alert interni con notifiche in tempo reale
- **Admin Panel** — gestione staff, prodotti, modelli e sapori (solo admin)

### Ruoli utente

| Ruolo | Accesso |
|-------|---------|
| `admin` | Tutto (incluso Admin Panel) |
| `staff` | Vendita, Prenotazioni, Inventario, Cassa, Storico, Promemoria |
| `helper` | Vendita, Prenotazioni, Inventario, Promemoria |

---

## Setup sviluppo locale

### Prerequisiti
- Node.js 22+
- npm 10+

### Installazione

```bash
git clone https://github.com/TUO_USERNAME/PuffManager
cd PuffManager
npm install
```

### Variabili d'ambiente

Crea un file `.env` nella root:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx
```

### Avvio

```bash
npm run dev
```

---

## Build e deploy web

```bash
npm run build
npm run preview
```

Pubblica la cartella `dist/` su **Vercel** o **Netlify**. Imposta le stesse variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nelle impostazioni del progetto (Environment Variables).

---

## Struttura progetto

```
PuffManager/
├── src/
│   ├── components/
│   │   ├── layout/Layout.tsx  # Sidebar desktop + bottom nav mobile
│   │   └── auth/
│   ├── context/AuthContext.tsx
│   ├── pages/                 # Vendita, Prenotazioni, Inventario, ...
│   ├── lib/supabase.ts
│   └── index.css              # Design system
└── index.html
```
