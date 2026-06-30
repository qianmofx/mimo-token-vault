interface Props {
  onBatchCheck: () => void;
  onBatchDeleteInvalid: () => void;
  batchRunning: boolean;
  hasInvalidKeys: boolean;
}

export function ActionBar({
  onBatchCheck,
  onBatchDeleteInvalid,
  batchRunning,
  hasInvalidKeys,
}: Props) {
  return (
    <div className="action-bar">
      <button
        className="btn btn-outline"
        onClick={onBatchCheck}
        disabled={batchRunning}
      >
        {batchRunning ? (
          <>
            <span className="spinner" /> 检测中...
          </>
        ) : (
          "🔍 一键检测"
        )}
      </button>
      <button
        className="btn btn-danger"
        onClick={onBatchDeleteInvalid}
        disabled={!hasInvalidKeys}
      >
        🗑 一键删除无效
      </button>
    </div>
  );
}
