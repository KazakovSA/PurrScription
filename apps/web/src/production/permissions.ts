import type { Role, Task, TaskStatus } from "./types";

export interface Capabilities {
  manageUsers: boolean;
  manageProjects: boolean;
  assignTasks: boolean;
  export: boolean;
  runAsr: boolean;
  verifyTasks: boolean;
  editTerms: boolean;
  viewAnalytics: boolean;
}

export const defaultCapabilities = (role: Role): Capabilities => ({
  manageUsers: role === "admin",
  manageProjects: role === "admin" || role === "supervisor",
  assignTasks: role === "admin" || role === "supervisor",
  export:
    role === "admin" ||
    role === "supervisor" ||
    role === "verifier" ||
    role === "ml_engineer" ||
    role === "customer",
  runAsr: role === "admin" || role === "supervisor" || role === "ml_engineer",
  verifyTasks:
    role === "admin" || role === "supervisor" || role === "verifier",
  editTerms:
    role === "admin" || role === "supervisor" || role === "ml_engineer",
  viewAnalytics: role !== "customer",
});

export const canCreateProject = (role: Role) =>
  role === "admin" || role === "supervisor";

export const canImportMedia = (role: Role) =>
  role === "admin" || role === "supervisor";

export const canEditTask = (role: Role, task: Task, userId: string) => {
  if (role === "admin" || role === "supervisor") return true;
  if (role === "annotator") return task.assignedTo === userId;
  return false;
};

export const canVerifyTask = (role: Role, task: Task, userId: string) =>
  (role === "admin" || role === "supervisor" || role === "verifier") &&
  task.assignedTo !== userId;

export const canExportTask = (role: Role) => defaultCapabilities(role).export;

export const isReadOnlyWorkspace = (role: Role) => role === "customer";

export const editableTaskStatuses: TaskStatus[] = [
  "assigned",
  "in_progress",
  "rework",
  "fixed",
];
