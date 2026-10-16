export type DeadlineTask = {
  [key: string]: unknown;
  status?: unknown;
  revisionNotes?: unknown;
  revisionDue?: unknown;
  submissionDue?: unknown;
};
export function taskDeadline(task: DeadlineTask) {
  const value =
    task.status === "delivered" && task.revisionNotes
      ? task.revisionDue || task.submissionDue
      : task.submissionDue;
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}
export function taskOverdue(task: DeadlineTask, now = Date.now()) {
  const due = taskDeadline(task);
  return task.status === "delivered" && !!due && Date.parse(due) < now;
}
export function taskNeedsReminder(task: DeadlineTask, now = Date.now()) {
  const due = taskDeadline(task);
  return (
    task.status === "delivered" &&
    !!due &&
    Date.parse(due) <= now + 86400000 &&
    Date.parse(due) > now - 86400000
  );
}
