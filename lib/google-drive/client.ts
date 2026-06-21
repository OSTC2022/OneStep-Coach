import 'server-only'

/** Drive API — 업로드 전용. Drive → 앱 복원/동기화는 하지 않습니다. */
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type DriveFile = {
  id: string
  name: string
  webViewLink?: string
}

async function driveFetch<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Drive API 오류 (${response.status}): ${text}`)
  }

  if (response.status === 204) return {} as T
  return response.json() as Promise<T>
}

export async function findDriveFolderByName(
  accessToken: string,
  name: string,
): Promise<DriveFile | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`,
  )
  const data = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&spaces=drive&pageSize=5`,
  )
  return data.files?.[0] ?? null
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
): Promise<DriveFile> {
  return driveFetch<DriveFile>(accessToken, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
    }),
  })
}

export async function findDriveFileInFolder(
  accessToken: string,
  folderId: string,
  name: string,
): Promise<DriveFile | null> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
  )
  const data = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&spaces=drive&pageSize=5`,
  )
  return data.files?.[0] ?? null
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<Buffer> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(120_000),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Drive 다운로드 실패 (${response.status}): ${text}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function uploadDriveFile(
  accessToken: string,
  params: {
    name: string
    buffer: Buffer
    folderId: string
    existingFileId?: string | null
  },
): Promise<DriveFile> {
  const metadata = {
    name: params.name,
    mimeType: XLSX_MIME,
    ...(params.existingFileId ? {} : { parents: [params.folderId] }),
  }

  const boundary = 'onestep_member_backup_boundary'
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\nContent-Transfer-Encoding: base64\r\n\r\n${params.buffer.toString('base64')}\r\n`,
    `--${boundary}--`,
  ]
  const body = bodyParts.join('')

  const url = params.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${params.existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink'

  const response = await fetch(url, {
    method: params.existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Drive 업로드 실패 (${response.status}): ${text}`)
  }

  return response.json() as Promise<DriveFile>
}

export const MEMBER_BACKUP_DRIVE_FOLDER = 'OneStep 회원 백업'
