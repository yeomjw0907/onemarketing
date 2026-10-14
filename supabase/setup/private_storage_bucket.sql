-- 비공개 Storage 버킷. 정책을 만들지 않으므로 anon/authenticated 키로는 객체에 접근할 수 없다.
-- 파일 조회·다운로드는 관리자 인증을 확인한 서버가 service role로 수행한다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('onemarketing-assets', 'onemarketing-assets', false, 115343360)
on conflict (id) do update set public = false;
