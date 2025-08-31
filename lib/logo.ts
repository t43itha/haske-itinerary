import { readFileSync } from 'fs'
import { join } from 'path'

export function getHaskeLogo(): string {
  try {
    const logoPath = join(process.cwd(), 'public', 'haske-logo.png')
    const logoBase64 = readFileSync(logoPath, 'base64')
    return `data:image/png;base64,${logoBase64}`
  } catch (error) {
    console.error('Failed to load logo:', error)
    return ''
  }
}