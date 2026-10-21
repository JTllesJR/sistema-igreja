import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './Layout';
import { AndamentoPage } from './pages/AndamentoPage';
import { CongregacaoFormPage } from './pages/CongregacaoFormPage';
import { CongregacoesPage } from './pages/CongregacoesPage';
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
            <Route path="congregacoes" element={<CongregacoesPage />} />
            <Route path="congregacoes/nova" element={<CongregacaoFormPage />} />
            <Route
              path="congregacoes/:id/editar"
              element={<CongregacaoFormPage />}
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
