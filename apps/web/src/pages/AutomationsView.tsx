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
import { fetchProjectTags, type ProjectTag } from '@/api/tags';
import { useT } from '@/i18n';

type Tab = 'my' | 'catalog' | 'triggers' | 'history';

interface AutomationsViewProps {
  projectId: number;
  accent: string;
  theme: Theme;
  isMobile?: boolean;
}

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
  tag_changed:     new Set(['tag_equals', 'field_value_equals']),
  review_received: new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
  github_event:    new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
  webhook_generic: new Set(['field_value_equals', 'numeric_compare', 'contains', 'regex_match']),
};

const ALLOWED_ACTION_TYPES: Record<string, Set<string>> = {
  task_created:    new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  task_updated:    new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  column_changed:  new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  tag_changed:     new Set(['change_column', 'assign_user', 'send_notification', 'create_task']),
  review_received: new Set(['send_notification', 'create_task']),
  github_event:    new Set(['send_notification', 'create_task']),
  webhook_generic: new Set(['send_notification', 'create_task']),
};

function buildWebhookUrl(token: string): string {
  const base = (import.meta as any).env?.VITE_API_BASE || `${window.location.origin}/api/v1`;
  const trimmed = String(base).replace(/\/+$/, '');
  return `${trimmed}/webhooks/${token}`;
}

