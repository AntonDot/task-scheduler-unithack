// FilterBar — legacy status-based filtering, kept for tests compatibility.
// The column selector is now handled inside KanbanPage header.

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  urgencyFilter: string;
  onUrgencyChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

const URGENCY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUS_OPTIONS   = ['backlog', 'in-progress', 'review', 'done'] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: 'Бэклог',
  'in-progress': 'В работе',
  review: 'На проверке',
  done: 'Готово',
};

export function FilterBar({
  search,
  onSearchChange,
  urgencyFilter,
  onUrgencyChange,
  statusFilter,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <input
        className="filter-bar__search"
        type="text"
        placeholder="Поиск задач..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="filter-bar__select"
        data-testid="urgency-filter"
        value={urgencyFilter}
        onChange={(e) => onUrgencyChange(e.target.value)}
      >
        <option value="ALL">Все срочности</option>
        {URGENCY_OPTIONS.map(u => (
          <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>
        ))}
      </select>
      <select
        className="filter-bar__select"
        data-testid="status-filter"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="ALL">Все статусы</option>
        {STATUS_OPTIONS.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>
    </div>
  );
}
