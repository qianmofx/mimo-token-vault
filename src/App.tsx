import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KeyEntry, VerifyResult } from "./types";
import { KeyInput } from "./components/KeyInput";
import { KeyList } from "./components/KeyList";
import { ActionBar } from "./components/ActionBar";

// ── Toast system ──

interface ToastItem {
  id: number;
  type: "success" | "error" | "info";
  msg: string;
}

let toastId = 0;
function showToast(type: ToastItem["type"], msg: string) {
  window.dispatchEvent(
    new CustomEvent("toast", { detail: { id: ++toastId, type, msg } })
  );
}

export { showToast };

// ── Helpers ──

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function detectKeyType(key: string): "payg" | "tokenplan" | "unknown" {
  const k = key.trim();
  if (k.startsWith("sk-")) return "payg";
  if (k.startsWith("tp-")) return "tokenplan";
  return "unknown";
}

// ── App ──

export default function App() {
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [checkingKeys, setCheckingKeys] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Listen for toast events
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, type, msg } = (e as CustomEvent).detail as ToastItem;
      setToasts((prev) => [...prev, { id, type, msg }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        toastTimers.current.delete(id);
      }, 2800);
      toastTimers.current.set(id, timer);
    };
    window.addEventListener("toast", handler);
    return () => {
      window.removeEventListener("toast", handler);
      toastTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Load keys on mount
  useEffect(() => {
    (async () => {
      try {
        const loaded = await invoke<KeyEntry[]>("load_keys");
        if (loaded.length > 0) setKeys(loaded);
      } catch { /* first run */ }
    })();
  }, []);

  // Persist keys
  useEffect(() => {
    if (keys.length > 0) {
      invoke("save_keys", { keys }).catch(console.error);
    }
  }, [keys]);

  // ── Verify a key via MiMo API ──
  const verifyKey = useCallback(async (rawKey: string): Promise<VerifyResult> => {
    return await invoke<VerifyResult>("verify_key", { key: rawKey.trim() });
  }, []);

  // ── Add key after successful verification ──
  const addKey = useCallback((rawKey: string, result: VerifyResult) => {
    const newKey: KeyEntry = {
      id: generateId(),
      key: rawKey.trim(),
      keyType: result.keyType as KeyEntry["keyType"],
      isValid: true,
      lastChecked: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      models: result.models,
      cluster: result.cluster,
      anthropicOk: null,
      chatOk: result.chatOk,
      chatModel: result.chatModel,
      chatResponse: result.chatResponse,
    };
    setKeys((prev) => [newKey, ...prev]);
    const chatInfo = result.chatOk
      ? ` · 对话测试 ✅ ${result.chatElapsed.toFixed(1)}s`
      : result.chatResponse
        ? ` · 对话测试 ❌`
        : "";
    showToast(
      "success",
      `Key 已添加 — ${result.keyType === "tokenplan" ? "Token Plan" : "按量付费"}${result.cluster ? " · " + result.cluster : ""}${chatInfo}`
    );
  }, []);

  // ── Delete ──
  const deleteKey = useCallback((id: string) => {
    setKeys((prev) => {
      const updated = prev.filter((k) => k.id !== id);
      if (updated.length === 0) {
        invoke("clear_keys").catch(console.error);
      }
      return updated;
    });
    showToast("info", "Key 已删除");
  }, []);

  // ── Batch check ──
  const batchCheck = useCallback(async () => {
    if (keys.length === 0 || batchRunning) return;
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: keys.length });

    const updated = [...keys];
    for (let i = 0; i < updated.length; i++) {
      setCheckingKeys((prev) => new Set(prev).add(updated[i].id));
      try {
        const result = await verifyKey(updated[i].key);
        updated[i] = {
          ...updated[i],
          isValid: result.ok,
          models: result.models,
          cluster: result.cluster,
          lastChecked: new Date().toISOString(),
        };
      } catch {
        updated[i] = { ...updated[i], isValid: false, lastChecked: new Date().toISOString() };
      }
      setCheckingKeys((prev) => {
        const next = new Set(prev);
        next.delete(updated[i].id);
        return next;
      });
      setKeys([...updated]);
      setBatchProgress({ current: i + 1, total: keys.length });
    }

    setBatchRunning(false);
    const validCount = updated.filter((k) => k.isValid).length;
    const invalidCount = updated.length - validCount;
    showToast(
      validCount === updated.length ? "success" : "info",
      `检测完成：${validCount} 可用，${invalidCount} 失效`
    );
  }, [keys, batchRunning, verifyKey]);

  // ── Batch delete invalid ──
  const batchDeleteInvalid = useCallback(() => {
    const invalid = keys.filter((k) => k.isValid === false);
    if (invalid.length === 0) {
      showToast("info", "没有失效的 Key");
      return;
    }
    setKeys((prev) => {
      const updated = prev.filter((k) => k.isValid !== false);
      if (updated.length === 0) {
        invoke("clear_keys").catch(console.error);
      }
      return updated;
    });
    showToast("success", `已删除 ${invalid.length} 个失效 Key`);
  }, [keys]);

  // ── Anthropic test (for a single key) ──
  const testAnthropic = useCallback(async (rawKey: string) => {
    return await invoke<VerifyResult>("verify_key_anthropic", { key: rawKey.trim() });
  }, []);

  const updateKeyAnthropic = useCallback((id: string, result: VerifyResult) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, anthropicOk: result.ok } : k
      )
    );
  }, []);

  const validCount = keys.filter((k) => k.isValid === true).length;
  const invalidCount = keys.filter((k) => k.isValid === false).length;
  const unknownCount = keys.filter((k) => k.isValid === null).length;

  return (
    <div className="app-container">
      {/* Toast */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="app-title">
          <div className="icon">🪙</div>
          MimoToken 仓库
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          MiMo API · 自动鉴别 sk- / tp-
        </div>
      </header>

      {/* Key Input */}
      <KeyInput
        onAdd={addKey}
        onVerify={verifyKey}
        detectType={detectKeyType}
        onTestAnthropic={testAnthropic}
        onUpdateAnthropic={updateKeyAnthropic}
      />

      {/* Action Bar */}
      {keys.length > 0 && (
        <ActionBar
          onBatchCheck={batchCheck}
          onBatchDeleteInvalid={batchDeleteInvalid}
          batchRunning={batchRunning}
          hasInvalidKeys={invalidCount > 0}
        />
      )}

      {/* Progress Bar */}
      {batchRunning && (
        <div className="progress-bar">
          <div
            className="fill"
            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Key List */}
      <div className="key-list-container">
        {keys.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>还没有 Key</h3>
            <p>在上方输入 MiMo API Key（sk- 或 tp-），点击验证按钮添加第一个</p>
          </div>
        ) : (
          <KeyList
            keys={keys}
            checkingKeys={checkingKeys}
            onDelete={deleteKey}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-stats">
          <span>共 {keys.length} 个 Key</span>
          {validCount > 0 && <span><span className="dot green" /> {validCount} 可用</span>}
          {invalidCount > 0 && <span><span className="dot red" /> {invalidCount} 失效</span>}
          {unknownCount > 0 && <span><span className="dot gray" /> {unknownCount} 未检测</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {keys.filter((k) => k.keyType === "payg").length > 0 && (
            <span style={{ fontSize: 11, color: "var(--success)" }}>
              sk- × {keys.filter((k) => k.keyType === "payg").length}
            </span>
          )}
          {keys.filter((k) => k.keyType === "tokenplan").length > 0 && (
            <span style={{ fontSize: 11, color: "var(--warning)" }}>
              tp- × {keys.filter((k) => k.keyType === "tokenplan").length}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
