// Victory Task — theme system

export interface Theme {
  bg: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  sidebar: string;
  columnBg: string;
  codeBlock: string;
  inputBg: string;
  dark: boolean;
}

export function createTheme(dark: boolean): Theme {
  if (dark) {
    return {
      bg: '#0F172A',
      surface: '#1E293B',
      surfaceHover: '#263346',
      border: '#334155',
      borderHover: '#475569',
      text: '#F1F5F9',
      textSecondary: '#94A3B8',
      textMuted: '#64748B',
      sidebar: '#1E293B',
      columnBg: '#263346',
      codeBlock: '#0F172A',
      inputBg: '#0F172A',
      dark: true,
    };
  }
  return {
    bg: '#F9FAFB',
    surface: '#FFFFFF',
    surfaceHover: '#F9FAFB',
    border: '#E5E7EB',
    borderHover: '#D1D5DB',
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    sidebar: '#FFFFFF',
    columnBg: '#F3F4F6',
    codeBlock: '#F3F4F6',
    inputBg: '#F9FAFB',
    dark: false,
  };
}

// Design column definitions (4 columns map from 5 API statuses)
export type DesignColumn = 'backlog' | 'in-progress' | 'review' | 'done';

export interface ColumnDef {
  id: DesignColumn;
  label: string;
  dotColor: string;
}

export const COLUMNS_DEF: ColumnDef[] = [
  { id: 'backlog',     label: 'Backlog',     dotColor: '#9CA3AF' },
  { id: 'in-progress', label: 'In Progress', dotColor: '#6366F1' },
  { id: 'review',      label: 'In Review',   dotColor: '#D97706' },
  { id: 'done',        label: 'Done',        dotColor: '#059669' },
];

export interface UrgencyDef {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const URGENCY_MAP: Record<string, UrgencyDef> = {
  low:    { label: 'Low',    color: '#059669', bg: '#ECFDF5', border: '#10B981' },
  medium: { label: 'Medium', color: '#4338CA', bg: '#EEF2FF', border: '#6366F1' },
  high:   { label: 'High',   color: '#C2410C', bg: '#FFF7ED', border: '#F97316' },
  urgent: { label: 'Urgent', color: '#991B1B', bg: '#FEF2F2', border: '#EF4444' },
};

export interface StatusDef {
  label: string;
  color: string;
  bg: string;
}

export const STATUS_MAP: Record<string, StatusDef> = {
  backlog:       { label: 'Backlog',     color: '#6B7280', bg: '#F9FAFB' },
  'in-progress': { label: 'In Progress', color: '#4338CA', bg: '#EEF2FF' },
  review:        { label: 'In Review',   color: '#92400E', bg: '#FFFBEB' },
  done:          { label: 'Done',        color: '#065F46', bg: '#ECFDF5' },
};

// Map API status → design column
export function statusToColumn(apiStatus: string): DesignColumn {
  switch (apiStatus) {
    case 'AI_DRAFT': return 'backlog';
    case 'TODO':     return 'backlog';
    case 'IN_PROGRESS': return 'in-progress';
    case 'REVIEW':   return 'review';
    case 'DONE':     return 'done';
    default:         return 'backlog';
  }
}

// Map design column → API status (for drag-drop)
export function columnToStatus(col: DesignColumn): string {
  switch (col) {
    case 'backlog':     return 'TODO';
    case 'in-progress': return 'IN_PROGRESS';
    case 'review':      return 'REVIEW';
    case 'done':        return 'DONE';
    default:            return 'TODO';
  }
}

// Map API urgency (uppercase) → design key (lowercase)
export function apiUrgencyToDesign(apiUrgency: string): string {
  return apiUrgency.toLowerCase();
}

export function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1)   return `${Math.abs(diff)}d overdue`;
  if (diff <= 7)   return `In ${diff}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOverdue(dateStr: string | null, column?: string): boolean {
  if (!dateStr || column === 'done') return false;
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return d < new Date();
}
