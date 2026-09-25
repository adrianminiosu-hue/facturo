/** Small, dependency-free XML reader for UBL documents (namespaces ignored: elements by local name). */
export type XmlNode = {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

function decode(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function localName(qname: string) {
  const i = qname.indexOf(':')
  return i >= 0 ? qname.slice(i + 1) : qname
}

export function parseXml(xml: string): XmlNode {
  const src = xml.replace(/^﻿/, '')
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; if (i < 3) break; continue }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt)
      stack[stack.length - 1].text += src.slice(lt + 9, end)
      i = end + 3
      continue
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) { i = src.indexOf('>', lt) + 1; continue }
    const gt = src.indexOf('>', lt)
    if (gt < 0) throw new Error('XML incomplet.')
    const tag = src.slice(lt + 1, gt)
    if (tag.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      i = gt + 1
      continue
    }
    const selfClosing = tag.endsWith('/')
    const body = selfClosing ? tag.slice(0, -1) : tag
    const nameMatch = body.match(/^\s*([^\s/>]+)/)
    const node: XmlNode = { name: localName(nameMatch ? nameMatch[1] : ''), attrs: {}, children: [], text: '' }
    for (const m of body.matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      node.attrs[localName(m[1])] = decode(m[3] ?? m[4] ?? '')
    }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
    i = gt + 1
  }
  const top = root.children[0]
  if (!top) throw new Error('XML gol.')
  return top
}

/** Direct children with the given local name. */
export function kids(node: XmlNode | undefined, name: string) {
  return node ? node.children.filter(c => c.name === name) : []
}

/** Follows a path of local names ("AccountingSupplierParty/Party/PartyName/Name"); first match per step. */
export function at(node: XmlNode | undefined, path: string): XmlNode | undefined {
  let current = node
  for (const step of path.split('/')) {
    if (!current) return undefined
    current = current.children.find(c => c.name === step)
  }
  return current
}

export function textAt(node: XmlNode | undefined, path: string) {
  return (at(node, path)?.text || '').trim()
}

export function numAt(node: XmlNode | undefined, path: string) {
  const n = Number(textAt(node, path))
  return Number.isFinite(n) ? n : 0
}