export function AutomationsView({ projectId, accent, theme, isMobile }: AutomationsViewProps) {
  const t = useT();
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

  // Arrays defined inside the component so they can use t()
  const TRIGGER_TYPES_LABELED = [
    // Internal (board events)
    { id: 'task_created',    label: t('automations.triggers.task_created'),    category: 'internal' },
    { id: 'task_updated',    label: t('automations.triggers.task_updated'),    category: 'internal' },
    { id: 'column_changed',  label: t('automations.triggers.column_changed'),  category: 'internal' },
    { id: 'tag_changed',    label: t('automations.triggers.tag_changed'),    category: 'internal' },
    // External (require webhook URL or scraper)
    { id: 'review_received', label: t('automations.triggers.review_received'), category: 'external' },
    { id: 'github_event',    label: t('automations.triggers.github_event'),    category: 'external' },
    { id: 'webhook_generic', label: t('automations.triggers.webhook_generic'), category: 'external' },
  ];

  const CONDITION_TYPES = [
    { id: 'field_value_equals', label: t('automations.conditions.field_value_equals') },
    { id: 'column_equals',      label: t('automations.conditions.column_equals') },
    { id: 'numeric_compare',    label: t('automations.conditions.numeric_compare') },
    { id: 'contains',           label: t('automations.conditions.contains') },
    { id: 'regex_match',        label: t('automations.conditions.regex_match') },
    { id: 'tag_equals',         label: t('automations.conditions.tag_equals') },
  ];

  const ACTION_TYPES = [
    { id: 'change_column',      label: t('automations.actions.change_column') },
    { id: 'assign_user',        label: t('automations.actions.assign_user') },
    { id: 'send_notification',  label: t('automations.actions.send_notification') },
    { id: 'create_task',        label: t('automations.actions.create_task') },
  ];

  function externalTriggerHint(triggerType: string): string | null {
    switch (triggerType) {
      case 'github_event':
        return t('automations.builder.githubHint');
      case 'review_received':
        return t('automations.builder.reviewHint');
      case 'webhook_generic':
        return t('automations.builder.genericHint');
      default:
        return null;
    }
  }

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

  const { data: projectTags = [] } = useQuery<ProjectTag[]>({
    queryKey: ['tags', projectId],
    queryFn: () => fetchProjectTags(projectId),
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
    if (window.confirm(t('automations.builder.rotateConfirm'))) {
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
    if (!newName.trim()) return alert(t('automations.builder.nameRequired'));
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
        padding: isMobile ? '10px 14px' : '8px 16px', border: 'none', background: 'none',
        fontSize: isMobile ? 13.5 : 14, fontWeight: activeTab === id ? 600 : 500,
        color: activeTab === id ? accent : th.textMuted,
        borderBottom: activeTab === id ? `2px solid ${accent}` : 'none',
        cursor: 'pointer', transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
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
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', color: th.text
    }}>
      {/* Non-scrolling area: header + tab bar always stay visible */}
      <div style={{
        padding: isMobile ? 'calc(var(--sat, 0px) + 16px) 16px 0' : '28px 32px 0',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: th.text, margin: 0 }}>{t('automations.title')}</h2>
            <p style={{ fontSize: isMobile ? 12 : 13, color: th.textSecondary, marginTop: 4, lineHeight: 1.4 }}>
              {t('automations.subtitle')}
            </p>
          </div>
          <button
            onClick={() => { resetBuilder(); setShowBuilder(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: isMobile ? '8px 14px' : '10px 18px', borderRadius: 10, border: 'none',
              background: accent, color: 'white', fontSize: isMobile ? 13 : 14, fontWeight: 600,
              cursor: 'pointer', boxShadow: `0 4px 12px ${accent}40`, flexShrink: 0,
            }}
          >
            <IcoPlus size={14} />
            {isMobile ? t('common.add') : t('automations.create')}
          </button>
        </div>

        {/* marginLeft/Right: -16 must equal the wrapper paddingLeft/Right: 16 to stay within overflow:hidden root */}
        <div style={{
          display: 'flex',
          gap: isMobile ? 12 : 20,
          borderBottom: `1px solid ${th.border}`,
          overflowX: isMobile ? 'auto' : 'visible',
          marginLeft: isMobile ? -16 : 0,
          marginRight: isMobile ? -16 : 0,
          paddingLeft: isMobile ? 16 : 0,
          scrollbarWidth: 'none',
        }}>
          <TabButton id="my" label={t('automations.tabs.myAutomations')} />
          <TabButton id="catalog" label={t('automations.tabs.templates')} />
          <TabButton id="triggers" label={t('automations.tabs.customTriggers')} />
          <TabButton id="history" label={t('automations.tabs.history')} />
        </div>
      </div>

      {/* Scrollable content area only */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? '24px 16px 120px' : '24px 32px 28px',
      }}>

      {activeTab === 'my' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.length === 0 && !loadingAutos && (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: th.surface, borderRadius: 16, border: `1px dashed ${th.border}` }}>
              <p style={{ color: th.textMuted, fontSize: 14 }}>{t('automations.empty')}</p>
            </div>
          )}
          {automations.map(auto => (
            <div key={auto.id} style={{
              background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14,
              padding: isMobile ? '14px' : '16px 20px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? 14 : 16,
              opacity: auto.is_active ? 1 : 0.6, transition: 'opacity 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <Toggle val={auto.is_active} onChange={(v) => toggleMutation.mutate({ id: auto.id, is_active: v })} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: isMobile ? 14.5 : 15, fontWeight: 700, color: th.text, margin: 0 }}>{auto.name}</p>
                    <span style={{ fontSize: 10.5, color: th.textMuted }}>• {auto.stats_runs} {t('automations.runs')}</span>
                  </div>
                </div>
                {isMobile && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => handleEdit(auto)} style={{ background: 'none', border: 'none', color: th.textMuted }}><IcoEdit size={16} /></button>
                    <button onClick={() => deleteMutation.mutate(auto.id)} style={{ background: 'none', border: 'none', color: th.textMuted }}><IcoTrash size={16} /></button>
                  </div>
                )}
              </div>

              {!isMobile && (
                <div style={{ flex: 1, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10.5, background: th.bg, border: `1px solid ${th.border}`, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ fontWeight: 600, opacity: 0.7 }}>{t('automations.summary.when')}</span> {TRIGGER_TYPES_LABELED.find(tt => tt.id === auto.config.trigger.type)?.label || auto.config.trigger.type}
                    </div>
                    <IcoChevronR size={10} />
                    <div style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10.5, background: `${accent}15`, color: accent, border: `1px solid ${accent}30`, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ fontWeight: 600, opacity: 0.7 }}>{t('automations.summary.then')}</span> {auto.config.actions.map(a => ACTION_TYPES.find(at => at.id === a.type)?.label || a.type).join(', ')}
                    </div>
                  </div>
                </div>
              )}

              <div style={{
                textAlign: isMobile ? 'left' : 'right',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: isMobile ? '100%' : 'auto',
                gap: 16,
                borderTop: isMobile ? `1px solid ${th.border}` : 'none',
                paddingTop: isMobile ? 10 : 0
              }}>
                <div style={{ fontSize: 11.5, color: th.textMuted }}>
                   {t('automations.timeSaved')}: {auto.stats_runs * 2} {t('automations.min')}..
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => { setSelectedAutoForHistory(auto.id); setActiveTab('history'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600 }}>{t('automations.logs')}</button>
                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => handleEdit(auto)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                        <IcoEdit size={16} />
                      </button>
                      <button onClick={() => deleteMutation.mutate(auto.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                        <IcoTrash size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'catalog' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {catalog.map(cat => (
            <div key={cat.category} style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 10, marginBottom: 12, color: th.text }}>{cat.category}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {cat.templates.map(tmpl => (
                  <div key={tmpl.name} style={{
                    background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, padding: '16px',
                    cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
                  }} onClick={() => {
                    setNewName(tmpl.name);
                    setTrigger(tmpl.config.trigger);
                    setConditions(tmpl.config.conditions);
                    setActions(tmpl.config.actions);
                    setShowBuilder(true);
                  }}>
                    <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: th.text }}>{tmpl.name}</p>
                    <p style={{ fontSize: 12.5, color: th.textSecondary, lineHeight: 1.5, margin: 0 }}>{tmpl.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'triggers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: isMobile ? '16px' : '20px 24px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14 }}>
            <h3 style={{ fontSize: isMobile ? 16 : 17, fontWeight: 700, marginBottom: 6, margin: 0, color: th.text }}>{t('automations.customWebhooks')}</h3>
            <p style={{ fontSize: 12.5, color: th.textSecondary, marginTop: 6, marginBottom: 0, lineHeight: 1.4 }}>
              {t('automations.customWebhooksHint')}
            </p>
          </div>

          {externalAutomations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: th.textMuted, background: th.surface, borderRadius: 14, border: `1px dashed ${th.border}` }}>
              <IcoBolt size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ marginBottom: 4, fontWeight: 600, color: th.textSecondary, fontSize: 14 }}>{t('automations.noExternalTriggers')}</p>
              <p style={{ fontSize: 12 }}>{t('automations.noExternalTriggersHint')}</p>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {externalAutomations.map(auto => {
                const url = buildWebhookUrl(auto.webhook_token!);
                const triggerLabel = TRIGGER_TYPES_LABELED.find(tt => tt.id === auto.config.trigger.type)?.label || auto.config.trigger.type;
                return (
                  <div key={auto.id} style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ fontWeight: 700, margin: 0, color: th.text }}>{auto.name}</p>
                      <Toggle val={auto.is_active} onChange={(v) => toggleMutation.mutate({ id: auto.id, is_active: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                       <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10.5, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>{triggerLabel}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                       <code style={{ fontSize: 11, color: th.textSecondary, padding: '8px', background: th.bg, borderRadius: 8, border: `1px solid ${th.border}`, wordBreak: 'break-all' }}>{url}</code>
                       <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => copyToClipboard(url)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surface, fontSize: 12, color: th.text }}>{t('common.copy')}</button>
                          <button onClick={() => handleRotate(auto.id)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surface, fontSize: 12, color: th.text }}>{t('automations.rotate')}</button>
                          <button onClick={() => handleEdit(auto)} style={{ width: 40, borderRadius: 8, border: `1px solid ${th.border}`, background: th.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textMuted }}><IcoEdit size={14} /></button>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead style={{ background: th.bg, borderBottom: `1px solid ${th.border}` }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '20%', color: th.text }}>{t('automations.table.name')}</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '14%', color: th.text }}>{t('automations.table.trigger')}</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, color: th.text }}>{t('automations.table.webhookUrl')}</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600, width: '8%', color: th.text }}>{t('automations.table.active')}</th>
                    <th style={{ textAlign: 'right', padding: '11px 18px', fontWeight: 600, width: '14%', color: th.text }}>{t('automations.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {externalAutomations.map(auto => {
                    const url = buildWebhookUrl(auto.webhook_token!);
                    const hint = externalTriggerHint(auto.config.trigger.type);
                    const triggerLabel = TRIGGER_TYPES_LABELED.find(tt => tt.id === auto.config.trigger.type)?.label || auto.config.trigger.type;
                    return (
                      <tr key={auto.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '12px 18px', fontWeight: 600, color: th.text }}>{auto.name}</td>
                        <td style={{ padding: '12px 18px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>{triggerLabel}</span>
                        </td>
                        <td style={{ padding: '12px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ fontSize: 11.5, color: th.textSecondary, padding: '4px 8px', background: th.bg, borderRadius: 6, border: `1px solid ${th.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320, display: 'inline-block' }} title={url}>{url}</code>
                            <button onClick={() => copyToClipboard(url)} title={t('common.copy')} style={{ background: 'none', border: `1px solid ${th.border}`, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, color: th.text }}>{t('common.copy')}</button>
                          </div>
                          {hint && <p style={{ fontSize: 11, color: th.textMuted, marginTop: 6, marginBottom: 0, lineHeight: 1.4 }}>{hint}</p>}
                        </td>
                        <td style={{ padding: '12px 18px' }}>
                          <Toggle val={auto.is_active} onChange={(v) => toggleMutation.mutate({ id: auto.id, is_active: v })} />
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                          <button onClick={() => handleRotate(auto.id)} title={t('automations.rotate')} style={{ background: 'none', border: `1px solid ${th.border}`, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: th.textSecondary, marginRight: 6 }}>{t('automations.rotate')}</button>
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
              style={{ ...selectStyle, width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 'none' : 250 }}
            >
              <option value="">{t('automations.allAutomations')}</option>
              {automations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: th.textMuted, background: th.surface, borderRadius: 14 }}>
                   {selectedAutoForHistory ? t('automations.noLogs') : t('automations.noRuns')}
                </div>
              ) : (
                history.map(log => (
                  <div key={log.id} style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                       <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{automations.find(a => a.id === log.automation_id)?.name || t('automations.deleted')}</p>
                       <span style={{ color: log.status === 'success' ? '#059669' : '#DC2626', fontWeight: 700, fontSize: 11 }}>
                          {log.status === 'success' ? t('common.success') : t('common.error')}
                       </span>
                    </div>
                    <p style={{ fontSize: 11, color: th.textMuted, marginBottom: 8 }}>{new Date(log.ran_at).toLocaleString()}</p>
                    <div style={{ fontSize: 11.5, color: th.textSecondary, background: th.bg, padding: '8px', borderRadius: 8, border: `1px solid ${th.border}`, overflowX: 'auto' }}>
                       {JSON.stringify(log.details)}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead style={{ background: th.bg, borderBottom: `1px solid ${th.border}` }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>{t('automations.table.automation')}</th>
                    <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>{t('automations.table.status')}</th>
                    <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>{t('automations.table.date')}</th>
                    <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600 }}>{t('automations.table.details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: th.textMuted }}>
                        {selectedAutoForHistory ? t('automations.noLogs') : t('automations.noRuns')}
                      </td>
                    </tr>
                  ) : (
                    history.map(log => (
                      <tr key={log.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '12px 20px' }}>{automations.find(a => a.id === log.automation_id)?.name || t('automations.deleted')}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ color: log.status === 'success' ? '#059669' : '#DC2626', fontWeight: 600 }}>
                            {log.status === 'success' ? t('common.success') : t('common.error')}
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
          )}
        </div>
      )}

      </div>{/* end scrollable content */}

      {/* Builder Modal */}
      {showBuilder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { setShowBuilder(false); resetBuilder(); }}>
          <div style={{
            width: '100%', maxWidth: 700, maxHeight: isMobile ? '92vh' : '90vh', overflowY: 'auto',
            background: th.surface, borderRadius: isMobile ? '24px 24px 0 0' : 24, padding: isMobile ? '24px 20px' : '32px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, margin: 0, color: th.text }}>{editingId ? t('automations.builder.editTitle') : t('automations.builder.createTitle')}</h3>
              <button onClick={() => { setShowBuilder(false); resetBuilder(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
                <IcoX size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: th.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('automations.builder.name')}</p>
              <input
                placeholder={t('automations.builder.namePlaceholder')}
                value={newName} onChange={e => setNewName(e.target.value)}
                style={{ ...selectStyle, padding: '12px' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('automations.builder.when')}</p>
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
                  <optgroup label={t('automations.builder.internal')}>
                    {TRIGGER_TYPES_LABELED.filter(tt => tt.category === 'internal').map(tt => <option key={tt.id} value={tt.id}>{tt.label}</option>)}
                  </optgroup>
                  <optgroup label={t('automations.builder.externalWebhook')}>
                    {TRIGGER_TYPES_LABELED.filter(tt => tt.category === 'external').map(tt => <option key={tt.id} value={tt.id}>{tt.label}</option>)}
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
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, margin: '0 0 6px 0' }}>{t('automations.builder.hmacSecret')}</p>
                          <input
                            placeholder={t('automations.builder.hmacHint')}
                            value={(trigger as any).params?.secret || ''}
                            onChange={e => setTrigger({ ...trigger, params: { ...((trigger as any).params || {}), secret: e.target.value } } as any)}
                            style={selectStyle}
                            type="password"
                          />
                        </div>
                      )}
                      {url ? (
                        <div>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, margin: '0 0 6px 0' }}>{t('automations.builder.webhookUrl')}</p>
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 6 }}>
                            <code style={{ flex: 1, fontSize: 11, color: th.textSecondary, padding: '8px', background: th.bg, borderRadius: 6, border: `1px solid ${th.border}`, overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-all' }} title={url}>{url}</code>
                            <button type="button" onClick={() => copyToClipboard(url)} style={{ background: 'none', border: `1px solid ${th.border}`, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>{t('common.copy')}</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 11.5, color: th.textMuted, margin: 0 }}>{t('automations.builder.webhookUrlAfterSave')}</p>
                      )}
                      {hint && <p style={{ fontSize: 11, color: th.textMuted, marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>{hint}</p>}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('automations.builder.if')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conditions.map((cond, idx) => (
                  <div key={idx} style={{ padding: '16px', background: th.bg, borderRadius: 12, border: `1px solid ${th.border}`, position: 'relative' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                      <select
                        value={cond.type}
                        onChange={e => {
                          const newC = [...conditions];
                          newC[idx] = { ...newC[idx], type: e.target.value, params: {} };
                          setConditions(newC);
                        }}
                        style={selectStyle}
                      >
                        {CONDITION_TYPES.filter(ct => (ALLOWED_CONDITION_TYPES[trigger.type] ?? new Set()).has(ct.id)).map(ct => <option key={ct.id} value={ct.id}>{ct.label}</option>)}
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
                          <option value="">{t('automations.builder.selectColumn')}</option>
                          {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}

                      {cond.type === 'field_value_equals' && (
                        <>
                          <input
                            placeholder={t('automations.builder.fieldPlaceholder')}
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder={t('automations.builder.expectedValue')}
                            value={cond.params.value ?? ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'numeric_compare' && (
                        <>
                          <input
                            placeholder={t('automations.builder.fieldRating')}
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
                            placeholder={t('automations.builder.value')}
                            value={cond.params.value ?? ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:Number(e.target.value)}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'contains' && (
                        <>
                          <input
                            placeholder={t('automations.builder.fieldPrTitle')}
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder={t('automations.builder.substring')}
                            value={cond.params.value || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, value:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'regex_match' && (
                        <>
                          <input
                            placeholder={t('automations.builder.fieldBranch')}
                            value={cond.params.field || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, field:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                          <input
                            placeholder={t('automations.builder.regexPattern')}
                            value={cond.params.pattern || ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={...n[idx].params, pattern:e.target.value}; setConditions(n); }}
                            style={selectStyle}
                          />
                        </>
                      )}

                      {cond.type === 'tag_equals' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: 'span 1' }}>
                          <select
                            value={cond.params.tag_id ?? ''}
                            onChange={e => { const n=[...conditions]; n[idx].params={tag_id: Number(e.target.value)}; setConditions(n); }}
                            style={selectStyle}
                          >
                            <option value="">{t('automations.builder.selectTag')}</option>
                            {projectTags.map(tag => (
                              <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                          </select>
                          {cond.params.tag_id && (() => {
                            const selectedTag = projectTags.find(tag => tag.id === cond.params.tag_id);
                            return selectedTag ? (
                              <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedTag.color, flexShrink: 0 }} />
                            ) : null;
                          })()}
                        </div>
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
                  style={{ padding: '12px', background: 'none', border: `1px dashed ${th.border}`, borderRadius: 12, color: th.textSecondary, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {t('automations.builder.addCondition')}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('automations.builder.then')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actions.map((act, idx) => (
                  <div key={idx} style={{ padding: '16px', background: th.bg, borderRadius: 12, border: `1px solid ${th.border}`, position: 'relative' }}>
                    {actions.length > 1 && (
                      <button
                        onClick={() => setActions(actions.filter((_, i) => i !== idx))}
                        title={t('automations.builder.removeAction')}
                        style={{ position: 'absolute', top: -10, right: -10, width: 24, height: 24, borderRadius: '50%', background: th.surface, border: `1px solid ${th.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, color: th.text }}
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
                        {ACTION_TYPES.filter(at => (ALLOWED_ACTION_TYPES[trigger.type] ?? new Set()).has(at.id)).map(at => <option key={at.id} value={at.id}>{at.label}</option>)}
                      </select>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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
                            <option value="">{t('automations.builder.firstColumnDefault')}</option>
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
                            <option value="">{t('automations.builder.selectMember')}</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                        )}

                        {act.type === 'send_notification' && (
                          <>
                            <input
                              placeholder={t('automations.builder.notifText')}
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
                              <option value="">{t('automations.builder.assigneeDefault')}</option>
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
                              <option value="">{t('automations.builder.firstColumnDefault')}</option>
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
                              placeholder={t('automations.builder.taskTitle')}
                              value={act.params.title || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, title: e.target.value}; setActions(n); }}
                              style={{ ...selectStyle, gridColumn: isMobile ? 'auto' : '1 / -1' }}
                            />
                            <textarea
                              placeholder={t('automations.builder.taskDescription')}
                              value={act.params.description || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, description: e.target.value}; setActions(n); }}
                              rows={3}
                              style={{ ...selectStyle, gridColumn: isMobile ? 'auto' : '1 / -1', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <select
                              value={act.params.assignee_id || ''}
                              onChange={e => { const n=[...actions]; n[idx].params={...n[idx].params, assignee_id: e.target.value ? Number(e.target.value) : null}; setActions(n); }}
                              style={{ ...selectStyle, gridColumn: isMobile ? 'auto' : '1 / -1' }}
                            >
                              <option value="">{t('automations.builder.noAssignee')}</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                            </select>
                            <p style={{ fontSize: 11, color: th.textMuted, gridColumn: isMobile ? 'auto' : '1 / -1', margin: 0, lineHeight: 1.4 }}>{t('automations.builder.tipPayload')}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setActions([...actions, { type: 'send_notification', params: {} }])}
                  style={{ padding: '12px', background: 'none', border: `1px dashed ${th.border}`, borderRadius: 12, color: th.textSecondary, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {t('automations.builder.addAction')}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => { setShowBuilder(false); resetBuilder(); }} style={{
                padding: '12px 20px', borderRadius: 12, border: `1px solid ${th.border}`,
                background: 'none', color: th.text, fontWeight: 600, cursor: 'pointer',
                order: isMobile ? 2 : 1
              }}>
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutationCall.isPending}
                style={{
                  padding: '12px 24px', borderRadius: 12, border: 'none',
                  background: accent, color: 'white', fontWeight: 700, cursor: 'pointer',
                  opacity: (createMutation.isPending || updateMutationCall.isPending) ? 0.6 : 1,
                  boxShadow: `0 4px 12px ${accent}44`,
                  order: isMobile ? 1 : 2
                }}
              >
                {editingId
                  ? (updateMutationCall.isPending ? t('common.updating') : t('common.update'))
                  : (createMutation.isPending ? t('common.saving') : t('common.save'))
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
