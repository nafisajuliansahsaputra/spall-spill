export type RecoveryState = { status: "idle" | "error" | "requested"; message: string | null; retryAt?: number };
export const initialRecoveryState: RecoveryState = { status: "idle", message: null };
