# Puff Manager Pro 🌿

App gestionale per negozi, costruita con **React + Capacitor** e distribuita come **app nativa iOS**.

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| iOS wrapper | Capacitor v8 (SPM, senza CocoaPods) |
| CI/CD | GitHub Actions → macOS 15 runner |

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

## Build iOS

### Build web + sync Capacitor

```bash
npm run build
npx cap sync ios
```

### Aprire in Xcode

```bash
npx cap open ios
```

Poi seleziona un simulatore e premi **⌘R**.

---

## GitHub Actions CI/CD

Il workflow `.github/workflows/build-ios.yml` si attiva ad ogni push su `main`:

1. **Installa** dipendenze npm
2. **Build** Vite → `dist/`
3. **Sync** Capacitor → `ios/App/`
4. **Cache** SPM packages (risparmia ~8 min)
5. **Compila** con `xcodebuild` (unsigned, Debug)
6. **Archivia** il `.app.zip` come artifact (30 giorni)

### Secrets richiesti

Aggiungi questi secrets in **Settings → Secrets → Actions** del repository:

| Secret | Valore |
|--------|--------|
| `VITE_SUPABASE_URL` | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key pubblica di Supabase |

> **⚠️ Nota**: La build CI produce un `.app` **non firmato**. Per installarlo su dispositivi fisici o pubblicarlo su TestFlight è necessaria la firma con certificato Apple Developer.

---

## Struttura progetto

```
PuffManager/
├── .github/workflows/
│   └── build-ios.yml          # CI/CD GitHub Actions
├── ios/
│   └── App/                   # Progetto Xcode nativo (Capacitor)
│       ├── App/
│       │   ├── AppDelegate.swift
│       │   └── Info.plist     # Configurazione iOS (dark mode, ATS, etc.)
│       └── CapApp-SPM/        # Swift Package Manager dependencies
├── src/
│   ├── components/
│   │   ├── layout/Layout.tsx  # Sidebar desktop + bottom nav mobile
│   │   └── auth/
│   ├── context/AuthContext.tsx
│   ├── pages/                 # Vendita, Prenotazioni, Inventario, ...
│   ├── lib/supabase.ts
│   └── index.css              # Design system + safe area iOS
├── capacitor.config.ts        # Configurazione Capacitor/iOS
└── index.html                 # viewport-fit=cover per safe area
```
