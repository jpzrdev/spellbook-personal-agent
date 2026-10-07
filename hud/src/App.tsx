import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ui'
import { Today } from './screens/Today'

// Today loads up front; the other screens only when opened (smaller initial bundle, better on the phone).
const screen = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const Chat = screen(() => import('./screens/Chat'), 'Chat')
const Terminals = screen(() => import('./screens/Terminals'), 'Terminals')
const Skills = screen(() => import('./screens/Skills'), 'Skills')
const Routines = screen(() => import('./screens/Routines'), 'Routines')
const Studies = screen(() => import('./screens/Studies'), 'Studies')
const SubjectScreen = screen(() => import('./screens/Studies'), 'SubjectScreen')
const TopicScreen = screen(() => import('./screens/Studies'), 'TopicScreen')
const QuizScreen = screen(() => import('./screens/Studies'), 'QuizScreen')
const Memory = screen(() => import('./screens/Memory'), 'Memory')
const Library = screen(() => import('./screens/Library'), 'Library')
const LibraryTopicScreen = screen(() => import('./screens/Library'), 'LibraryTopicScreen')
const Receipts = screen(() => import('./screens/Receipts'), 'Receipts')
const UiCatalog = screen(() => import('./screens/UiCatalog'), 'UiCatalog')

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Today />} />
            <Route path="chat" element={<Chat />} />
            <Route path="terminals" element={<Terminals />} />
            <Route path="skills" element={<Skills />} />
            <Route path="routines" element={<Routines />} />
            <Route path="studies" element={<Studies />} />
            <Route path="studies/:subject" element={<SubjectScreen />} />
            <Route path="studies/:subject/topic" element={<TopicScreen />} />
            <Route path="studies/:subject/quiz" element={<QuizScreen />} />
            <Route path="library" element={<Library />} />
            <Route path="library/:slug" element={<LibraryTopicScreen />} />
            <Route path="memory" element={<Memory />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="ui" element={<UiCatalog />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
