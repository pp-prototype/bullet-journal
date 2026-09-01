# 데이터베이스 적용

`migrations/202609010001_initial_journal_schema.sql`은 다음 원칙을 적용합니다.

- `tasks`: 수정 가능한 현재 할 일 원본
- `plans`: 생성 당시 제목을 보존하는 날짜별 계획 기록
- `executions`: 계획 기반 또는 직접 입력한 실제 실행 기록
- 계획/실행 취소는 삭제가 아닌 상태 변경으로 보존
- 모든 조회와 쓰기는 로그인한 사용자의 행으로 제한

Supabase 프로젝트 연결 후 CLI에서는 아래 명령으로 적용합니다.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

대시보드의 SQL Editor에서 마이그레이션 파일 전체를 실행해도 됩니다.

