import { useState } from 'react'
import ToxinsView from './ToxinsView'
import GlossaryEditor from './GlossaryEditor'

type View = 'toxins' | 'glossary'

export default function App() {
  const [view, setView] = useState<View>('toxins')

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 text-sm">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          MewGuard Admin
        </div>
        <nav className="flex gap-1">
          {(['toxins', 'glossary'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                view === v
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {v}
            </button>
          ))}
        </nav>
      </header>
      {view === 'toxins' ? <ToxinsView /> : <GlossaryEditor />}
    </div>
  )
}
