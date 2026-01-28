
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './pages/Login';

import { Vendita } from './pages/Vendita';
import { Prenotazioni } from './pages/Prenotazioni';
import { Inventario } from './pages/Inventario';
import { Promemoria } from './pages/Promemoria';
import { Cassa } from './pages/Cassa';
import { Storico } from './pages/Storico';
import { Admin } from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
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
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
