import { inflateRawSync } from 'node:zlib'

export type ZipEntry = { name: string; data: Buffer }

/**
 * Minimal ZIP reader (stored + deflate), enough for the archives ANAF returns from /descarcare
 * (the invoice XML + ANAF's signature, or the error XML). Reads the central directory.
 */
export function readZip(input: ArrayBuffer | Buffer): ZipEntry[] {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Arhiva ZIP de la ANAF nu poate fi citită.')
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLength = buf.readUInt16LE(offset + 28)
    const extraLength = buf.readUInt16LE(offset + 30)
    const commentLength = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = buf.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const localNameLength = buf.readUInt16LE(localOffset + 26)
    const localExtraLength = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = buf.subarray(start, start + compressedSize)
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null
    if (data && !name.endsWith('/')) entries.push({ name, data })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function isZip(input: ArrayBuffer | Buffer) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50
}
