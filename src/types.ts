export interface KeyEntry {
  id: string;
  key: string;
  keyType: "payg" | "tokenplan" | "unknown";
  isValid: boolean | null;
  lastChecked: string | null;
  createdAt: string;
  models: string[];
  cluster: string;
  anthropicOk: boolean | null;
}

export interface VerifyResult {
  ok: boolean;
  status: number;
  keyType: string;
  models: string[];
  elapsed: number;
  cluster: string;
  base: string;
  reason: string;
}

export type VerifyStatus = "idle" | "loading" | "success" | "error";
