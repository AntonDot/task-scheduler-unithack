import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Theme } from '@/theme/theme';
import { IcoChevronR, IcoPlus, IcoX, IcoTrash, IcoBolt, IcoEdit } from '@/components/ui/Icons';
import {
  listAutomations,
  updateAutomation,
  getAutomationCatalog,
  createAutomation,
  deleteAutomation,
  getAutomationHistory,
  getAllAutomationHistory,
  rotateWebhookToken,
  type Automation,
} from '@/api/automations';
import { fetchProjectMembers } from '@/api/members';
import { fetchColumns } from '@/api/columns';

type Tab = 'my' | 'catalog' | 'triggers' | 'history';

interface AutomationsViewProps {
  projectId: number;
  accent: string;
  theme: Theme;
}

const TRIGGER_TYPES = [
  // Internal (board events)
  { id: 'task_created',    label: 'Task created',     category: 'internal' },
  { id: 'task_updated',    label: 'Task updated',     category: 'internal' },
  { id: 'column_changed',  label: 'Column changed',   category: 'internal' },
  // External (require webhook URL or scraper)
  { id: 'review_received', label: 'Review received',  category: 'external' },
  { id: 'github_event',    label: 'GitHub event',     category: 'external' },
  { id: 'webhook_generic', label: 'Generic webhook',  category: 'external' },
];

const CONDITION_TYPES = [
  { id: 'field_value_equals', label: 'Field equals' },
  { id: 'column_equals',      label: 'Column equals' },
  { id: 'numeric_compare',    label: 'Number compare' },
  { id: 'contains',           label: 'Contains text' },
  { id: 'regex_match',        label: 'Regex match' },
];

const ACTION_TYPES = [
  { id: 'change_column',      label: 'Move to column' },
  { id: 'assign_user',        label: 'Assign user' },
  { id: 'send_notification',  label: 'Send notification' },
  { id: 'create_task',        label: 'Create task' },
];

const NUMERIC_OPS = [
  { id: 'gte', label: '≥' },
  { id: 'lte', label: '≤' },
  { id: 'gt',  label: '>' },
  { id: 'lt',  label: '<' },
  { id: 'eq',  label: '=' },
];

const URGENCY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const EXTERNAL_TRIGGER_IDS = new Set(['review_received', 'github_event', 'webhook_generic']);

const ALLOWED_CONDITION_TYPES: Record<string, Set<string>> = {
  task_created:    new Set(['field_value_equals', 'column_equals', 'numeric_compare', 'contains', 'regex_match']),
  task_updated:    new Set(['field_value_equals', 'column_equals', 'numeric_compare', 'contains', 'regex_match']),
  column_changed:  new Set(['field_value_equals', 'column_equals', 'numeric_compare', 'contains', 'regex_match']),
  review_received: new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
  github_event:    new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
  webhook_generic: new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
};

const ALLOWED_ACTION_TYPES: Record<string, Set<string>> = {
  task_created:    new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  task_updated:    new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  column_changed:  new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  review_received: new Set(['send_notification', 'create_task']),
  github_event:    new Set(['send_notification', 'create_task']),
  webhook_generic: new Set(['send_notification', 'create_task']),
};

function buildWebhookUrl(token: string): string {
  const base = (import.meta as any).env?.VITE_API_BASE || `${window.location.origin}/api/v1`;
  const trimmed = String(base).replace(/\/+$/, '');
  return `${trimmed}/webhooks/${token}`;
}

function externalTriggerHint(triggerType: string): string | null {
  switch (triggerType) {
    case 'github_event':
      return 'In your repo: Settings → Webhooks → Add → Payload URL: <url> → Content-type: application/json → optionally set Secret';
    case 'review_received':
      return 'Trigger via POST /api/v1/automations/run-review-scraper (or hit the webhook URL with your scraper)';
    case 'webhook_generic':
      return 'POST any JSON; use body.event_type to set the event name, body.payload for data';
    default:
      return null;
  }
}

