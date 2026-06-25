-- PB 수정 시 이전 기록을 pb_history 로 보존하고, 현재 PB(other)는 1건만 유지합니다.
-- notes JSON 이력과 함께 동작합니다(앱 코드 참고).

ALTER TABLE public.running_league_records
  DROP CONSTRAINT IF EXISTS running_league_records_record_phase_check;

ALTER TABLE public.running_league_records
  ADD CONSTRAINT running_league_records_record_phase_check
  CHECK (record_phase IN ('month_start', 'month_end', 'mid_month', 'other', 'pb_history'));

ALTER TABLE public.running_league_records
  DROP CONSTRAINT IF EXISTS running_league_records_participant_id_distance_event_record_phase_key;

-- 일부 환경에서 제약 이름이 다를 수 있어 인덱스도 제거합니다.
DROP INDEX IF EXISTS running_league_records_participant_id_distance_event_record_phase_key;

CREATE UNIQUE INDEX IF NOT EXISTS running_league_records_phase_slot_uidx
  ON public.running_league_records (participant_id, distance_event, record_phase)
  WHERE record_phase IN ('month_start', 'month_end', 'mid_month', 'other');

COMMENT ON COLUMN public.running_league_records.record_phase IS
  'other=현재 PB, pb_history=이전 PB 이력(추이 그래프용)';
