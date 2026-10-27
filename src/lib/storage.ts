import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Supabase Storage 비공개 버킷. service role 키는 서버 프로세스에서만 사용하고 클라이언트에 전달하지 않는다.
let client: SupabaseClient | undefined;
function supabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다. .env.local을 확인하세요.",
    );
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
export const bucketName = () =>
  process.env.SUPABASE_STORAGE_BUCKET || "onemarketing-assets";
export const storagePrefix = () => process.env.SUPABASE_STORAGE_PREFIX || "";
export function objectKey(storageName: string) {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(storageName))
    throw new Error("잘못된 파일 경로입니다.");
  return storagePrefix() + storageName;
}
const bucket = () => supabase().storage.from(bucketName());
export async function putObject(
  storageName: string,
  buffer: Buffer,
  contentType: string,
) {
  const { error } = await bucket().upload(objectKey(storageName), buffer, {
    contentType,
    upsert: false,
  });
  if (error)
    throw new Error(
      "파일 저장소에 업로드하지 못했습니다. 다시 시도하세요. (" +
        error.message +
        ")",
    );
}
export async function getObject(storageName: string): Promise<Buffer> {
  const { data, error } = await bucket().download(objectKey(storageName));
  if (error || !data) throw new Error("파일을 읽을 수 없습니다.");
  return Buffer.from(await data.arrayBuffer());
}
export async function objectExists(storageName: string) {
  const { data, error } = await bucket().exists(objectKey(storageName));
  if (error) throw new Error("파일 존재 여부를 확인할 수 없습니다.");
  return data === true;
}
export async function signedUpload(storageName: string) {
  const { data, error } = await bucket().createSignedUploadUrl(
    objectKey(storageName),
    { upsert: false },
  );
  if (error || !data) throw new Error("업로드 연결을 준비하지 못했습니다.");
  return { signedUrl: data.signedUrl };
}
export async function objectInfo(storageName: string) {
  const { data, error } = await bucket().info(objectKey(storageName));
  if (error || !data) throw new Error("업로드한 파일을 확인하지 못했습니다.");
  return data;
}
export async function removeObjects(storageNames: string[]) {
  if (!storageNames.length) return;
  const { error } = await bucket().remove(storageNames.map(objectKey));
  if (error) throw new Error("파일 삭제에 실패했습니다: " + error.message);
}
export async function listObjects(prefix = storagePrefix()) {
  const folder = prefix.replace(/\/$/, "");
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket().list(folder, {
      limit: 1000,
      offset,
    });
    if (error) throw new Error("파일 목록을 읽을 수 없습니다.");
    for (const item of data || []) if (item.id) names.push(item.name);
    if (!data || data.length < 1000) break;
  }
  return names;
}
export async function bucketIsPrivate() {
  const { data, error } = await supabase().storage.getBucket(bucketName());
  if (error || !data) throw new Error("버킷 정보를 확인할 수 없습니다.");
  return data.public === false;
}
