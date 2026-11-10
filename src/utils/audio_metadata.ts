// Reads track info from dropped audio files so an album can be ordered and filled automatically.
// Sources: ID3v2 tags (mp3) first, then the file name ("01 - Title.mp3", "1-03 Title", "Artist - 02 - Title").

export interface AudioMeta {
  title: string
  track?: number
  disc?: number
  artist?: string
  album?: string
  genre?: string
}

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm|wma|aiff?)$/i

export const is_audio_file = (file: File) => file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name)

// ---------- file name parsing ----------

export const parse_filename = (file_name: string): AudioMeta => {
  const base = file_name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

  let m = base.match(/^(\d{1,2})-(\d{1,3})\s*[-.]?\s+(.+)$/) // "1-03 Title"
  if (m) return { disc: +m[1], track: +m[2], title: m[3].trim() }

  m = base.match(/^(\d{1,3})(?:\s*[-.)\]]\s*|\s+)(.+)$/) // "03 - Title", "03. Title", "03 Title"
  if (m) return { track: +m[1], title: m[2].trim() }

  m = base.match(/^(.+?)\s+-\s+(\d{1,3})\s*[-.]\s*(.+)$/) // "Artist - 03 - Title"
  if (m) return { artist: m[1].trim(), track: +m[2], title: m[3].trim() }

  return { title: base }
}

// ---------- ID3v2 parsing ----------

const TEXT_FRAMES: Record<string, keyof AudioMeta> = {
  TIT2: 'title', TRCK: 'track', TPOS: 'disc', TPE1: 'artist', TALB: 'album', TCON: 'genre', // v2.3 / v2.4
  TT2: 'title', TRK: 'track', TPA: 'disc', TP1: 'artist', TAL: 'album', TCO: 'genre',       // v2.2
}

const syncsafe = (b: Uint8Array, o: number) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3]
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]
const be24 = (b: Uint8Array, o: number) => (b[o] << 16) + (b[o + 1] << 8) + b[o + 2]

const decode_text = (data: Uint8Array): string => {
  if (!data.length) return ''
  const encoding = data[0]
  let bytes = data.subarray(1)
  let label = 'iso-8859-1'
  if (encoding === 3) label = 'utf-8'
  else if (encoding === 2) label = 'utf-16be'
  else if (encoding === 1) {
    label = bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-16le'
    if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) bytes = bytes.subarray(2)
  }
  try {
    return new TextDecoder(label).decode(bytes).split('\0')[0].trim()
  } catch {
    return ''
  }
}

const clean_genre = (genre: string) => {
  const text = genre.replace(/^\(\d+\)/, '').trim() // "(17)Rock" -> "Rock"
  return /^\d+$/.test(text) ? '' : text            // bare ID3v1 numeric genres are dropped
}

const read_id3 = async (file: File): Promise<Partial<AudioMeta>> => {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer())
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {} // "ID3"

  const version = head[3]
  if (version < 2 || version > 4) return {}
  const tag_size = syncsafe(head, 6)
  const buf = new Uint8Array(await file.slice(10, 10 + Math.min(tag_size, 1024 * 1024)).arrayBuffer())

  const id_len = version === 2 ? 3 : 4
  const header_len = version === 2 ? 6 : 10
  let pos = 0
  if (version >= 3 && head[5] & 0x40) pos = version === 4 ? syncsafe(buf, 0) : be32(buf, 0) + 4 // extended header

  const meta: Partial<AudioMeta> = {}
  while (pos + header_len <= buf.length) {
    if (buf[pos] === 0) break // padding
    const id = String.fromCharCode(...buf.subarray(pos, pos + id_len))
    const size = version === 4 ? syncsafe(buf, pos + 4) : version === 3 ? be32(buf, pos + 4) : be24(buf, pos + 3)
    if (size <= 0 || pos + header_len + size > buf.length) break
    const field = TEXT_FRAMES[id]
    if (field) {
      const text = decode_text(buf.subarray(pos + header_len, pos + header_len + size))
      if (field === 'track' || field === 'disc') {
        const n = parseInt(text, 10) // "3/12" -> 3
        if (!isNaN(n)) meta[field] = n
      } else if (field === 'genre') {
        const genre = clean_genre(text)
        if (genre) meta.genre = genre
      } else if (text) {
        meta[field] = text
      }
    }
    pos += header_len + size
  }
  return meta
}

export const read_audio_meta = async (file: File): Promise<AudioMeta> => {
  const from_name = parse_filename(file.name)
  let from_tags: Partial<AudioMeta> = {}
  try {
    from_tags = await read_id3(file)
  } catch {
    // unreadable tags: fall back to the file name
  }
  return { ...from_name, ...from_tags, title: from_tags.title || from_name.title }
}

// ---------- ordering ----------

export const compare_tracks = (
  a: { meta?: AudioMeta; file?: File },
  b: { meta?: AudioMeta; file?: File },
) =>
  (a.meta?.disc ?? 1) - (b.meta?.disc ?? 1) ||
  (a.meta?.track ?? Number.MAX_SAFE_INTEGER) - (b.meta?.track ?? Number.MAX_SAFE_INTEGER) ||
  (a.file?.name ?? '').localeCompare(b.file?.name ?? '', undefined, { numeric: true, sensitivity: 'base' })

// Most frequent non-empty value (e.g. the album name shared by most dropped files).
export const most_common = (values: (string | undefined)[]) => {
  const counts = new Map<string, number>()
  values.forEach(v => v && counts.set(v, (counts.get(v) || 0) + 1))
  let best: string | undefined
  counts.forEach((count, value) => { if (!best || count > counts.get(best)!) best = value })
  return best
}

// ---------- drag & drop (files and whole folders) ----------

const read_entry = async (entry: any): Promise<File[]> => {
  if (entry.isFile) return new Promise(resolve => entry.file((f: File) => resolve([f]), () => resolve([])))
  if (!entry.isDirectory) return []
  const reader = entry.createReader()
  const files: File[] = []
  // readEntries returns results in batches until an empty batch
  for (;;) {
    const batch: any[] = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])))
    if (!batch.length) break
    for (const child of batch) files.push(...(await read_entry(child)))
  }
  return files
}

export const files_from_drop = async (data: DataTransfer): Promise<File[]> => {
  const entries = Array.from(data.items || [])
    .map(item => (item.kind === 'file' && (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null))
    .filter(Boolean)
  if (!entries.length) return Array.from(data.files || [])
  const nested = await Promise.all(entries.map(read_entry))
  return nested.flat()
}
