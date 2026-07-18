import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Eye, KeyRound, Loader2, Plus, Server, Sliders, Trash2 } from 'lucide-react';
import {
  LLM_TASKS,
  addLlmProviderKey,
  clearLlmTaskDefault,
  createLlmModel,
  createLlmProvider,
  deleteLlmModel,
  deleteLlmProvider,
  deleteLlmProviderKey,
  listActiveLlmModels,
  listLlmModels,
  listLlmProviders,
  listLlmTaskDefaults,
  revealLlmProviderKey,
  setLlmTaskDefault,
  updateLlmModel,
  updateLlmProvider,
  updateLlmProviderKey,
  type LlmModelCapability,
  type LlmModelDto,
  type LlmProviderDto,
  type LlmProviderType,
  type LlmTask,
} from '@/lib/api/llmProviders';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PROVIDER_TYPE_OPTIONS: { value: LlmProviderType; label: string }[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (ChatGPT)' },
];

const CAPABILITY_OPTIONS: { value: LlmModelCapability; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'embedding', label: 'Embedding' },
];

const TASK_LABELS: Record<LlmTask, string> = {
  content_generation: 'Content generation',
  chat: 'Ask Growth Studio (chat)',
  categorization: 'News categorization',
  dedup_adjudication: 'Dedup adjudication',
  style_card: 'Style card generation',
  critique: 'Critique pass',
  fact_extraction: 'Fact extraction',
  embedding: 'Embeddings',
};

function badgeClass(active: boolean) {
  return cn(
    'rounded-full border px-2 py-0.5 text-xs',
    active ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400' : 'border-white/10 bg-white/5 text-muted-foreground',
  );
}

