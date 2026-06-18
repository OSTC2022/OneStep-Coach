'use client'

import { createClient } from '@/lib/supabase/client'

export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const PROFILE_AVATAR_MAX_EDGE = 512
export const PROFILE_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateProfileAvatarFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.'
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    return '이미지는 2MB 이하로 업로드해주세요.'
  }
  return null
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function resizeProfileAvatar(file: File): Promise<Blob> {
  const image = await loadImage(file)
  const longest = Math.max(image.width, image.height)
  const scale = longest > PROFILE_AVATAR_MAX_EDGE ? PROFILE_AVATAR_MAX_EDGE / longest : 1
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지 처리에 실패했습니다.')
  context.drawImage(image, 0, 0, width, height)

  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) reject(new Error('이미지 처리에 실패했습니다.'))
        else resolve(value)
      },
      mime,
      mime === 'image/jpeg' ? 0.9 : undefined,
    )
  })

  return blob
}

function avatarObjectPath(userId: string, mime: string) {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  return `${userId}/avatar.${ext}`
}

export async function uploadProfileAvatar(
  userId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  const validationError = validateProfileAvatarFile(file)
  if (validationError) return { error: validationError }

  try {
    const blob = await resizeProfileAvatar(file)
    const mime = blob.type || file.type
    const path = avatarObjectPath(userId, mime)
    const supabase = createClient()

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, {
        upsert: true,
        contentType: mime,
        cacheControl: '3600',
      })

    if (uploadError) {
      return { error: uploadError.message }
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const versionedUrl = `${data.publicUrl}?v=${Date.now()}`
    return { url: versionedUrl }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '프로필 사진 업로드에 실패했습니다.',
    }
  }
}

export async function removeProfileAvatar(userId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const candidates = ['jpg', 'png', 'webp'].map((ext) => `${userId}/avatar.${ext}`)
  const { error } = await supabase.storage.from('avatars').remove(candidates)
  if (error) return { error: error.message }
  return {}
}
