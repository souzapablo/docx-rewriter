import JSZip from 'jszip'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

function els(parent, tag) {
  return Array.from(parent.getElementsByTagNameNS(W, tag))
}

/**
 * Parse the DOCX ArrayBuffer and return an array of non-empty paragraphs:
 * [{ index, text, style }]
 *
 * `index` is the position of the w:p element in the document — used later
 * to map rewritten text back to the right paragraph.
 */
export async function extractParagraphs(arrayBuffer) {
  console.log('[extractParagraphs] Opening .docx as ZIP...')
  const zip = await JSZip.loadAsync(arrayBuffer)

  console.log('[extractParagraphs] Reading word/document.xml...')
  const xmlStr = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml')

  const allParagraphs = els(doc, 'p')
  console.log(`[extractParagraphs] Found ${allParagraphs.length} total <w:p> elements (including empty ones)`)

  let currentSection = null

  const result = allParagraphs.reduce((acc, p, i) => {
    const text = els(p, 't').map(t => t.textContent).join('')
    if (!text.trim()) return acc

    const styleEl = els(p, 'pStyle')[0]
    const style = styleEl?.getAttributeNS(W, 'val') ?? 'Normal'

    if (/heading/i.test(style)) currentSection = text

    const runs = els(p, 'r').map(r => {
      const runText = els(r, 't').map(t => t.textContent).join('')
      if (!runText) return null
      return {
        text: runText,
        bold: els(r, 'b').length > 0,
        italic: els(r, 'i').length > 0,
        underline: els(r, 'u').length > 0,
      }
    }).filter(Boolean)

    // Detect if this paragraph lives inside a table cell
    let inTable = false
    let ancestor = p.parentNode
    while (ancestor) {
      if (ancestor.localName === 'tc') { inTable = true; break }
      ancestor = ancestor.parentNode
    }

    acc.push({ index: i, text, style, section: currentSection, runs, inTable })
    return acc
  }, [])

  console.log(`[extractParagraphs] Extracted ${result.length} non-empty paragraphs:`)
  result.forEach(p => console.log(`  [${p.index}] style="${p.style}" | "${p.text}"`))

  return result
}

/**
 * Take the original DOCX ArrayBuffer and a list of rewritten paragraphs
 * [{ index, text }], replace the text in the XML while preserving all
 * paragraph / run formatting, and return a new ArrayBuffer.
 *
 * Strategy per paragraph:
 *  - Keep the first w:r (run) and its w:rPr (character formatting).
 *  - Set that run's w:t to the full rewritten text.
 *  - Delete all subsequent runs so no duplicate text leaks through.
 */