export function AutomationsView({ projectId, accent, theme }: AutomationsViewProps) {
  const th = theme;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('my');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAutoForHistory, setSelectedAutoForHistory] = useState<string | null>(null);
  
  // Builder state
  const [newName, setNewName] = useState('');
  const [trigger, setTrigger] = useState<{ type: string; filters: any }>({ type: 'task_created', filters: {} });
  const [conditions, setConditions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([{ type: 'change_column', params: {} }]);

  const { data: automations = [], isLoading: loadingAutos } = useQuery({
    queryKey: ['automations', projectId],
    queryFn: () => listAutomations(projectId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => fetchProjectMembers(projectId),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ['columns', projectId],
    queryFn: () => fetchColumns(projectId),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['automations-catalog'],
    queryFn: getAutomationCatalog,
    enabled: activeTab === 'catalog',
  });

  const { data: history = [] } = useQuery({
    queryKey: ['automations-history', projectId, selectedAutoForHistory],
    queryFn: () => selectedAutoForHistory
      ? getAutomationHistory(selectedAutoForHistory)
      : getAllAutomationHistory(projectId),
    enabled: activeTab === 'history',
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Automation>) => createAutomation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', projectId] });
      setShowBuilder(false);
      resetBuilder();
    }
  });

  const updateMutationCall = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<Automation> }) => updateAutomation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', projectId] });
      setShowBuilder(false);
      resetBuilder();
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string, is_active: boolean }) => 
      updateAutomation(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', projectId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', projectId] });
    }
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotateWebhookToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations', projectId] }),
  });

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  function handleRotate(id: string) {
    if (window.confirm('Rotate webhook token? The previous URL will stop working immediately.')) {
      rotateMutation.mutate(id);
    }
  }

  const externalAutomations = automations.filter(a => a.webhook_token);

  function resetBuilder() {
    setNewName('');
    setTrigger({ type: 'task_created', filters: {} });
    setConditions([]);
    setActions([{ type: 'change_column', params: {} }]);
    setEditingId(null);
  }

  function handleSave() {
    if (!newName.trim()) return alert('Please enter automation name');
    const data = {
      project_id: projectId,
      name: newName,
      config: { trigger, conditions, actions }
    };
    
    if (editingId) {
      updateMutationCall.mutate({ id: editingId, data });
    } else {
      createMutation.mutate({ ...data, is_active: true });
    }
  }

  function handleEdit(auto: Automation) {
    setEditingId(auto.id);
    setNewName(auto.name);
    setTrigger(auto.config.trigger);
    setConditions(auto.config.conditions || []);
    setActions(auto.config.actions || []);
    setShowBuilder(true);
  }

  function Toggle({ val, onChange, disabled }: { val: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
      <div onClick={() => !disabled && onChange(!val)} style={{
        width: 38, height: 22, borderRadius: 11,
        background: val ? accent : th.border,
        position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}>
        <div style={{
          position: 'absolute', top: 3, left: val ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </div>
    );
  }

  const TabButton = ({ id, label }: { id: Tab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 16px', border: 'none', background: 'none',
        fontSize: 14, fontWeight: activeTab === id ? 600 : 500,
        color: activeTab === id ? accent : th.textMuted,
        borderBottom: activeTab === id ? `2px solid ${accent}` : 'none',
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );

  const selectStyle = {
    padding: '10px 12px', borderRadius: 8, border: `1px solid ${th.border}`,
    background: th.surface, color: th.text, fontSize: 14, outline: 'none', width: '100%'
  };

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: th.text, margin: 0 }}>Automations</h2>
          <p style={{ fontSize: 13, color: th.textSecondary, marginTop: 4 }}>
            Optimize your workflow by automating repetitive task actions.
          </p>
        </div>
        <button
          onClick={() => { resetBuilder(); setShowBuilder(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: accent, color: 'white', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', boxShadow: `0 4px 12px ${accent}40`,
          }}
        >
          <IcoPlus size={16} />
          Automation
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${th.border}`, marginBottom: 24 }}>
        <TabButton id="my" label="My Automations" />
        <TabButton id="catalog" label="Templates" />
        <TabButton id="triggers" label="Custom Triggers" />
        <TabButton id="history" label="History" />
      </div>

      {activeTab === 'my' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.length === 0 && !loadingAutos && (
            <div style={{ padding: '40px', textAlign: 'center', background: th.surface, borderRadius: 16, border: `1px dashed ${th.border}` }}>
              <p style={{ color: th.textMuted }}>You haven't created any automations yet.</p>
            </div>
          )}
          {automations.map(auto => (
            <div key={auto.id} style={{
              background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
              opacity: auto.is_active ? 1 : 0.6, transition: 'opacity 0.2s',
            }}>
              <Toggle val={auto.is_active} onChange={(v) => toggleMutation.mutate({ id: auto.id, is_active: v })} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: th.text, margin: 0 }}>{auto.name}</p>
                  <span style={{ fontSize: 11, color: th.textMuted }}>• {auto.stats_runs} runs</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: th.bg, border: `1px solid ${th.border}` }}>
                    When: {TRIGGER_TYPES.find(t => t.id === auto.config.trigger.type)?.label || auto.config.trigger.type}
                  </span>
                  <IcoChevronR size={12} />
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
                    Then: {auto.config.actions.map(a => ACTION_TYPES.find(at => at.id === a.type)?.label || a.type).join(', ')}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 12, color: th.textMuted }}>
                   Time saved: {auto.stats_runs * 2} min.
                </div>
                <button onClick={() => { setSelectedAutoForHistory(auto.id); setActiveTab('history'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600 }}>Logs</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => handleEdit(auto)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                    <IcoEdit size={16} />
                  </button>
                  <button onClick={() => deleteMutation.mutate(auto.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                    <IcoTrash size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'catalog' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {catalog.map(cat => (
            <div key={cat.category} style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10, marginBottom: 15 }}>{cat.category}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                {cat.templates.map(tmpl => (
                  <div key={tmpl.name} style={{
                    background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, padding: '20px',
                    cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
                  }} onClick={() => {
                    setNewName(tmpl.name);
                    setTrigger(tmpl.config.trigger);
                    setConditions(tmpl.config.conditions);
                    setActions(tmpl.config.actions);
                    setShowBuilder(true);
                  }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{tmpl.name}</p>
                    <p style={{ fontSize: 13, color: th.textSecondary, lineHeight: 1.5 }}>{tmpl.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'triggers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '20px 24px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, margin: 0 }}>Custom Webhooks</h3>
            <p style={{ fontSize: 13, color: th.textSecondary, marginTop: 6, marginBottom: 0 }}>
              External systems (GitHub, scrapers, custom integrations) POST events to these URLs to fire automations.
              Tokens are auto-generated when you create an automation with a GitHub / Review / Generic webhook trigger.
            </p>
          </div>

          {externalAutomations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, background: th.surface, borderRadius: 14, border: `1px dashed ${th.border}` }}>
              <IcoBolt size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ marginBottom: 4, fontWeight: 600, color: th.textSecondary }}>No external triggers yet</p>
              <p style={{ fontSize: 13 }}>Create an automation with trigger type "GitHub event", "Review received", or "Generic webhook".</p>
            </div>
          ) : (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead style={{ background: th.bg, borderBottom: `1px solid ${th.border}` }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '20%' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '14%' }}>Trigger</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600 }}>Webhook URL</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '8%' }}>Active</th>
                    <th style={{ textAlign: 'right', padding: '11px 18px', fontWeight: 600, width: '14%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {externalAutomations.map(auto => {
                    const url = buildWebhookUrl(auto.webhook_token!);
                    const hint = externalTriggerHint(auto.config.trigger.type);
                    const triggerLabel = TRIGGER_TYPES.find(t => t.id === auto.config.trigger.type)?.label || auto.config.trigger.type;
                    return (
                      <tr key={auto.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '12px 18px', fontWeight: 600 }}>{auto.name}</td>
                        <td style={{ padding: '12px 18px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>{triggerLabel}</span>
                        </td>
                        <td style={{ padding: '12px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ fontSize: 11.5, color: th.textSecondary, padding: '4px 8px', background: th.bg, borderRadius: 6, border: `1px solid ${th.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320, display: 'inline-block' }} title={url}>{url}</code>
                            <button onClick={() => copyToClipboard(url)} title="Copy URL" style={{ background: 'none', border: `1px solid ${th.border}`, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, color: th.text }}>Copy</button>
                          </div>
                          {hint && <p style={{ fontSize: 11, color: th.textMuted, marginTop: 6, marginBottom: 0, lineHeight: 1.4 }}>{hint}</p>}
                        </td>
                        <td style={{ padding: '12px 18px' }}>
                          <Toggle val={auto.is_active} onChange={(v) => toggleMutation.mutate({ id: auto.id, is_active: v })} />
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                          <button onClick={() => handleRotate(auto.id)} title="Rotate token" style={{ background: 'none', border: `1px solid ${th.border}`, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: th.textSecondary, marginRight: 6 }}>Rotate</button>
                          <button onClick={() => handleEdit(auto)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}>
                            <IcoEdit size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select 
              value={selectedAutoForHistory || ''} 
              onChange={e => setSelectedAutoForHistory(e.target.value || null)}
              style={{ ...selectStyle, width: 'auto', minWidth: 250 }}
            >
              <option value="">All automations...</option>
              {automations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead style={{ background: th.bg, borderBottom: `1px solid ${th.border}` }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>Automation</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: th.textMuted }}>
                      {selectedAutoForHistory ? 'No logs found for this automation.' : 'No automation runs yet.'}
                    </td>
                  </tr>
                ) : (
                  history.map(log => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                      <td style={{ padding: '12px 20px' }}>{automations.find(a => a.id === log.automation_id)?.name || 'Deleted'}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ color: log.status === 'success' ? '#059669' : '#DC2626', fontWeight: 600 }}>
                          {log.status === 'success' ? 'Success' : 'Error'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px' }}>{new Date(log.ran_at).toLocaleString()}</td>
                      <td style={{ padding: '12px 20px', color: th.textSecondary }}>{JSON.stringify(log.details)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { setShowBuilder(false); resetBuilder(); }}>
          <div style={{
            width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto',
            background: th.surface, borderRadius: 24, padding: '32px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{editingId ? 'Edit Automation' : 'Create Automation'}</h3>
              <button onClick={() => { setShowBuilder(false); resetBuilder(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                <IcoX size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: th.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>Name</p>
              <input 
                placeholder="e.g.: Auto-assign for new tasks"
                value={newName} onChange={e => setNewName(e.target.value)}
                style={{ ...selectStyle, padding: '12px' }} 
              />
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>When (Trigger)</p>
              <div style={{ padding: '16px', background: th.bg, borderRadius: 12, border: `1px solid ${th.border}` }}>
                <select
                  value={trigger.type}
                  onChange={e => {
                  const newType = e.target.value;
                  const allowedConds = ALLOWED_CONDITION_TYPES[newType] ?? new Set<string>();
                  const allowedActs  = ALLOWED_ACTION_TYPES[newType]    ?? new Set<string>();
                  setTrigger({ type: newType, filters: {} });
                  setConditions(prev => prev.filter(c => allowedConds.has(c.type)));
                  setActions(prev => {
                    const filtered = prev.filter(a => allowedActs.has(a.type));
                    return filtered.length > 0 ? filtered : [{ type: [...allowedActs][0] ?? 'send_notification', params: {} }];
                  });
                }}
                  style={selectStyle}
                >
                  <optgroup label="Internal">
                    {TRIGGER_TYPES.filter(t => t.category === 'internal').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </optgroup>
                  <optgroup label="External (webhook)">
                    {TRIGGER_TYPES.filter(t => t.category === 'external').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </optgroup>
                </select>

                {/* GitHub HMAC secret + external trigger hint + webhook URL (for existing automation) */}
                {EXTERNAL_TRIGGER_IDS.has(trigger.type) && (() => {
                  const editing = editingId ? automations.find(a => a.id === editingId) : null;
                  const url = editing?.webhook_token ? buildWebhookUrl(editing.webhook_token) : null;
                  const hint = externalTriggerHint(trigger.type);
                  return (
                    <div style={{ marginTop: 12, padding: '12px 14px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10 }}>
                      {trigger.type === 'github_event' && (
                        <div style={{ marginBottom: 10 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: th.textSecondary, margin: '0 0 6px 0' }}>HMAC secret (optional)</p>
                          <input
                            placeholder="leave empty to skip signature verification"
                            value={(trigger as any).params?.secret || ''}
                            onChange={e => setTrigger({ ...trigger, params: { ...((trigger as any).params || {}), secret: e.target.value } } as any)}
                            style={selectStyle}
                            type="password"
                          />
                        </div>
                      )}
                      {url ? (
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: th.textSecondary, margin: '0 0 6px 0' }}>Webhook URL</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <code style={{ flex: 1, fontSize: 11.5, color: th.textSecondary, padding: '6px 10px', background: th.bg, borderRadius: 6, border: `1px solid ${th.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>{url}</code>
                            <button type="button" onClick={() => copyToClipboard(url)} style={{ background: 'none', border: `1px solid ${th.border}`, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Copy</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: th.textMuted, margin: 0 }}>Webhook URL will be generated after saving.</p>
                      )}
                      {hint && <p style={{ fontSize: 11, color: th.textMuted, marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>{hint}</p>}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>If (Condition)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conditions.map((cond, idx) => (
                  <div key={idx} style={{ padding: '16px', background: th.bg, borderRadius: 12, border: `1px solid ${th.border}`, position: 'relative' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <select 
                        value={cond.type} 
                        onChange={e => {
                          const newC = [...conditions];
                          newC[idx] = { ...newC[idx], type: e.target.value, params: {} };
                          setConditions(newC);
                        }}
                        style={selectStyle}
                      >
                        {CONDITION_TYPES.filter(t => (ALLOWED_CONDITION_TYPES[trigger.type] ?? new Set()).has(t.id)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      
                      {cond.type === 'column_equals' && (
                        <select
                          value={cond.params.column_id || ''}
                          onChange={e => {
                            const newC = [...conditions];
                            newC[idx].params = { column_id: Number(e.target.value) };
                            setConditions(newC);
                          }}
                          style={selectStyle}
                        >
                          <option value="">Select column...</option>
                          {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}

                      {cond.type === 'field_value_equals' && (
                        <>
                          <input
                            placeholder="field (e.g. urgency)"
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder="expected value"
                            value={cond.params.value ?? ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'numeric_compare' && (
                        <>
                          <input
                            placeholder="field (e.g. review.rating)"
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <select
                            value={cond.params.op || 'eq'}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, op:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          >
                            {NUMERIC_OPS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <input
                            type="number"
                            placeholder="value"
                            value={cond.params.value ?? ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:Number(e.target.value)}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'contains' && (
                        <>
                          <input
                            placeholder="field (e.g. pr.title)"
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder="substring (case-insensitive)"
                            value={cond.params.value || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'regex_match' && (
                        <>
                          <input
                            placeholder="field (e.g. branch)"
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder="regex pattern"
                            value={cond.params.pattern || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, pattern:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}
                    </div>
                    <button 
                      onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                      style={{ position: 'absolute', top: -10, right: -10, width: 24, height: 24, borderRadius: '50%', background: th.surface, border: `1px solid ${th.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <IcoX size={14} />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const allowed = ALLOWED_CONDITION_TYPES[trigger.type] ?? new Set<string>();
                    const defaultType = allowed.has('column_equals') ? 'column_equals' : ([...allowed][0] ?? 'field_value_equals');
                    setConditions([...conditions, { type: defaultType, params: {} }]);
                  }}
                  style={{ padding: '12px', background: 'none', border: `1px dashed ${th.border}`, borderRadius: 12, color: th.textSecondary, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  + Add Condition
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Then (Action)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actions.map((act, idx) => (
                  <div key={idx} style={{ padding: '16px', background: th.bg, borderRadius: 12, border: `1px solid ${th.border}`, position: 'relative' }}>
                    {actions.length > 1 && (
                      <button
                        onClick={() => setActions(actions.filter((_, i) => i !== idx))}
                        title="Remove this action"
                        style={{ position: 'absolute', top: -10, right: -10, width: 24, height: 24, borderRadius: '50%', background: th.surface, border: `1px solid ${th.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                      >
                        <IcoX size={14} />
                      </button>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <select
                        value={act.type}
                        onChange={e => {
                          const newA = [...actions];
                          newA[idx] = { ...newA[idx], type: e.target.value, params: {} };
                          setActions(newA);
                        }}
                        style={selectStyle}
                      >
                        {ACTION_TYPES.filter(t => (ALLOWED_ACTION_TYPES[trigger.type] ?? new Set()).has(t.id)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {act.type === 'change_column' && (
                          <select 
                            value={act.params.column_id || ''} 
                            onChange={e => {
                              const newA = [...actions];
                              newA[idx].params = { column_id: Number(e.target.value) };
                              setActions(newA);
                            }}
                            style={selectStyle}
                          >
                            <option value="">Select column...</option>
                            {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}

                        {act.type === 'assign_user' && (
                          <select 
                            value={act.params.user_id || ''} 
                            onChange={e => {
                              const newA = [...actions];
                              newA[idx].params = { user_id: Number(e.target.value) };
                              setActions(newA);
                            }}
                            style={selectStyle}
                          >
                            <option value="">Select member...</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                        )}

                        {act.type === 'send_notification' && (
                          <>
                            <input
                              placeholder="Notification text (supports {{var}})"
                              value={act.params.message || ''}
                              onChange={e => {
                                const newA = [...actions];
                                newA[idx].params = { ...newA[idx].params, message: e.target.value };
                                setActions(newA);
                              }}
                              style={selectStyle}
                            />
                            <select
                              value={act.params.user_id || ''}
                              onChange={e => {
                                const newA = [...actions];
                                newA[idx].params = { ...newA[idx].params, user_id: Number(e.target.value) };
                                setActions(newA);
                              }}
                              style={selectStyle}
                            >
                              <option value="">Assignee (default)</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                            </select>
                          </>
                        )}

                        {act.type === 'create_task' && (
                          <>
                            <select
                              value={act.params.column_id || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, column_id: e.target.value ? Number(e.target.value) : null}; setActions(n); }}
                              style={selectStyle}
                            >
                              <option value="">First column (default)</option>
                              {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select
                              value={act.params.urgency || 'MEDIUM'}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, urgency: e.target.value}; setActions(n); }}
                              style={selectStyle}
                            >
                              {URGENCY_VALUES.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input
                              placeholder="Task title (supports {{var}})"
                              value={act.params.title || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, title: e.target.value}; setActions(n); }}
                              style={{ ...selectStyle, gridColumn: '1 / -1' }}
                            />
                            <textarea
                              placeholder="Task description (supports {{var}})"
                              value={act.params.description || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, description: e.target.value}; setActions(n); }}
                              rows={3}
                              style={{ ...selectStyle, gridColumn: '1 / -1', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <select
                              value={act.params.assignee_id || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, assignee_id: e.target.value ? Number(e.target.value) : null}; setActions(n); }}
                              style={{ ...selectStyle, gridColumn: '1 / -1' }}
                            >
                              <option value="">No assignee</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                            </select>
                            <p style={{ fontSize: 11, color: th.textMuted, gridColumn: '1 / -1', margin: 0 }}>Tip: use <code>{`{{review.rating}}`}</code>, <code>{`{{pr.title}}`}</code>, etc. for templated values from the event payload.</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setActions([...actions, { type: 'send_notification', params: {} }])}
                  style={{ padding: '12px', background: 'none', border: `1px dashed ${th.border}`, borderRadius: 12, color: th.textSecondary, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  + Add Action
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => { setShowBuilder(false); resetBuilder(); }} style={{
                padding: '10px 20px', borderRadius: 10, border: `1px solid ${th.border}`,
                background: 'none', color: th.text, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutationCall.isPending}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: accent, color: 'white', fontWeight: 600, cursor: 'pointer',
                  opacity: (createMutation.isPending || updateMutationCall.isPending) ? 0.6 : 1,
                }}
              >
                {editingId ? (updateMutationCall.isPending ? 'Updating...' : 'Update') : (createMutation.isPending ? 'Saving...' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
