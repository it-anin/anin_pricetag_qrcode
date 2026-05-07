import type { Medicine } from './types';

interface Props {
  results: Medicine[];
  selectedId: string | null;
  onSelect: (m: Medicine) => void;
}

export function DLResultList({ results, selectedId, onSelect }: Props) {
  if (results.length === 0) return null;

  return (
    <div className="dl-result-list">
      {results.map((m) => (
        <button
          key={m.id}
          className={`dl-result-row${m.id === selectedId ? ' selected' : ''}`}
          onClick={() => onSelect(m)}
          type="button"
          aria-pressed={m.id === selectedId}
        >
          <span className="dl-result-pick">{m.id === selectedId ? 'เลือกแล้ว' : 'เลือก'}</span>
          <span className="dl-result-sku">{m.sku}</span>
          <span className="dl-result-name">{m.trade_name}</span>
          {m.generic_name && (
            <span className="dl-result-generic">{m.generic_name}</span>
          )}
          {m.usage && (
            <span className="dl-result-usage">{m.usage.length > 60 ? m.usage.slice(0, 60) + '…' : m.usage}</span>
          )}
        </button>
      ))}
    </div>
  );
}
