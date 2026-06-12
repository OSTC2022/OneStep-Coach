-- 위지용 회원 체중 이력 일괄 입력
-- Supabase SQL Editor에서 실행 (또는 import-weijiyong-body-weights.mjs 사용)

DO $$
DECLARE
  v_member_id UUID;
  v_height_cm NUMERIC;
  rec RECORD;
BEGIN
  SELECT id, height_cm INTO v_member_id, v_height_cm
  FROM public.members
  WHERE name = '위지용' AND deleted_at IS NULL
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION '회원 "위지용"을(를) 찾을 수 없습니다.';
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('2022-11-02'::date, 33.0),
      ('2022-11-03', 32.3),
      ('2022-11-07', 33.0),
      ('2022-11-16', 32.8),
      ('2022-11-17', 33.0),
      ('2022-11-24', 33.0),
      ('2022-12-07', 33.8),
      ('2022-12-14', 33.1),
      ('2022-12-21', 33.7),
      ('2022-12-30', 33.7),
      ('2023-01-27', 35.0),
      ('2023-02-02', 35.4),
      ('2023-02-10', 35.5),
      ('2023-03-23', 34.8),
      ('2023-03-30', 35.0),
      ('2023-04-06', 35.4),
      ('2023-04-13', 35.7),
      ('2023-05-11', 35.4),
      ('2023-05-17', 36.0),
      ('2023-05-25', 35.2),
      ('2023-06-19', 35.5),
      ('2023-07-10', 35.9),
      ('2023-07-18', 36.1),
      ('2023-09-23', 37.8),
      ('2023-10-07', 38.5),
      ('2023-11-20', 38.4),
      ('2023-12-12', 38.3),
      ('2023-12-29', 38.6),
      ('2024-01-18', 38.3),
      ('2024-02-01', 38.9),
      ('2024-02-13', 38.9),
      ('2024-02-15', 45.9),
      ('2024-02-22', 46.0),
      ('2024-04-15', 40.0),
      ('2024-05-16', 47.7),
      ('2024-07-11', 48.9),
      ('2024-08-12', 48.8),
      ('2024-10-18', 50.6),
      ('2024-11-01', 50.7),
      ('2024-11-16', 50.3),
      ('2026-01-10', 50.5),
      ('2026-02-06', 50.5),
      ('2026-02-20', 50.6),
      ('2026-03-07', 50.4),
      ('2026-05-10', 50.7),
      ('2026-06-08', 52.0)
    ) AS t(recorded_at, weight_kg)
  LOOP
    UPDATE public.member_body_records
    SET weight_kg = rec.weight_kg
    WHERE member_id = v_member_id AND recorded_at = rec.recorded_at;

    IF NOT FOUND THEN
      INSERT INTO public.member_body_records (member_id, recorded_at, weight_kg, height_cm, note)
      VALUES (v_member_id, rec.recorded_at, rec.weight_kg, v_height_cm, '과거 체중 일괄 입력');
    END IF;
  END LOOP;

  RAISE NOTICE '위지용(%): 체중 이력 46건 반영 완료', v_member_id;
END $$;
