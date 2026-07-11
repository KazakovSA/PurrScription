const regionKeys = new Map<string, string>();

export function peekRegionKey(mediaId: string) {
  return regionKeys.get(mediaId) ?? "";
}

export function rememberRegionKey(mediaId: string, key: string) {
  regionKeys.set(mediaId, key);
}

export function clearRegionKey(mediaId: string) {
  regionKeys.delete(mediaId);
}
