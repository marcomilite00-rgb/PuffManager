import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ToastProvider } from './components/ui/ToastProvider';
import { LayoutProvider } from './context/LayoutContext';
import { Login } from './pages/Login';
import { Vendita } from './pages/Vendita';
import { Prenotazioni } from './pages/Prenotazioni';
import { Inventario } from './pages/Inventario';
import { Promemoria } from './pages/Promemoria';
import { Cassa } from './pages/Cassa';
import { Storico } from './pages/Storico';
import { Admin } from './pages/Admin';
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense } from 'react';

const ParticleBackground = lazy(() => import('./components/3d/ParticleBackground'));

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }}
        exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      >
        <Suspense fallback={null}>
          <ParticleBackground />
        </Suspense>
        <Routes location={location}>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/vendita" element={<Vendita />} />
            <Route path="/prenotazioni" element={<Prenotazioni />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/promemoria" element={<Promemoria />} />
            <Route element={<ProtectedRoute allowedRoles={['admin', 'staff']} />}>
              <Route path="/cassa" element={<Cassa />} />
              <Route path="/storico" element={<Storico />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="/" element={<Navigate to="/inventario" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/inventario" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <LayoutProvider>
          <Layout>
            <AnimatedRoutes />
        </Layout>
          </LayoutProvider>
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
