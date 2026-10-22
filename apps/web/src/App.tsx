import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './Layout';
import { AndamentoPage } from './pages/AndamentoPage';
import { CongregacaoFormPage } from './pages/CongregacaoFormPage';
import { CongregacoesPage } from './pages/CongregacoesPage';
import { ContaPage } from './pages/ContaPage';
import { LoginPage } from './pages/LoginPage';
import { MembroFichaPage } from './pages/MembroFichaPage';
import { MembroFormPage } from './pages/MembroFormPage';
import { MembrosPage } from './pages/MembrosPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TrocarSenhaPage } from './pages/TrocarSenhaPage';
import { UsuarioNovoPage } from './pages/UsuarioNovoPage';
import { UsuariosPage } from './pages/UsuariosPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AndamentoPage />} />
          <Route path="entrar" element={<LoginPage />} />
          <Route element={<RequireAuth allowPasswordChangePending />}>
            <Route path="trocar-senha" element={<TrocarSenhaPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="usuarios" element={<UsuariosPage />} />
            <Route path="usuarios/novo" element={<UsuarioNovoPage />} />
            <Route path="conta" element={<ContaPage />} />
            <Route path="membros" element={<MembrosPage />} />
            <Route path="membros/novo" element={<MembroFormPage />} />
            <Route path="membros/:id" element={<MembroFichaPage />} />
            <Route path="membros/:id/editar" element={<MembroFormPage />} />
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
