import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'

/**
 * 内容安全扫描 — 基于文件魔数（magic bytes）的轻量签名校验
 *
 * 目标：
 * 1. 拦截可执行文件 / 脚本伪装成文档（如 .pdf 实为 PE/ELF/脚本）
 * 2. 校验声明扩展名与真实文件头一致，防止 MIME/扩展名欺骗
 *
 * 注意：这不是完整的杀毒方案，而是抵御常见伪装上传的第一道防线。
 */

interface Signature {
  ext: string
  magic: number[][]
  offset?: number
}

// 已知文档/音频类型的魔数特征
const KNOWN_SIGNATURES: Signature[] = [
  { ext: 'pdf', magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  // ZIP 容器（docx/xlsx/pptx 实质都是 zip）
  { ext: 'zip', magic: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]] },
  // 旧版 Office 复合文档（doc/xls/ppt）
  { ext: 'ole', magic: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]] },
  { ext: 'mp3', magic: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]] }, // ID3 / MPEG frame
  { ext: 'wav', magic: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF
  { ext: 'ogg', magic: [[0x4f, 0x67, 0x67, 0x53]] }, // OggS
  { ext: 'm4a', magic: [[0x66, 0x74, 0x79, 0x70]], offset: 4 }, // ftyp at offset 4
]

// 扩展名 → 期望的底层容器签名
const EXT_TO_SIGNATURE: Record<string, string[]> = {
  pdf: ['pdf'],
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  doc: ['ole'],
  xls: ['ole'],
  ppt: ['ole'],
  mp3: ['mp3'],
  wav: ['wav'],
  ogg: ['ogg'],
  m4a: ['m4a', 'mp3'],
  webm: ['webm'],
}

// 危险特征：可执行文件 / 脚本，一律拒绝
const DANGEROUS_SIGNATURES: Array<{ label: string; magic: number[]; offset?: number }> = [
  { label: 'Windows 可执行文件 (PE)', magic: [0x4d, 0x5a] }, // MZ
  { label: 'Linux 可执行文件 (ELF)', magic: [0x7f, 0x45, 0x4c, 0x46] }, // \x7fELF
  { label: 'macOS 可执行文件 (Mach-O)', magic: [0xfe, 0xed, 0xfa, 0xce] },
  { label: 'macOS 可执行文件 (Mach-O 64)', magic: [0xcf, 0xfa, 0xed, 0xfe] },
  { label: 'Java class 文件', magic: [0xca, 0xfe, 0xba, 0xbe] },
  { label: 'Shell 脚本', magic: [0x23, 0x21] }, // #!
]

function matchesAt(buffer: Buffer, magic: number[], offset = 0): boolean {
  if (buffer.length < offset + magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (buffer[offset + i] !== magic[i]) return false
  }
  return true
}

/**
 * 扫描文件内容，检测伪装的可执行文件/脚本，并校验魔数与扩展名一致。
 * 纯文本类型（txt/md）不强制魔数校验，但仍做危险特征检测。
 */
export function scanFileContent(buffer: Buffer, ext: string): void {
  // 1. 危险特征检测（任何类型都拒绝）
  for (const danger of DANGEROUS_SIGNATURES) {
    if (matchesAt(buffer, danger.magic, danger.offset)) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        `检测到可疑文件内容（${danger.label}），已拒绝上传`,
        400,
      )
    }
  }

  // 2. 纯文本类型不做魔数一致性校验
  const TEXT_EXTS = ['txt', 'md']
  if (TEXT_EXTS.includes(ext)) return

  // 3. 魔数与扩展名一致性校验
  const expected = EXT_TO_SIGNATURE[ext]
  if (!expected) return // 未登记签名的类型跳过一致性校验

  // webm 结构复杂（EBML），此处不强校验，仅依赖危险特征拦截
  if (ext === 'webm') return

  const matched = expected.some((sigExt) => {
    const sig = KNOWN_SIGNATURES.find((s) => s.ext === sigExt)
    if (!sig) return false
    return sig.magic.some((magic) => matchesAt(buffer, magic, sig.offset))
  })

  if (!matched) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      `文件内容与扩展名 .${ext} 不符，可能被篡改，已拒绝上传`,
      400,
    )
  }
}
