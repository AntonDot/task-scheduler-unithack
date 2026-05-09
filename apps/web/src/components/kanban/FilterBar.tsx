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
        placeholder="Search tasks..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="filter-bar__select"
        data-testid="urgency-filter"
        value={urgencyFilter}
        onChange={(e) => onUrgencyChange(e.target.value)}
      >
        <option value="ALL">All urgencies</option>
        <option value="LOW">LOW</option>
        <option value="MEDIUM">MEDIUM</option>
        <option value="HIGH">HIGH</option>
        <option value="URGENT">URGENT</option>
      </select>
      <select
        className="filter-bar__select"
        data-testid="status-filter"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="ALL">All statuses</option>
        {KANBAN_COLUMNS.map((status) => (
          <option key={status} value={status}>
            {COLUMN_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