export async function rebuildDocx(arrayBuffer, rewrittenParagraphs) {
  console.log('[rebuildDocx] Opening .docx as ZIP...')
  const zip = await JSZip.loadAsync(arrayBuffer)

  console.log('[rebuildDocx] Reading word/document.xml...')
  const xmlStr = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml')

  const allParagraphs = els(doc, 'p')
  const body = els(doc, 'body')[0]

  function getBodyLevelNode(node) {
    let current = node
    while (current.parentNode !== body) {
      current = current.parentNode
      if (!current) return null
    }
    return current
  }

  function findBodyLevelTemplate(style) {
    return allParagraphs.find(p => {
      if (getBodyLevelNode(p) !== p) return false
      const styleEl = els(p, 'pStyle')[0]
      const pStyle = styleEl?.getAttributeNS(W, 'val') ?? 'Normal'
      return pStyle === style
    }) ?? allParagraphs.find(p => getBodyLevelNode(p) === p)
  }

  function findNearestTable(bodyLevelRef) {
    const bodyChildren = Array.from(body.childNodes)
    const refIdx = bodyChildren.indexOf(bodyLevelRef)
    const bodyTables = els(body, 'tbl').filter(t => t.parentNode === body)
    if (!bodyTables.length) return null
    return bodyTables.reduce((closest, t) => {
      const tIdx = bodyChildren.indexOf(t)
      const closestIdx = bodyChildren.indexOf(closest)
      return Math.abs(tIdx - refIdx) < Math.abs(closestIdx - refIdx) ? t : closest
    })
  }

  function buildTable(templateTable, tableRows) {
    const newTable = templateTable.cloneNode(true)
    const templateRows = els(newTable, 'tr')
    const templateRow = templateRows[0]
    templateRows.forEach(r => r.remove())

    const colCount = Math.max(...tableRows.map(r => r.length))

    // Preserve original column widths when the count matches; recalculate only when it doesn't
    const tblGrid = els(newTable, 'tblGrid')[0]
    const tblWEl = els(newTable, 'tblW')[0]
    const totalWidth = parseInt(tblWEl?.getAttributeNS(W, 'w') ?? '9360')
    const originalGridCols = tblGrid ? els(tblGrid, 'gridCol') : []
    let colWidths
    if (originalGridCols.length === colCount) {
      colWidths = originalGridCols.map(g => parseInt(g.getAttributeNS(W, 'w') ?? '0'))
    } else {
      const equalWidth = Math.floor(totalWidth / colCount)
      colWidths = Array(colCount).fill(equalWidth)
      if (tblGrid) {
        els(tblGrid, 'gridCol').forEach(g => g.remove())
        for (let i = 0; i < colCount; i++) {
          const gridCol = doc.createElementNS(W, 'w:gridCol')
          gridCol.setAttributeNS(W, 'w:w', String(equalWidth))
          tblGrid.appendChild(gridCol)
        }
      }
    }

    // Gather per-column template cells from the first row for accurate per-column formatting
    const templateCellsPerCol = els(templateRow.cloneNode(true), 'tc')

    for (const rowCells of tableRows) {
      const newRow = templateRow.cloneNode(true)
      els(newRow, 'tc').forEach(c => c.remove())

      rowCells.forEach((cellText, colIdx) => {
        const templateCell = (templateCellsPerCol[colIdx] ?? templateCellsPerCol[0]).cloneNode(true)
        const tcW = els(templateCell, 'tcW')[0]
        if (tcW) {
          tcW.setAttributeNS(W, 'w:w', String(colWidths[colIdx] ?? colWidths[0]))
          tcW.setAttributeNS(W, 'w:type', 'dxa')
        }
        const cellParagraphs = els(templateCell, 'p')
        if (cellParagraphs.length) setRunText(cellParagraphs[0], cellText)
        newRow.appendChild(templateCell)
      })
      newTable.appendChild(newRow)
    }

    console.log(`[rebuildDocx] Built table: ${tableRows.length} rows × ${colCount} cols (widths: ${colWidths.join(', ')} twips)`)
    return newTable
  }

  const updates = rewrittenParagraphs.filter(p => p.index != null)
  const insertions = rewrittenParagraphs.filter(p => p.index == null && (p.insertBefore != null || p.insertAfter != null))
  const tableAppends = rewrittenParagraphs.filter(p => p.index == null && p.appendToTable != null)
  console.log(`[rebuildDocx] Will update ${updates.length} paragraphs, insert ${insertions.length}, append ${tableAppends.length} table row group(s)`)

  function setRunText(p, newText) {
    const runs = els(p, 'r')
    if (!runs.length) return false
    const firstRun = runs[0]
    const tEls = els(firstRun, 't')
    if (tEls.length) {
      tEls[0].textContent = newText
      tEls[0].setAttributeNS(XML_NS, 'xml:space', 'preserve')
      for (let j = 1; j < tEls.length; j++) tEls[j].remove()
    }
    for (let j = 1; j < runs.length; j++) runs[j].remove()
    return true
  }

  const rewriteMap = new Map(updates.map(p => [p.index, p.text]))
  for (const [paragraphIndex, newText] of rewriteMap) {
    const p = allParagraphs[paragraphIndex]
    if (!p) {
      console.warn(`[rebuildDocx] Paragraph at index ${paragraphIndex} not found, skipping`)
      continue
    }
    console.log(`[rebuildDocx] Updating paragraph [${paragraphIndex}] → "${newText}"`)
    setRunText(p, newText)
  }

  // insertBefore: process descending so earlier insertions don't shift later indexes
  const beforeInsertions = insertions.filter(p => p.insertBefore != null).sort((a, b) => b.insertBefore - a.insertBefore)
  for (const { insertBefore, text: newText } of beforeInsertions) {
    const refP = allParagraphs[insertBefore]
    if (!refP) {
      console.warn(`[rebuildDocx] insertBefore index ${insertBefore} not found, skipping`)
      continue
    }
    console.log(`[rebuildDocx] Inserting new paragraph before [${insertBefore}]: "${newText}"`)
    const newP = refP.cloneNode(true)
    setRunText(newP, newText)
    refP.parentNode.insertBefore(newP, refP)
  }

  // insertAfter: process ascending so paragraphs appear in the correct order
  const afterInsertions = insertions.filter(p => p.insertAfter != null).sort((a, b) => a.insertAfter - b.insertAfter)
  let lastInserted = null
  let lastInsertAfterRef = null
  for (const { insertAfter, text: newText, style, tableRows } of afterInsertions) {
    const refP = allParagraphs[insertAfter]
    if (!refP) {
      console.warn(`[rebuildDocx] insertAfter index ${insertAfter} not found, skipping`)
      continue
    }
    const bodyLevelRef = getBodyLevelNode(refP)
    const anchor = (lastInsertAfterRef === bodyLevelRef && lastInserted) ? lastInserted : bodyLevelRef

    if (tableRows?.length) {
      console.log(`[rebuildDocx] Inserting new table after [${insertAfter}]`)
      const templateTable = findNearestTable(bodyLevelRef)
      if (!templateTable) {
        console.warn(`[rebuildDocx] No table found to use as template, skipping table insertion`)
        continue
      }
      const newTable = buildTable(templateTable, tableRows)
      body.insertBefore(newTable, anchor.nextSibling)
      lastInserted = newTable
    } else {
      console.log(`[rebuildDocx] Inserting new paragraph after [${insertAfter}]: "${newText}"`)
      const template = findBodyLevelTemplate(style)
      const newP = (template ?? refP).cloneNode(true)
      setRunText(newP, newText)
      body.insertBefore(newP, anchor.nextSibling)
      lastInserted = newP
    }

    lastInsertAfterRef = bodyLevelRef
  }

  // appendToTable: insert new rows into the existing table that contains the reference paragraph
  for (const { appendToTable: refIdx, tableRows } of tableAppends) {
    if (!tableRows?.length) continue
    const refP = allParagraphs[refIdx]
    if (!refP) {
      console.warn(`[rebuildDocx] appendToTable index ${refIdx} not found, skipping`)
      continue
    }

    // Walk up to find the containing <w:tr> and <w:tbl>
    let refRow = refP.parentNode
    while (refRow && refRow.localName !== 'tr') refRow = refRow.parentNode
    let refTable = refRow?.parentNode
    while (refTable && refTable.localName !== 'tbl') refTable = refTable.parentNode

    if (!refRow || !refTable) {
      console.warn(`[rebuildDocx] appendToTable [${refIdx}]: paragraph is not inside a table, skipping`)
      continue
    }

    // Use the last row of the table as the template row for formatting
    const existingRows = els(refTable, 'tr')
    const templateRow = existingRows[existingRows.length - 1]
    const templateCellsPerCol = els(templateRow.cloneNode(true), 'tc')

    console.log(`[rebuildDocx] Appending ${tableRows.length} row(s) to table containing paragraph [${refIdx}]`)

    for (const rowCells of tableRows) {
      const newRow = templateRow.cloneNode(true)
      els(newRow, 'tc').forEach(c => c.remove())
      rowCells.forEach((cellText, colIdx) => {
        const templateCell = (templateCellsPerCol[colIdx] ?? templateCellsPerCol[0]).cloneNode(true)
        const cellParagraphs = els(templateCell, 'p')
        if (cellParagraphs.length) setRunText(cellParagraphs[0], cellText)
        newRow.appendChild(templateCell)
      })
      refTable.appendChild(newRow)
    }
  }

  console.log('[rebuildDocx] Serializing updated XML back into .docx...')
  const xmlOut = new XMLSerializer().serializeToString(doc)
  zip.file('word/document.xml', xmlOut)

  console.log('[rebuildDocx] Done. Generating final ArrayBuffer.')
  return zip.generateAsync({ type: 'arraybuffer' })
}
