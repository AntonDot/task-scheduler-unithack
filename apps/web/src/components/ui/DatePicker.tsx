import { useState, useRef, useEffect } from 'react';
import type { Theme } from '@/theme/theme';
import { IcoCalendar, IcoChevronL, IcoChevronR } from '@/components/ui/Icons';

interface DatePickerProps {
  value: string | null;
  onChange: (val: string) => void;
  accent?: string;
  theme?: Theme;
  placeholder?: string;
  readonly?: boolean;
}

export function DatePicker({ value, onChange, accent = '#6366F1', theme, placeholder = 'Set deadline', readonly }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  
  function formatDate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = value ? new Date(value.includes('T') ? value : value + 'T00:00:00') : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  const surf = theme?.surface || '#fff';
  const bord = theme?.border  || '#E5E7EB';
  const txt  = theme?.text    || '#111827';
  const txt2 = theme?.textSecondary || '#6B7280';
  const txtM = theme?.textMuted     || '#9CA3AF';
  const col  = theme?.columnBg      || '#F3F4F6';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selDate = value ? new Date(value.includes('T') ? value : value + 'T00:00:00') : null;
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const yr = viewDate.getFullYear();
  const mo = viewDate.getMonth();
  const daysCount = new Date(yr, mo + 1, 0).getDate();
  const startDay  = new Date(yr, mo, 1).getDay();
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const overdue = selDate && selDate < today;
  const displayStr = selDate
    ? selDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;

  const navBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', color: txt2,
    padding: '5px 7px', borderRadius: 7, display: 'flex', fontFamily: 'inherit',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${overdue ? '#FECACA' : bord}`,
          background: overdue ? '#FEF2F2' : surf,
          color: selDate ? (overdue ? '#991B1B' : txt) : txtM,
          fontSize: 12.5, fontWeight: 500, cursor: readonly ? 'default' : 'pointer',
          fontFamily: 'inherit', transition: 'border-color 0.12s',
        }}
        onClick={() => !readonly && setOpen(o => !o)}
        onMouseEnter={e => !readonly && (e.currentTarget.style.borderColor = accent)}
        onMouseLeave={e => !readonly && (e.currentTarget.style.borderColor = overdue ? '#FECACA' : bord)}
      >
        <IcoCalendar size={13} />
        {displayStr}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: surf, border: `1px solid ${bord}`,
          borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
          zIndex: 600, width: 268, padding: '14px 14px 10px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button style={navBtn} onClick={() => setViewDate(new Date(yr, mo - 1, 1))}
              onMouseEnter={e => (e.currentTarget.style.background = col)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <IcoChevronL size={15} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: txt, letterSpacing: '-0.01em' }}>{monthLabel}</span>
            <button style={navBtn} onClick={() => setViewDate(new Date(yr, mo + 1, 1))}
              onMouseEnter={e => (e.currentTarget.style.background = col)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <IcoChevronR size={15} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: txtM, padding: '2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: startDay }, (_, i) => <div key={'e' + i} />)}
            {Array.from({ length: daysCount }, (_, i) => {
              const day = i + 1;
              const date = new Date(yr, mo, day); date.setHours(0, 0, 0, 0);
              const isSel   = selDate ? date.getTime() === selDate.getTime() : false;
              const isToday = date.getTime() === today.getTime();
              const isPast  = date < today;
              return (
                <button key={day}
                  onClick={() => { onChange(formatDate(date)); setOpen(false); }}
                  style={{
                    padding: '5px 2px', border: 'none', borderRadius: 7,
                    fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: isSel || isToday ? 600 : 400,
                    background: isSel ? accent : (isToday ? accent + '20' : 'transparent'),
                    color: isSel ? 'white' : (isToday ? accent : (isPast ? txtM : txt)),
                    transition: 'background 0.1s',
                    outline: isToday && !isSel ? `2px solid ${accent}44` : 'none',
                    outlineOffset: -1,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: `1px solid ${bord}`, paddingTop: 10 }}>
            <button onClick={() => { onChange(formatDate(today)); setOpen(false); }}
              style={{ flex: 1, padding: '6px 8px', border: `1px solid ${bord}`, borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 500, color: txt2, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.background = col)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              Today
            </button>
            {selDate && (
              <button onClick={() => { onChange(''); setOpen(false); }}
                style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 11.5, color: txtM, fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.background = col)}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
