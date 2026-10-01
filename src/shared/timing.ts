export interface Deadline {
  running: boolean;
  remainingMs: number;
  endsAt: number | null;
}

export function startDeadline(now: number, durationMs: number): Deadline {
  const remainingMs = Math.max(0, durationMs);
  return { running: true, remainingMs, endsAt: now + remainingMs };
}

export function pauseDeadline(deadline: Deadline, now: number): Deadline {
  if (!deadline.running || deadline.endsAt === null) return deadline;
  return {
    running: false,
    remainingMs: Math.max(0, deadline.endsAt - now),
    endsAt: null,
  };
}

export function resumeDeadline(deadline: Deadline, now: number): Deadline {
  if (deadline.running) return deadline;
  return {
    running: true,
    remainingMs: deadline.remainingMs,
    endsAt: now + deadline.remainingMs,
  };
}

export function remainingDeadline(deadline: Deadline, now: number): number {
  if (!deadline.running || deadline.endsAt === null) return deadline.remainingMs;
  return Math.max(0, deadline.endsAt - now);
}
