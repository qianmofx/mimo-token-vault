import { useState, useRef } from "react";
import type { VerifyResult, VerifyStatus } from "../types";

interface Props {
  onAdd: (key: string, result: VerifyResult) => void;
  onVerify: (key: string) => Promise<VerifyResult>;
  detectType: (key: string) => "payg" | "tokenplan" | "unknown";
  onTestAnthropic: (key: string) => Promise<VerifyResult>;
  onUpdateAnthropic: (id: string, result: VerifyResult) => void;
}

export function KeyInput({ onAdd, onVerify, detectType, onTestAnthropic, onUpdateAnthropic }: Props) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<VerifyResult | null>(null);
  const [lastKeyId, setLastKeyId] = useState<string | null>(null);
  const [anthroStatus, setAnthroStatus] = useState<VerifyStatus>("idle");
  const [anthroMsg, setAnthroMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const keyType = detectType(value);

  const handleVerify = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setStatus("loading");
    setMessage("");
    setLastResult(null);

    try {
      const result = await onVerify(trimmed);
      setLastResult(result);
      if (result.ok) {
        setStatus("success");
        setMessage(`✅ 有效 · ${result.status} · ${result.elapsed.toFixed(1)}s${result.cluster ? " · " + result.cluster : ""}${result.models.length > 0 ? " · " + result.models.length + " 个模型" : ""}`);
        onAdd(trimmed, result);
        setValue("");
        setLastResult(null);
        setLastKeyId(null);
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
          inputRef.current?.focus();
        }, 800);
      } else {
        setStatus("error");
        const codeText =
          result.status === 401 ? "Key 无效" :
          result.status === 403 ? "无权限/已过期" :
          result.status === 429 ? "频率限制" :
          result.status === 0 ? "网络错误" :
          `HTTP ${result.status}`;
        setMessage(`❌ ${codeText}${result.reason ? " — " + result.reason.slice(0, 120) : ""}`);
      }
    } catch (e) {
      setStatus("error");
      setMessage("❌ 验证失败: " + String(e));
    }
  };

  const handleAnthropicTest = async () => {
    const trimmed = value.trim();
    if (!trimmed || !lastResult?.ok) return;
    setAnthroStatus("loading");
    setAnthroMsg("");
    try {
      const result = await onTestAnthropic(trimmed);
      if (result.ok) {
        setAnthroStatus("success");
        setAnthroMsg(`✅ Anthropic 协议可用 · ${result.elapsed.toFixed(1)}s${result.cluster ? " · " + result.cluster : ""}`);
      } else {
        setAnthroStatus("error");
        setAnthroMsg(`❌ Anthropic 不可用 — ${result.reason?.slice(0, 80) || "HTTP " + result.status}`);
      }
      if (lastKeyId) {
        onUpdateAnthropic(lastKeyId, result);
      }
    } catch (e) {
      setAnthroStatus("error");
      setAnthroMsg("❌ 测试失败: " + String(e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleVerify();
  };

  const showAnthropicBtn = lastResult?.ok && status === "success";

  return (
    <div style={{ flexShrink: 0 }}>
      <div className="key-input-area">
        <input
          ref={inputRef}
          className={`key-input ${status === "error" ? "error" : ""} ${status === "success" ? "success" : ""}`}
          type="text"
          placeholder="输入 MiMo API Key（sk- 或 tp- 开头）"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (status !== "idle") {
              setStatus("idle");
              setMessage("");
              setLastResult(null);
              setLastKeyId(null);
              setAnthroStatus("idle");
              setAnthroMsg("");
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={status === "loading"}
          spellCheck={false}
          autoFocus
        />
        <button
          className="btn btn-primary"
          onClick={handleVerify}
          disabled={!value.trim() || status === "loading" || keyType === "unknown"}
        >
          {status === "loading" ? (
            <><span className="spinner" /> 验证中</>
          ) : (
            "确认"
          )}
        </button>
      </div>

      {/* Key type hint */}
      {value.trim() && (
        <div style={{ fontSize: 12, marginTop: 4, marginLeft: 4 }}>
          {keyType === "payg" && (
            <span style={{ color: "var(--success)" }}>sk-··· 按量付费 Key</span>
          )}
          {keyType === "tokenplan" && (
            <span style={{ color: "var(--warning)" }}>tp-··· Token Plan Key · 自动匹配集群</span>
          )}
          {keyType === "unknown" && (
            <span style={{ color: "var(--danger)" }}>格式无法识别（需要 sk- 或 tp- 开头）</span>
          )}
        </div>
      )}

      {/* Result message */}
      {message && (
        <div style={{ fontSize: 12, marginTop: 4, marginLeft: 4, color: status === "success" ? "var(--success)" : "var(--danger)", whiteSpace: "pre-wrap" }}>
          {message}
        </div>
      )}

      {/* Anthropic test button + result */}
      {showAnthropicBtn && (
        <div style={{ marginTop: 8, marginLeft: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleAnthropicTest}
            disabled={anthroStatus === "loading"}
          >
            {anthroStatus === "loading" ? <><span className="spinner" /> 测试中</> : "🧪 Anthropic 协议测试"}
          </button>
          {anthroMsg && (
            <span style={{ fontSize: 12, color: anthroStatus === "success" ? "var(--purple, #7c3aed)" : "var(--danger)" }}>
              {anthroMsg}
            </span>
          )}
        </div>
      )}

      {/* Model list preview after verify */}
      {lastResult?.ok && lastResult.models.length > 0 && (
        <div className="model-preview" style={{ marginTop: 8, marginLeft: 4, padding: "10px 14px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            📋 可用模型预览（{lastResult.models.length} 个）
          </div>
          <div style={{ fontSize: 11, fontFamily: "'SF Mono', 'Consolas', monospace", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "4px 16px", maxHeight: 100, overflowY: "auto" }}>
            {lastResult.models.slice(0, 20).map((m) => (
              <span key={m}>{m}</span>
            ))}
            {lastResult.models.length > 20 && (
              <span style={{ color: "var(--accent)" }}>+{lastResult.models.length - 20} 更多…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
