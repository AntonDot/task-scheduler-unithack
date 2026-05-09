import { KANBAN_COLUMNS, COLUMN_LABELS } from "@/types/domain";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  urgencyFilter: string;
  onUrgencyChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

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
        <option value="LOW">Низкая</option>
        <option value="MEDIUM">Средняя</option>
        <option value="HIGH">Высокая</option>
        <option value="URGENT">Критичная</option>
      </select>
      <select
        className="filter-bar__select"
        data-testid="status-filter"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="ALL">Все статусы</option>
        {KANBAN_COLUMNS.map((status) => (
          <option key={status} value={status}>
            {COLUMN_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
