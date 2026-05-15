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



export interface UrgencyDef {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export function getUrgencyMap(dark: boolean): Record<string, UrgencyDef> {
  if (dark) {
    return {
      low:    { label: 'Low',    color: '#6EE7B7', bg: '#022C22', border: '#10B981' },
      medium: { label: 'Medium', color: '#A5B4FC', bg: '#1E1B4B', border: '#6366F1' },
      high:   { label: 'High',   color: '#FDBA74', bg: '#431407', border: '#F97316' },
      urgent: { label: 'Urgent', color: '#FCA5A5', bg: '#450A0A', border: '#EF4444' },
    };
  }
  return {
    low:    { label: 'Low',    color: '#059669', bg: '#ECFDF5', border: '#10B981' },
    medium: { label: 'Medium', color: '#4338CA', bg: '#EEF2FF', border: '#6366F1' },
    high:   { label: 'High',   color: '#C2410C', bg: '#FFF7ED', border: '#F97316' },
    urgent: { label: 'Urgent', color: '#991B1B', bg: '#FEF2F2', border: '#EF4444' },
  };
}

export const URGENCY_MAP: Record<string, UrgencyDef> = getUrgencyMap(false);



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

export function isOverdue(dateStr: string | null, isDone: boolean = false): boolean {
  if (!dateStr || isDone) return false;
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return d < new Date();
}
