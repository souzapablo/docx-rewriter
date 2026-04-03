/**
 * Send paragraphs to Claude and get them back rewritten.
 *
 * paragraphs: [{ index, text, style }]
 * instructions: string — e.g. "Make it more formal and concise"
 *
 * Returns: [{ index, text, style }] with the same shape but rewritten text.
 */
export async function rewriteWithAI(paragraphs, instructions) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY in .env')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      messages: [
        {
          role: 'user',
          content: `You are a professional document editor. Rewrite the paragraphs below following the instructions.

Instructions: ${instructions}

Each paragraph has:
- "text": the full plain text
- "style": the paragraph style (e.g. Heading1, Normal)
- "section": the heading text this paragraph falls under — use this to understand the document structure and keep rewrites contextually appropriate for that section
- "runs": the inline formatting segments — each run has "text", "bold", "italic", "underline". Use this to understand which parts of the text are emphasized, and preserve that intent in your rewrite.
- "inTable": true if the paragraph is inside a table cell, false if it is a standalone body paragraph

Rules:
- Return ONLY a valid JSON array — no markdown fences, no explanation
- Each output object must have "index", "text", and "style" — do not include "runs", "section", or "inTable" in the output
- Do not merge, split, reorder, or remove existing paragraphs unless explicitly asked
- To MODIFY an existing paragraph: return { index: <original index>, text: <new text>, style: <style> }
- To INSERT a new paragraph before an existing one: return { index: null, insertBefore: <index>, text: <new text>, style: <style> }
- To APPEND a new paragraph after an existing one: return { index: null, insertAfter: <index>, text: <new text>, style: <style> }
- To APPEND a new table: return { index: null, insertAfter: <index>, tableRows: [["cell1", "cell2", ...], ...] } — use this whenever the new content is tabular
- NEVER shift or reassign the indexes of existing paragraphs — their indexes must remain unchanged in your output.
- If an item is inserted into a list, match the style of the surrounding list items
- IMPORTANT — table-based layouts: when "inTable" is true, the paragraph lives inside a table cell used for layout. Adding new entries (e.g. a new work experience) means appending new rows to that same table, NOT inserting standalone paragraphs. Use appendToTable pointing to the index of the LAST paragraph in the last row of that table, and use tableRows to provide the new rows. Each row must mirror the column structure of the existing rows: return { index: null, appendToTable: <last_paragraph_index>, tableRows: [["cell1", "cell2", ...], ...] }

Paragraphs:
${JSON.stringify(paragraphs, null, 2)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `API error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.content[0].text
  console.log('[rewriteWithAI] Raw AI response:', raw)

  // Find the first valid JSON array in the response (AI sometimes appends extra text or a second array)
  let start = raw.indexOf('[')
  while (start !== -1) {
    let depth = 0
    let end = -1
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '[') depth++
      else if (raw[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end !== -1) {
      try { return JSON.parse(raw.slice(start, end + 1)) } catch {}
    }
    start = raw.indexOf('[', start + 1)
  }
  throw new Error('Claude did not return a valid JSON array')
}
