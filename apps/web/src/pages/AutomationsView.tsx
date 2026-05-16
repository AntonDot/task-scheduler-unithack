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
  { id: 'task_created', label: 'Task created' },
  { id: 'task_updated', label: 'Task updated' },
  { id: 'column_changed', label: 'Column changed' },
];

const CONDITION_TYPES = [
  { id: 'field_value_equals', label: 'Field value equals' },
  { id: 'column_equals', label: 'Column equals' },
];

const ACTION_TYPES = [
  { id: 'change_column', label: 'Move to column' },
  { id: 'assign_user', label: 'Assign user' },
  { id: 'send_notification', label: 'Send notification' },
];

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
    queryKey: ['automations-history', selectedAutoForHistory],
    queryFn: () => getAutomationHistory(selectedAutoForHistory!),
    enabled: !!selectedAutoForHistory && activeTab === 'history',
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
          + Automation
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ padding: '24px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Custom Triggers (Webhooks)</h3>
            <p style={{ fontSize: 14, color: th.textSecondary, marginBottom: 20 }}>
              Add your own triggers that will fire upon receiving external POST requests. 
              The mechanism of the Covenant will be delivered later.
            </p>
            <button style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${th.border}`, background: th.bg, color: th.text, fontWeight: 600, cursor: 'not-allowed', opacity: 0.7 }}>
              + Add Trigger
            </button>
          </div>
          <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted }}>
            <IcoBolt size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <p>Your active webhooks will appear here.</p>
          </div>
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
                      {selectedAutoForHistory ? 'No logs found.' : 'Select an automation to view history.'}
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
                  onChange={e => setTrigger({ ...trigger, type: e.target.value })}
                  style={selectStyle}
                >
                  {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
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
                        {CONDITION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
                  onClick={() => setConditions([...conditions, { type: 'column_equals', params: {} }])}
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
                        {ACTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
                              placeholder="Notification text..."
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
                      </div>
                    </div>
                  </div>
                ))}
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
