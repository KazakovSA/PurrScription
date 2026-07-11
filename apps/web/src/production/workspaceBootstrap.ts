const key = (taskId: string) => `purrscription.ws-boot.${taskId}`;

export function isWorkspaceBootstrapped(taskId?: string) {
  if (!taskId) return false;
  try {
    return sessionStorage.getItem(key(taskId)) === "1";
  } catch {
    return false;
  }
}

export function markWorkspaceBootstrapped(taskId: string) {
  try {
    sessionStorage.setItem(key(taskId), "1");
  } catch {
    /* ignore */
  }
}
