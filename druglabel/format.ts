export function formatBeDate(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const beYY = String((d.getFullYear() + 543) % 100).padStart(2, '0');
  return `${dd}/${mm}/${beYY}`;
}
