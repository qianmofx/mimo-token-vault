import { useState, useCallback } from "react";
import type { KeyEntry } from "../types";

interface Props {
  entry: KeyEntry;
  isChecking: boolean;
  onDelete: (id: string) => void;
}

export function KeyItem({ entry, isChecking, onDelete }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(entry.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = entry.key;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [entry.key]);

  const statusClass =
    isChecking ? "checking" :
    entry.isValid === true ? "valid" :
    entry.isValid === false ? "invalid" :
    "unknown";

  const isPayg = entry.keyType === "payg";
  const isTokenPlan = entry.keyType === "tokenplan";

  return (
    <div className="key-item">
      <span className={`status-dot ${statusClass}`} />

      {/* Key type badge */}
      <span className={`key-type-badge ${isPayg ? "payg" : isTokenPlan ? "tokenplan" : ""}`}>
        {isPayg ? "sk-" : isTokenPlan ? "tp-" : "?"}
      </span>

      {/* Key text */}
      <span className="key-text" title={entry.key}>
        {entry.key}
      </span>

      {/* Extra info */}
      {entry.models.length > 0 && (
        <span className="key-meta" title={`${entry.models.length} 个可用模型`}>
          {entry.models.length} 模型
        </span>
      )}
      {entry.cluster && (
        <span className="key-meta cluster">{entry.cluster}</span>
      )}
      {entry.anthropicOk === true && (
        <span className="key-meta anthro" title="Anthropic 协议可用">A✓</span>
      )}
      {entry.chatOk === true && (
        <span className="key-meta chat-ok" title={entry.chatResponse || "对话测试通过"}>💬</span>
      )}
      {entry.chatOk === false && (
        <span className="key-meta chat-fail" title="对话测试失败">⚠️</span>
      )}

      <div className="key-actions">
        <button
          className={`btn btn-xs btn-copy ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title="复制"
        >
          {copied ? "✓" : "📋"}
        </button>
        <button
          className="btn btn-xs btn-delete"
          onClick={() => onDelete(entry.id)}
          title="删除"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
