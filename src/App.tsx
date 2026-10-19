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
import { SiteGatekeeper } from './components/auth/SiteGatekeeper';
import { AnimatePresence, motion } from 'motion/react';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2 } }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <Routes location={location}>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/vendita" element={<Vendita />} />
            <Route path="/prenotazioni" element={<Prenotazioni />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/promemoria" element={<Promemoria />} />
            <Route path="/cassa" element={<Cassa />} />
            <Route path="/storico" element={<Storico />} />
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
      <SiteGatekeeper>
        <AuthProvider>
          <ToastProvider>
            <LayoutProvider>
              <Layout>
                <AnimatedRoutes />
              </Layout>
            </LayoutProvider>
          </ToastProvider>
        </AuthProvider>
      </SiteGatekeeper>
    </BrowserRouter>
  );
}

export default App;
