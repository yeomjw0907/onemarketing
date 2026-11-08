// A successful write remains successful even if the follow-up read fails.
export async function saveAndRefresh<T>(
  save: () => Promise<T>,
  refresh: () => Promise<unknown>,
) {
  const value = await save();
  try {
    await refresh();
    return { value, refreshed: true };
  } catch {
    return { value, refreshed: false };
  }
}

export const refreshAfterSaveMessage =
  "저장은 완료됐지만 최신 내역을 불러오지 못했어요. 새로고침 후 결과를 확인해주세요.";
