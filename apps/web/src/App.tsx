import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './Layout';
import { AndamentoPage } from './pages/AndamentoPage';
import { ContaPage } from './pages/ContaPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AndamentoPage />} />
          <Route path="entrar" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="conta" element={<ContaPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
