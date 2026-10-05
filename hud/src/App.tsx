import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ui'
import { Hoje } from './screens/Hoje'

// Hoje carrega junto; as outras telas só quando abertas (bundle inicial menor, melhor no celular).
const tela = <T extends string>(carregar: () => Promise<Record<T, React.ComponentType>>, nome: T) =>
  lazy(() => carregar().then((m) => ({ default: m[nome] })))

const Chat = tela(() => import('./screens/Chat'), 'Chat')
const Terminais = tela(() => import('./screens/Terminais'), 'Terminais')
const Skills = tela(() => import('./screens/Skills'), 'Skills')
const Rotinas = tela(() => import('./screens/Rotinas'), 'Rotinas')
const Estudos = tela(() => import('./screens/Estudos'), 'Estudos')
const MateriaTela = tela(() => import('./screens/Estudos'), 'MateriaTela')
const TopicoTela = tela(() => import('./screens/Estudos'), 'TopicoTela')
const RevisaoTela = tela(() => import('./screens/Estudos'), 'RevisaoTela')
const Vault = tela(() => import('./screens/Vault'), 'Vault')
const Biblioteca = tela(() => import('./screens/Biblioteca'), 'Biblioteca')
const TemaBibliotecaTela = tela(() => import('./screens/Biblioteca'), 'TemaBibliotecaTela')
const Recibos = tela(() => import('./screens/Recibos'), 'Recibos')
const UiCatalogo = tela(() => import('./screens/UiCatalogo'), 'UiCatalogo')

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Hoje />} />
            <Route path="chat" element={<Chat />} />
            <Route path="terminais" element={<Terminais />} />
            <Route path="skills" element={<Skills />} />
            <Route path="rotinas" element={<Rotinas />} />
            <Route path="estudos" element={<Estudos />} />
            <Route path="estudos/:materia" element={<MateriaTela />} />
            <Route path="estudos/:materia/topico" element={<TopicoTela />} />
            <Route path="estudos/:materia/revisar" element={<RevisaoTela />} />
            <Route path="biblioteca" element={<Biblioteca />} />
            <Route path="biblioteca/:slug" element={<TemaBibliotecaTela />} />
            <Route path="vault" element={<Vault />} />
            <Route path="recibos" element={<Recibos />} />
            <Route path="ui" element={<UiCatalogo />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
