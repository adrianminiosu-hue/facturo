import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { isZip, readZip } from './zipRead'

/** Builds a small ZIP in memory (one stored + one deflated file), like ANAF's /descarcare archives. */
function makeZip(files: Array<{ name: string; text: string; deflate: boolean }>) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name)
    const plain = Buffer.from(f.text)
    const body = f.deflate ? deflateRawSync(plain) : plain
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(f.deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(plain.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(f.deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(plain.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

describe('readZip', () => {
  it('reads stored and deflated entries', () => {
    const zip = makeZip([
      { name: '4012345678.xml', text: '<Invoice>ok</Invoice>', deflate: true },
      { name: 'semnatura_4012345678.xml', text: '<Signature/>', deflate: false }
    ])
    expect(isZip(zip)).toBe(true)
    const entries = readZip(zip)
    expect(entries.map(e => e.name)).toEqual(['4012345678.xml', 'semnatura_4012345678.xml'])
    expect(entries[0].data.toString()).toBe('<Invoice>ok</Invoice>')
    expect(entries[1].data.toString()).toBe('<Signature/>')
  })

  it('rejects non-zip payloads', () => {
    expect(isZip(Buffer.from('{"eroare":"x"}'))).toBe(false)
    expect(() => readZip(Buffer.from('not a zip at all, definitely not'))).toThrow()
  })
})
