import { useRef } from 'react'
import './Toolbar.css'

export default function Toolbar({ onNew, onOpen, onSave, onRewrite, isSaving, isRewriting, hasDocument }) {
  const fileInputRef = useRef(null)

  return (
    <div className="toolbar">
      <button className="toolbar-btn" onClick={onNew} title="New Document">
        New
      </button>

      <button
        className="toolbar-btn"
        onClick={() => fileInputRef.current?.click()}
        title="Open .docx file"
      >
        Open
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.doc"
          style={{ display: 'none' }}
          onChange={onOpen}
        />
      </button>

      <button
        className="toolbar-btn toolbar-btn--ai"
        onClick={onRewrite}
        disabled={!hasDocument || isRewriting || isSaving}
        title="Rewrite document text with AI"
      >
        {isRewriting ? 'Rewriting...' : 'Rewrite with AI'}
      </button>

      <button
        className="toolbar-btn toolbar-btn--primary"
        onClick={onSave}
        disabled={!hasDocument || isSaving || isRewriting}
        title="Download edited .docx"
      >
        {isSaving ? 'Saving...' : 'Save .docx'}
      </button>
    </div>
  )
}
