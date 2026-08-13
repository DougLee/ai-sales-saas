/**
 * ASR 语音转写客户端骨架
 * 支持：阿里 SenseVoice / 讯飞语音转写
 * V2.3 选型：SenseVoice（嘈杂环境优，支持领域热词表）
 */

export interface AsrResult {
  text: string
  confidence: number
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

export interface AsrClient {
  transcribe(audioBuffer: Buffer, options?: { hotwords?: string[]; language?: string; mimeType?: string }): Promise<AsrResult>
}

class SenseVoiceClient implements AsrClient {
  private apiKey: string
  private endpoint: string

  constructor(apiKey: string, endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription') {
    this.apiKey = apiKey
    this.endpoint = endpoint
  }

  async transcribe(audioBuffer: Buffer, options?: { hotwords?: string[]; language?: string; mimeType?: string }): Promise<AsrResult> {
    const form = new FormData()
    const mimeType = options?.mimeType || 'audio/wav'
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'wav'
    const blob = new Blob([audioBuffer], { type: mimeType })
    form.append('file', blob, `audio.${ext}`)
    form.append('model', 'sensevoice-small')
    if (options?.language) form.append('language', options.language)
    if (options?.hotwords) form.append('hotwords', options.hotwords.join(','))

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form as any,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`ASR failed: ${res.status} ${errText.slice(0, 500)}`)
    }

    const data = await res.json() as {
      text?: string
      confidence?: number
      segments?: AsrResult['segments']
    }

    return {
      text: data.text || '',
      confidence: data.confidence || 0,
      segments: data.segments,
    }
  }
}

import { logger } from './logger.js'

class XunfeiClient implements AsrClient {
  constructor(_appId: string, _apiKey: string, _apiSecret: string) {
    // 讯飞 WebAPI 骨架，待接入 — 参数预留
  }

  async transcribe(_audioBuffer: Buffer, _options?: { hotwords?: string[]; language?: string }): Promise<AsrResult> {
    // 讯飞 WebAPI 骨架，待接入
    logger.warn('Xunfei ASR not yet implemented')
    return { text: '', confidence: 0 }
  }
}

export function createAsrClient(provider: 'sensevoice' | 'xunfei', config: Record<string, string>): AsrClient {
  if (provider === 'sensevoice') {
    return new SenseVoiceClient(config.apiKey, config.endpoint)
  }
  return new XunfeiClient(config.appId, config.apiKey, config.apiSecret)
}
