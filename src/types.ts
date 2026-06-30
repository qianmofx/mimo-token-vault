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
  chatOk: boolean | null;
  chatModel: string;
  chatResponse: string;
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
  chatOk: boolean;
  chatElapsed: number;
  chatModel: string;
  chatResponse: string;
}

export type VerifyStatus = "idle" | "loading" | "success" | "error";
