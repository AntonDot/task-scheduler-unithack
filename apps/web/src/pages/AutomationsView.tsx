import { useState } from 'react';
import type { Theme } from '@/theme/theme';
import { IcoChevronR } from '@/components/ui/Icons';
import { runReviewScraper, type ReviewScrapeResult } from '@/api/automations';

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  runs: number;
  lastRun: string;
  triggerColor: string;
  actionColor: string;
  real?: boolean;
}

const STATIC_AUTOMATIONS: Automation[] = [
  { id: 'a2', name: 'Overdue escalation',      trigger: 'Deadline is overdue',    action: 'Escalate urgency to Urgent',  active: true,  runs: 12, lastRun: '1d ago',  triggerColor: '#DC2626', actionColor: '#F97316' },
  { id: 'a3', name: 'Auto-assign new tasks',   trigger: 'New task created',       action: 'Auto-assign to first available', active: false, runs: 8,  lastRun: '3d ago', triggerColor: '#4338CA', actionColor: '#6366F1' },
  { id: 'a4', name: 'Review request trigger',  trigger: 'Task moves to In Review', action: 'Create review request',       active: true,  runs: 23, lastRun: '5h ago', triggerColor: '#D97706', actionColor: '#B45309' },
  { id: 'a5', name: 'Assignment email alert',  trigger: 'Task assigned to user',  action: 'Send email notification',     active: true,  runs: 89, lastRun: '30m ago', triggerColor: '#6366F1', actionColor: '#2563EB' },
];

interface AutomationsViewProps { accent: string; theme: Theme; }

export function AutomationsView({ accent, theme }: AutomationsViewProps) {
  const th = theme;

  const [automations, setAutomations] = useState<Automation[]>(STATIC_AUTOMATIONS);
  const [scraperActive, setScraperActive] = useState(true);
  const [scraperRuns, setScraperRuns]   = useState(0);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperLog, setScraperLog]     = useState<ReviewScrapeResult | null>(null);
  const [showLog, setShowLog]           = useState(false);

  async function handleRunScraper() {
    if (scraperRunning) return;
    setScraperRunning(true);
    try {
      const result = await runReviewScraper();
      setScraperRuns(r => r + 1);
      setScraperLog(result);
      setShowLog(true);
    } catch (e) {
      setScraperLog({
        reviews_found: 0, negative_found: 0, tasks_created: 0,
        duplicates: 0, errors: 1,
        ran_at: new Date().toISOString(),
        details: [{ status: 'error', detail: e instanceof Error ? e.message : String(e) }],
      });
      setShowLog(true);
    } finally {
      setScraperRunning(false);
    }
  }

  function Toggle({ val, onChange }: { val: boolean; onChange: (v: boolean) => void }) {
    return (
      <div onClick={() => onChange(!val)} style={{
        width: 38, height: 22, borderRadius: 11,
        background: val ? accent : th.border,
        position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: val ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </div>
    );
  }

  const allRuns = scraperRuns + automations.reduce((s, a) => s + a.runs, 0);
  const activeCount = (scraperActive ? 1 : 0) + automations.filter(a => a.active).length;
  const totalCount = automations.length + 1;

  const stats = [
    { label: 'Total runs',   value: allRuns,      color: accent    },
    { label: 'Active rules', value: activeCount,   color: '#059669' },
    { label: 'Saved hours',  value: '12.4h',       color: '#D97706' },
  ];

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, margin: 0 }}>Automations</h2>
          <p style={{ fontSize: 13, color: th.textSecondary, marginTop: 4 }}>
            {activeCount} of {totalCount} rules active
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: th.textMuted, fontWeight: 500, marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* REAL automation — Review Scraper */}
        <div style={{
          background: th.surface,
          border: `1px solid ${scraperActive ? accent + '40' : th.border}`,
          borderRadius: 14, padding: '16px 20px',
          opacity: scraperActive ? 1 : 0.55, transition: 'opacity 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Toggle val={scraperActive} onChange={setScraperActive} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, margin: 0 }}>Review Monitor</p>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: accent + '18', color: accent, border: `1px solid ${accent}30` }}>
                  LIVE
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, background: '#DC262614', color: '#DC2626', border: '1px solid #DC262628' }}>
                  When: Negative review (★1-2) detected
                </span>
                <IcoChevronR size={12} />
                <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, background: accent + '14', color: accent, border: `1px solid ${accent}28` }}>
                  Then: Create URGENT task via AI
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: th.text, margin: 0 }}>{scraperRuns}</p>
                <p style={{ fontSize: 11, color: th.textMuted, margin: 0 }}>runs this session</p>
              </div>
              <button
                onClick={handleRunScraper}
                disabled={scraperRunning || !scraperActive}
                style={{
                  padding: '5px 12px', borderRadius: 7, border: 'none',
                  background: scraperActive ? accent : th.columnBg,
                  color: scraperActive ? 'white' : th.textMuted,
                  fontSize: 11.5, fontWeight: 600, cursor: scraperActive ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'all 0.12s',
                }}
              >
                {scraperRunning ? '⟳ Running…' : '▶ Run now'}
              </button>
            </div>
          </div>

          {/* Last run log */}
          {showLog && scraperLog && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: th.bg, borderRadius: 10, border: `1px solid ${th.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: th.text, margin: 0 }}>Last run result</p>
                <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 12 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Reviews found',  value: scraperLog.reviews_found,  color: th.textSecondary },
                  { label: 'Negative',        value: scraperLog.negative_found, color: '#DC2626' },
                  { label: 'Tasks created',   value: scraperLog.tasks_created,  color: '#059669' },
                  { label: 'Duplicates',      value: scraperLog.duplicates,     color: '#D97706' },
                  { label: 'Errors',          value: scraperLog.errors,         color: scraperLog.errors > 0 ? '#DC2626' : th.textMuted },
                ].map(stat => (
                  <span key={stat.label} style={{ fontSize: 11.5, color: stat.color }}>
                    <strong>{stat.value}</strong> {stat.label}
                  </span>
                ))}
              </div>
              {scraperLog.details.filter(d => d.status !== 'duplicate').map((d, i) => (
                <div key={i} style={{ fontSize: 11, color: d.status === 'created' ? '#059669' : d.status === 'error' ? '#DC2626' : th.textMuted, marginBottom: 2 }}>
                  {d.status === 'created' ? '✓' : d.status === 'error' ? '✗' : '↩'}
                  {d.author ? ` Review by ${d.author} (★${d.rating})` : ''} → {d.status}
                  {d.task_id ? ` (task #${d.task_id})` : ''}
                  {d.detail ? `: ${d.detail}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Static automations */}
        {automations.map(auto => (
          <div key={auto.id} style={{
            background: th.surface, border: `1px solid ${th.border}`,
            borderRadius: 14, padding: '16px 20px',
            opacity: auto.active ? 1 : 0.55, transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Toggle val={auto.active} onChange={v => setAutomations(prev => prev.map(a => a.id === auto.id ? { ...a, active: v } : a))} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, marginBottom: 5 }}>{auto.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, background: auto.triggerColor + '14', color: auto.triggerColor, border: `1px solid ${auto.triggerColor}28` }}>
                    When: {auto.trigger}
                  </span>
                  <IcoChevronR size={12} />
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, background: auto.actionColor + '14', color: auto.actionColor, border: `1px solid ${auto.actionColor}28` }}>
                    Then: {auto.action}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: th.text, margin: 0 }}>{auto.runs}</p>
                <p style={{ fontSize: 11, color: th.textMuted, margin: 0 }}>runs · {auto.lastRun}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