function ProviderKeys({ provider }: { provider: LlmProviderDto }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] });

  const addMutation = useMutation({
    mutationFn: () => addLlmProviderKey(provider._id, { key: key.trim(), label: label.trim() || undefined }),
    onSuccess: () => {
      toast.success('Key added');
      setKey('');
      setLabel('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add key'),
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { keyId: string; is_active: boolean }) =>
      updateLlmProviderKey(provider._id, payload.keyId, { is_active: payload.is_active }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || 'Failed to update key'),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteLlmProviderKey(provider._id, keyId),
    onSuccess: () => {
      toast.success('Key removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove key'),
  });

  const revealMutation = useMutation({
    mutationFn: (keyId: string) => revealLlmProviderKey(provider._id, keyId),
    onSuccess: (result) => setRevealed((prev) => ({ ...prev, [result.key_id]: result.key })),
    onError: (err: Error) => toast.error(err.message || 'Failed to reveal key'),
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="size-3.5" /> API keys — encrypted at rest, only key_last4 is ever shown
      </p>
      {provider.keys.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {provider.keys.map((k) => (
            <li key={k._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
              <div className="flex flex-col">
                <span className="font-mono text-sm text-foreground/90">
                  ••••{k.key_last4} {k.label && <span className="text-muted-foreground">({k.label})</span>}
                </span>
                {revealed[k._id] && (
                  <span className="mt-0.5 select-all break-all font-mono text-xs text-amber-300">{revealed[k._id]}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className={badgeClass(k.is_active)}>{k.is_active ? 'Active' : 'Disabled'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Reveal plaintext key"
                  disabled={revealMutation.isPending}
                  onClick={() => revealMutation.mutate(k._id)}
                >
                  <Eye className="size-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate({ keyId: k._id, is_active: !k.is_active })}
                >
                  {k.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm('Delete this key? Any traffic relying on it fails over to the next active key.')) {
                      deleteMutation.mutate(k._id);
                    }
                  }}
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste API key"
          className="min-w-[220px] flex-1"
        />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="w-40" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!key.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Add key
        </Button>
      </div>
    </div>
  );
}

function ProviderModels({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [capabilities, setCapabilities] = useState<LlmModelCapability[]>(['chat']);

  const modelsQuery = useQuery({
    queryKey: ['llm-models', providerId],
    queryFn: () => listLlmModels(providerId),
  });
  const models = modelsQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['llm-models', providerId] });
    queryClient.invalidateQueries({ queryKey: ['llm-active-models'] });
  };

  const createMutation = useMutation({
    mutationFn: () => createLlmModel(providerId, { model_id: modelId.trim(), display_name: displayName.trim(), capabilities }),
    onSuccess: () => {
      toast.success('Model added');
      setModelId('');
      setDisplayName('');
      setCapabilities(['chat']);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add model'),
  });

  const toggleMutation = useMutation({
    mutationFn: (model: LlmModelDto) => updateLlmModel(providerId, model._id, { is_active: !model.is_active }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || 'Failed to update model'),
  });

  const deleteMutation = useMutation({
    mutationFn: (modelDbId: string) => deleteLlmModel(providerId, modelDbId),
    onSuccess: () => {
      toast.success('Model removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove model'),
  });

  const toggleCapability = (cap: LlmModelCapability) => {
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  };

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sliders className="size-3.5" /> Model catalog — the literal model id string sent to this provider's API
      </p>
      {modelsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : models.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {models.map((m) => (
            <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
              <div className="flex flex-col">
                <span className="text-sm text-foreground/90">{m.display_name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {m.model_id} · {m.capabilities.join(', ')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className={badgeClass(m.is_active)}>{m.is_active ? 'Active' : 'Disabled'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate(m)}
                >
                  {m.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete model "${m.display_name}"? Any task default pointing at it falls back.`)) {
                      deleteMutation.mutate(m._id);
                    }
                  }}
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No models yet — add the provider's literal model id below.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model_id (e.g. gpt-4o-mini)" className="w-56" />
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="w-48" />
        <div className="inline-flex gap-1">
          {CAPABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleCapability(opt.value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                capabilities.includes(opt.value)
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                  : 'border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!modelId.trim() || !displayName.trim() || capabilities.length === 0 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Add model
        </Button>
      </div>
    </div>
  );
}

function ProviderRow({ provider }: { provider: LlmProviderDto }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] });

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateLlmProvider(provider._id, { is_active: !provider.is_active }),
    onSuccess: () => {
      toast.success(provider.is_active ? 'Provider disabled — no traffic will route to it' : 'Provider enabled');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLlmProvider(provider._id),
    onSuccess: () => {
      toast.success(`Deleted "${provider.name}"`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  return (
    <div className="glass-card flex flex-col rounded-xl">
      <div className="flex w-full items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{provider.name}</p>
            <span className={badgeClass(provider.is_active)}>{provider.is_active ? 'Active' : 'Disabled'}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {provider.provider_type} · {provider.keys.length} key(s), {provider.keys.filter((k) => k.is_active).length} active
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (window.confirm(`Delete provider "${provider.name}"? This deletes its entire model catalog too.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
          </Button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1">
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-white/10 p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={toggleActiveMutation.isPending}
            onClick={() => toggleActiveMutation.mutate()}
          >
            {provider.is_active ? 'Disable this provider' : 'Enable this provider'}
          </Button>
          <ProviderKeys provider={provider} />
          <ProviderModels providerId={provider._id} />
        </div>
      )}
    </div>
  );
}

function TaskDefaults() {
  const queryClient = useQueryClient();

  const defaultsQuery = useQuery({ queryKey: ['llm-task-defaults'], queryFn: listLlmTaskDefaults });
  const activeModelsQuery = useQuery({ queryKey: ['llm-active-models'], queryFn: listActiveLlmModels });

  const defaultsByTask = new Map((defaultsQuery.data ?? []).map((d) => [d.task, d]));
  const activeModels = activeModelsQuery.data ?? [];

  const setMutation = useMutation({
    mutationFn: (payload: { task: LlmTask; llmModelId: string }) => setLlmTaskDefault(payload.task, payload.llmModelId),
    onSuccess: () => {
      toast.success('Global default updated');
      queryClient.invalidateQueries({ queryKey: ['llm-task-defaults'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to set default'),
  });

  const clearMutation = useMutation({
    mutationFn: (task: LlmTask) => clearLlmTaskDefault(task),
    onSuccess: () => {
      toast.success('Global default cleared — falls back to the team/bootstrap tier');
      queryClient.invalidateQueries({ queryKey: ['llm-task-defaults'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to clear default'),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sliders className="size-4 text-violet-300" />
        <h2 className="font-semibold">Global task defaults</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        The 3rd of 4 resolution tiers (request override &gt; team default &gt; <strong>global default</strong> &gt; .env
        bootstrap). Leave a task unset to keep using the .env-configured bootstrap model — nothing here is required.
      </p>
      {activeModels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add at least one active provider with an active chat-capable model above to set task defaults.
        </p>
      ) : (
        <div className="glass-card flex flex-col divide-y divide-white/10 rounded-xl">
          {LLM_TASKS.map((task) => {
            const current = defaultsByTask.get(task);
            // llm_model_id is populated by the backend, but a dangling reference (its LlmModel was
            // deleted after this default was set) comes back as `null`, not a string or object —
            // never assume it's one or the other. Soft-fail here mirrors resolveModelForTask's own
            // tolerance for exactly this case, rather than crashing the admin page.
            const currentModelId =
              current?.llm_model_id && typeof current.llm_model_id === 'object'
                ? current.llm_model_id._id
                : typeof current?.llm_model_id === 'string'
                  ? current.llm_model_id
                  : undefined;
            const isDangling = Boolean(current) && !currentModelId;
            return (
              <div key={task} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex flex-col">
                  <span className="text-sm text-foreground/90">{TASK_LABELS[task]}</span>
                  <span className="text-xs text-muted-foreground">
                    {task}
                    {isDangling && (
                      <span className="ml-1.5 text-amber-400">
                        — the model this pointed at was deleted; resolution falls back to the next tier
                      </span>
                    )}
                  </span>
                </div>
                <select
                  value={currentModelId ?? ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setMutation.mutate({ task, llmModelId: e.target.value });
                    } else if (current) {
                      // Selecting back to ".env bootstrap (unset)" only means something to clear
                      // when a default (possibly dangling) actually exists for this task.
                      clearMutation.mutate(task);
                    }
                  }}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option value="" className="bg-background text-foreground">
                    .env bootstrap (unset)
                  </option>
                  {activeModels.map((m) => (
                    <option key={m._id} value={m._id} className="bg-background text-foreground">
                      {m.display_name} ({m.provider_name})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AIProviders() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<LlmProviderType>('openrouter');

  const providersQuery = useQuery({ queryKey: ['llm-providers'], queryFn: listLlmProviders });
  const providers = providersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => createLlmProvider({ provider_type: providerType, name: name.trim() }),
    onSuccess: (created) => {
      toast.success(`Provider "${created.name}" created`);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create provider'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            <span className="gradient-text">AI providers</span> &amp; models
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage LLM providers, encrypted API keys, and model catalogs globally — every team's content generation,
            chat, categorization, and embedding calls resolve dynamically through this registry. Super-admin exclusive.
          </p>
        </div>
      </div>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-violet-300" />
          <h2 className="font-semibold">Add a provider</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as LlmProviderType)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {PROVIDER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-background text-foreground">
                {opt.label}
              </option>
            ))}
          </select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Name (e.g. "OpenRouter — primary")'
            className="w-64"
          />
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="btn-glow gap-2 bg-violet-600 hover:bg-violet-500"
          >
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Add provider
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-violet-300" />
          <h2 className="font-semibold">All providers</h2>
        </div>
        {providersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers yet — add one above to get started.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {providers.map((provider) => (
              <ProviderRow key={provider._id} provider={provider} />
            ))}
          </div>
        )}
      </section>

      <TaskDefaults />
    </div>
  );
}
