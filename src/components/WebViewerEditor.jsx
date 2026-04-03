import { useEffect, useRef, useState } from 'react'
import WebViewer from '@pdftron/webviewer'
import './WebViewerEditor.css'

const APRYSE_LICENSE_KEY = import.meta.env.VITE_APRYSE_LICENSE_KEY

export default function WebViewerEditor({ fileUrl, instanceRef, onSelectionChange }) {
  const viewerRef = useRef(null)
  const isInitialized = useRef(false)
  const [ready, setReady] = useState(false)
  const selectionByPageRef = useRef(new Map())
  const selectionTimeoutRef = useRef(null)

  // Initialize WebViewer once on mount
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    WebViewer(
      {
        path: '/lib/webviewer',
        licenseKey: APRYSE_LICENSE_KEY,
        enableOfficeEditing: true,
        disabledElements: [
          'toolbarGroup-Shapes',
          'toolbarGroup-Edit',
          'toolbarGroup-FillAndSign',
          'toolbarGroup-Forms',
        ],
      },
      viewerRef.current,
    ).then((instance) => {
      instanceRef.current = instance
      instance.UI.setTheme(instance.UI.Theme.DARK)

      const { documentViewer } = instance.Core
      documentViewer.addEventListener('textSelected', (quads, selectedText, pageNumber) => {
        if (!selectedText) {
          selectionByPageRef.current.clear();
          selectionTimeoutRef.current = null;
          return;
        }

        selectionByPageRef.current.set(pageNumber, selectedText);

        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
        }

        selectionTimeoutRef.current = setTimeout(() => {
          const fulltext = Array.from(selectionByPageRef.current.entries())
            .sort((a, b) => a[0] - b[0]) // Sort by page number
            .map(([, text]) => text) // Get the selected text
            .join('\n'); // Join with newlines
          console.log('Selected text across pages:', fulltext);
          onSelectionChange?.(fulltext || null);
          selectionByPageRef.current.clear();
          selectionTimeoutRef.current = null;
        }, 500);
      })

      setReady(true)
    })
  }, [instanceRef])

  // Load file whenever fileUrl changes and the instance is ready
  useEffect(() => {
    if (!ready || !instanceRef.current) return
    if (!fileUrl) return

    instanceRef.current.UI.loadDocument(fileUrl, { extension: 'docx' })
  }, [fileUrl, ready, instanceRef])

  return (
    <div className="webviewer-wrapper">
      {/* Placeholder shown until the user opens a file */}
      {!fileUrl && (
        <div className="webviewer-placeholder">
          <div className="placeholder-icon">📄</div>
          <p className="placeholder-title">No document open</p>
          <p className="placeholder-hint">Click <strong>Open</strong> in the toolbar to load a .docx file</p>
        </div>
      )}

      {/* The viewer div must always be in the DOM so WebViewer can mount into it */}
      <div
        ref={viewerRef}
        className="webviewer-container"
        style={{ visibility: fileUrl ? 'visible' : 'hidden' }}
      />
    </div>
  )
}
