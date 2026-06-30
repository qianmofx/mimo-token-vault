import type { KeyEntry } from "../types";
import { KeyItem } from "./KeyItem";

interface Props {
  keys: KeyEntry[];
  checkingKeys: Set<string>;
  onDelete: (id: string) => void;
}

export function KeyList({ keys, checkingKeys, onDelete }: Props) {
  return (
    <div className="key-list">
      {keys.map((entry) => (
        <KeyItem
          key={entry.id}
          entry={entry}
          isChecking={checkingKeys.has(entry.id)}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
