import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (q: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export function DLSearchBar({ onSubmit, loading, placeholder }: Props) {
  const [value, setValue] = useState('');

  function handle(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q) onSubmit(q);
  }

  return (
    <form className="dl-search-wrap" onSubmit={handle}>
      <input
        className="dl-search-input"
        type="text"
        autoFocus
        placeholder={placeholder ?? 'ค้นหา SKU / บาร์โค้ด / ชื่อยา'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
      />
      <button className="dl-search-btn" type="submit" disabled={loading} aria-label="search">
        {loading ? '...' : '🔍'}
      </button>
    </form>
  );
}
