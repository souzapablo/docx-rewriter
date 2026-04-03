import { useState, useRef } from 'react'
import WebViewerEditor from './components/WebViewerEditor'
import Toolbar from './components/Toolbar'
import { extractParagraphs, rebuildDocx } from './utils/docxRewriter'
import { rewriteWithAI } from './utils/aiRewrite'
import './App.css'

export default function App() {
  const [currentFile, setCurrentFile] = useState(null)
  const [fileName, setFileName] = useState('Untitled Document')
  const [isSaving, setIsSaving] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)
  const [selectedText, setSelectedText] = useState(null)
  const instanceRef = useRef(null)

  function handleFileOpen(e) {
    const file = e.target.files[0]
    if (!file) return
    setCurrentFile(URL.createObjectURL(file))
    setFileName(file.name)
  }

  async function handleSave() {
    if (!instanceRef.current) return
    setIsSaving(true)
    try {
      const doc = instanceRef.current.Core.documentViewer.getDocument()
      const data = await doc.getFileData({ downloadType: 'office' })
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Failed to save the document: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRewrite() {
    if (!instanceRef.current) return

    const instructions = window.prompt(
      'How should the document be rewritten?',
      'Make it more formal and concise',
    )
    if (!instructions) return

    setIsRewriting(true)
    try {
      const doc = instanceRef.current.Core.documentViewer.getDocument()
      const fileData = await doc.getFileData({ downloadType: 'office' })

      const paragraphs = await extractParagraphs(fileData)
      const toRewrite = selectedText
        ? paragraphs.filter(p => selectedText.includes(p.text))
        : paragraphs
      const rewritten = await rewriteWithAI(toRewrite, instructions)
      const newBuffer = await rebuildDocx(fileData, rewritten)

      const blob = new Blob([newBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      // Revoke previous blob URL to free memory
      if (currentFile?.startsWith('blob:')) URL.revokeObjectURL(currentFile)

      setCurrentFile(URL.createObjectURL(blob))
    } catch (err) {
      alert(`Rewrite failed: ${err.message}`)
    } finally {
      setIsRewriting(false)
    }
  }

  function handleNewDocument() {
    setCurrentFile(null)
    setFileName('Untitled Document')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">📄</span>
          <span className="app-title">Apryse DOCX Editor</span>
        </div>
        <div className="app-filename">{fileName}</div>
        <Toolbar
          onNew={handleNewDocument}
          onOpen={handleFileOpen}
          onSave={handleSave}
          onRewrite={handleRewrite}
          isSaving={isSaving}
          isRewriting={isRewriting}
          hasDocument={!!currentFile}
        />
      </header>

      <main className="app-body">
        <WebViewerEditor
          fileUrl={currentFile}
          instanceRef={instanceRef}
          onSelectionChange={setSelectedText}
        />
      </main>
    </div>
  )
}
