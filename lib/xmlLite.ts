export type XmlElement = {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseAttrs(tag: string) {
  const attrs: Record<string, string> = {}
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(tag))) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? '')
  }
  return attrs
}

function pushText(node: XmlElement, raw: string, cdata = false) {
  node.text += cdata ? raw : decodeEntities(raw)
}

/** Tiny XML tree builder — namespaces kept on the tag, compared via localName(). */
export function parseXml(xml: string): XmlElement {
  const cleaned = xml.replace(/^\uFEFF/, '')
  if (!/<[A-Za-z_?]/.test(cleaned)) {
    throw new Error('Fișierul nu conține XML valid.')
  }
  const root: XmlElement = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[^>]+>/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(cleaned))) {
    if (match.index > last) {
      pushText(stack[stack.length - 1], cleaned.slice(last, match.index))
    }
    last = re.lastIndex
    const token = match[0]
    if (token.startsWith('<![CDATA[')) {
      pushText(stack[stack.length - 1], match[1] || '', true)
      continue
    }
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    const nameMatch = token.match(/^<\/?([A-Za-z_][\w:.-]*)/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    if (token.startsWith('</')) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (localName(stack[i].name) === localName(name)) {
          stack.length = i
          break
        }
      }
      continue
    }
    const selfClose = /\/\s*>$/.test(token)
    const node: XmlElement = { name, attrs: parseAttrs(token), children: [], text: '' }
    stack[stack.length - 1].children.push(node)
    if (!selfClose) stack.push(node)
  }
  if (last < cleaned.length) pushText(stack[stack.length - 1], cleaned.slice(last))
  if (root.children.length === 1) return root.children[0]
  if (root.children.length === 0) {
    throw new Error('XML-ul nu conține elemente.')
  }
  return root
}

export function localName(name: string) {
  const i = name.indexOf(':')
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase()
}

export function attr(el: XmlElement, name: string) {
  const want = name.toLowerCase()
  for (const [key, value] of Object.entries(el.attrs)) {
    if (key.toLowerCase() === want || localName(key) === want) return value
  }
  return ''
}

export function findAll(el: XmlElement, name: string): XmlElement[] {
  const want = name.toLowerCase()
  const out: XmlElement[] = []
  const walk = (node: XmlElement) => {
    if (localName(node.name) === want) out.push(node)
    node.children.forEach(walk)
  }
  walk(el)
  return out
}

export function child(el: XmlElement, name: string) {
  const want = name.toLowerCase()
  return el.children.find(node => localName(node.name) === want)
}

export function textContent(el: XmlElement): string {
  return `${el.text}${el.children.map(textContent).join('')}`.replace(/\s+/g, ' ').trim()
}

export function directText(el: XmlElement) {
  return el.text.replace(/\s+/g, ' ').trim()
}

export function firstDescendantText(el: XmlElement, names: string[]) {
  for (const name of names) {
    const node = findAll(el, name)[0]
    if (!node) continue
    const text = textContent(node)
    if (text) return text
  }
  return ''
}
