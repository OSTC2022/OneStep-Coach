type TrainingContentDay = {
  id: string
  is_hidden?: boolean
  training_summary?: string | null
  location_label?: string | null
  training_time?: string | null
}

function contentHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

/** 훈련 일정 글(내용·장소·시간)이 바뀌면 키가 달라진다. 빈 일정은 제외. */
export function trainingContentKey(day: TrainingContentDay): string | null {
  if (day.is_hidden) return null
  const summary = day.training_summary?.trim() ?? ''
  const location = day.location_label?.trim() ?? ''
  const time = day.training_time?.trim() ?? ''
  if (!summary && !location && !time) return null
  return `training:${day.id}:${contentHash(`${summary}|${location}|${time}`)}`
}

export function trainingContentKeys(
  groups: Array<ReadonlyArray<TrainingContentDay> | null | undefined>,
): string[] {
  const ids: string[] = []
  for (const group of groups) {
    for (const day of group ?? []) {
      const key = trainingContentKey(day)
      if (key) ids.push(key)
    }
  }
  return ids
}
