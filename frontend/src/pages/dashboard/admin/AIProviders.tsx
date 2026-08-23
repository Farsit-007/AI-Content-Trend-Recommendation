import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  Server,
  Sliders,
  Trash2,
} from 'lucide-react';

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
  type LlmModelActiveDto,
  type LlmModelCapability,
  type LlmModelDto,
  type LlmProviderDto,
  type LlmProviderType,
  type LlmTask,
} from '@/lib/api/llmProviders';
import { timeAgo } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormDialog } from '@/components/dashboard/FormDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { ConfirmButton } from '@/components/shared/ConfirmButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const UNSET = 'unset';

/** Why a key is resting, in operator language rather than the wire value. */
const COOLDOWN_LABEL: Record<string, string> = {
  rate_limited: 'Rate limited',
  exhausted: 'Out of credit',
  bad_key: 'Rejected',
  transient: 'Cooling down',
  permanent: 'Cooling down',
};

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

const providerSchema = z.object({
  name: z.string().trim().min(1, 'Give this provider a name'),
  provider_type: z.enum(['openrouter', 'anthropic', 'openai']),
});

const keySchema = z.object({
  key: z.string().trim().min(8, 'That does not look like an API key'),
  label: z.string().trim().optional(),
});

const modelSchema = z.object({
  model_id: z.string().trim().min(1, 'The provider-side model id is required'),
  display_name: z.string().trim().min(1, 'Give it a readable name'),
});

type ProviderValues = z.infer<typeof providerSchema>;
type KeyValues = z.infer<typeof keySchema>;
type ModelValues = z.infer<typeof modelSchema>;

/** Keys panel. Reveal is deliberately gated behind a confirm — it prints a live secret on screen. */
function ProviderKeysSheet({
  provider,
  open,
  onOpenChange,
}: {
  provider: LlmProviderDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const providerId = provider?._id;

  const form = useForm<KeyValues>({
    resolver: zodResolver(keySchema),
    defaultValues: { key: '', label: '' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] });

  const addMutation = useMutation({
    mutationFn: (values: KeyValues) =>
      addLlmProviderKey(providerId as string, {
        key: values.key.trim(),
        label: values.label?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Key added');
      form.reset();
      setAddOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add key'),
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { keyId: string; is_active: boolean }) =>
      updateLlmProviderKey(providerId as string, payload.keyId, { is_active: payload.is_active }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || 'Failed to update key'),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteLlmProviderKey(providerId as string, keyId),
    onSuccess: () => {
      toast.success('Key removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove key'),
  });

  const revealMutation = useMutation({
    mutationFn: (keyId: string) => revealLlmProviderKey(providerId as string, keyId),
    onSuccess: (result) => setRevealed((prev) => ({ ...prev, [result.key_id]: result.key })),
    onError: (err: Error) => toast.error(err.message || 'Failed to reveal key'),
  });

  const hide = (keyId: string) =>
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[keyId];
      return next;
    });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Key copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const keys = provider?.keys ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Never leave a revealed secret sitting in state behind a closed panel.
        if (!next) setRevealed({});
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-brand" />
            API keys — {provider?.name}
          </SheetTitle>
          <SheetDescription>
            Encrypted at rest; only the last 4 characters are stored in readable form. Traffic fails
            over to the next active key.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No keys yet"
              description="This provider cannot serve traffic until it has one active key."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {keys.map((key) => (
                <li key={key._id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm">
                      ••••{key.key_last4}
                      {key.label && (
                        <span className="ml-1.5 font-sans text-muted-foreground">({key.label})</span>
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {key.cooldown_remaining_ms ? (
                        <Badge variant="trend">
                          <Clock />
                          {COOLDOWN_LABEL[key.cooldown_reason ?? 'rate_limited']} ·{' '}
                          {Math.ceil(key.cooldown_remaining_ms / 1000)}s
                        </Badge>
                      ) : null}
                      <Badge variant={key.is_active ? 'opportunity' : 'muted'}>
                        {key.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  {revealed[key._id] && (
                    <div className="flex items-center gap-2 rounded-md border border-trend/30 bg-trend-surface p-2">
                      <code className="min-w-0 flex-1 font-mono text-xs break-all text-trend select-all">
                        {revealed[key._id]}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copy key"
                        onClick={() => copy(revealed[key._id])}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hide key"
                        onClick={() => hide(key._id)}
                      >
                        <EyeOff className="size-3.5" />
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={key.is_active}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ keyId: key._id, is_active: checked })
                        }
                      />
                      Enabled
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Added {timeAgo(key.created_at)}
                    </span>
                    {Boolean(key.recent_failure_count) && (
                      <span className="text-xs text-trend">
                        {key.recent_failure_count} failure
                        {key.recent_failure_count === 1 ? '' : 's'} in 24h
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {!revealed[key._id] && (
                        <ConfirmButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          destructive={false}
                          className="gap-1.5 text-xs"
                          disabled={revealMutation.isPending}
                          title="Show this key in plaintext?"
                          description="The full secret will be printed on screen until you hide it or close this panel."
                          confirmLabel="Reveal key"
                          onConfirm={() => revealMutation.mutate(key._id)}
                        >
                          <Eye className="size-3.5" />
                          Reveal
                        </ConfirmButton>
                      )}
                      <ConfirmButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete API key"
                        disabled={deleteMutation.isPending}
                        title="Delete this key?"
                        description="Any traffic relying on it fails over to the next active key."
                        onConfirm={() => deleteMutation.mutate(key._id)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </ConfirmButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          <Button type="button" className="btn-glow w-full gap-2" onClick={() => setAddOpen(true)}>
            <Plus />
            Add a key
          </Button>
        </SheetFooter>
      </SheetContent>

      <FormDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) form.reset();
        }}
        title="Add an API key"
        description="Pasted once, then encrypted — it can only be read back through an explicit reveal."
        icon={KeyRound}
        form={form}
        isPending={addMutation.isPending}
        submitLabel="Add key"
        onSubmit={(values) => addMutation.mutate(values)}
      >
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API key</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="off" placeholder="sk-…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label (optional)</FormLabel>
              <FormControl>
                <Input placeholder="primary / billing account" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>
    </Sheet>
  );
}

/** Model catalog panel for one provider. */
function ProviderModelsSheet({
  provider,
  open,
  onOpenChange,
}: {
  provider: LlmProviderDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const providerId = provider?._id;
  const [addOpen, setAddOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<LlmModelCapability[]>(['chat']);

  const form = useForm<ModelValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: { model_id: '', display_name: '' },
  });

  const modelsQuery = useQuery({
    queryKey: ['llm-models', providerId],
    queryFn: () => listLlmModels(providerId as string),
    enabled: Boolean(providerId) && open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['llm-models', providerId] });
    queryClient.invalidateQueries({ queryKey: ['llm-active-models'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: ModelValues) =>
      createLlmModel(providerId as string, {
        model_id: values.model_id.trim(),
        display_name: values.display_name.trim(),
        capabilities,
      }),
    onSuccess: () => {
      toast.success('Model added');
      form.reset();
      setCapabilities(['chat']);
      setAddOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add model'),
  });

  const toggleMutation = useMutation({
    mutationFn: (model: LlmModelDto) =>
      updateLlmModel(providerId as string, model._id, { is_active: !model.is_active }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || 'Failed to update model'),
  });

  const deleteMutation = useMutation({
    mutationFn: (modelDbId: string) => deleteLlmModel(providerId as string, modelDbId),
    onSuccess: () => {
      toast.success('Model removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove model'),
  });

  const toggleCapability = (capability: LlmModelCapability) =>
    setCapabilities((prev) =>
      prev.includes(capability) ? prev.filter((item) => item !== capability) : [...prev, capability],
    );

  const models = modelsQuery.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sliders className="size-4 text-brand" />
            Models — {provider?.name}
          </SheetTitle>
          <SheetDescription>
            The literal model id string sent to this provider&apos;s API, plus what it is allowed to
            be used for.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {modelsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading models…
            </div>
          ) : models.length === 0 ? (
            <EmptyState
              icon={Sliders}
              title="No models yet"
              description="Add the provider's literal model id to make it selectable."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {models.map((model) => (
                <li
                  key={model._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{model.display_name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {model.model_id}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {model.capabilities.map((capability) => (
                        <Badge key={capability} variant="outline">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      aria-label={'Enable ' + model.display_name}
                      checked={model.is_active}
                      disabled={toggleMutation.isPending}
                      onCheckedChange={() => toggleMutation.mutate(model)}
                    />
                    <ConfirmButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={'Delete model ' + model.display_name}
                      disabled={deleteMutation.isPending}
                      title={'Delete model "' + model.display_name + '"?'}
                      description="Any task default pointing at it falls back to the next tier."
                      onConfirm={() => deleteMutation.mutate(model._id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </ConfirmButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          <Button type="button" className="btn-glow w-full gap-2" onClick={() => setAddOpen(true)}>
            <Plus />
            Add a model
          </Button>
        </SheetFooter>
      </SheetContent>

      <FormDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            form.reset();
            setCapabilities(['chat']);
          }
        }}
        title="Add a model"
        description="Capabilities decide which task pickers this model shows up in."
        icon={Sliders}
        form={form}
        isPending={createMutation.isPending}
        submitLabel="Add model"
        onSubmit={(values) => {
          if (capabilities.length === 0) {
            toast.error('Pick at least one capability');
            return;
          }
          createMutation.mutate(values);
        }}
      >
        <FormField
          control={form.control}
          name="model_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model id</FormLabel>
              <FormControl>
                <Input placeholder="gpt-4o-mini" className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="GPT-4o mini" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2">
          <Label>Capabilities</Label>
          <div className="flex flex-col gap-1">
            {CAPABILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
              >
                <Checkbox
                  checked={capabilities.includes(option.value)}
                  onCheckedChange={() => toggleCapability(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </FormDialog>
    </Sheet>
  );
}

/** The 3rd of four model-resolution tiers, one row per task. */
function TaskDefaultsTable() {
  const queryClient = useQueryClient();

  const defaultsQuery = useQuery({ queryKey: ['llm-task-defaults'], queryFn: listLlmTaskDefaults });
  // Each task needs models with the capability it actually calls the LLM for — the embedding
  // task's picker must include embedding-only models, which never carry 'chat'.
  const chatModelsQuery = useQuery({
    queryKey: ['llm-active-models', 'chat'],
    queryFn: () => listActiveLlmModels('chat'),
  });
  const embeddingModelsQuery = useQuery({
    queryKey: ['llm-active-models', 'embedding'],
    queryFn: () => listActiveLlmModels('embedding'),
  });

  const defaultsByTask = new Map(
    (defaultsQuery.data ?? []).map((entry) => [entry.task, entry] as const),
  );
  const chatModels = chatModelsQuery.data ?? [];
  const embeddingModels = embeddingModelsQuery.data ?? [];
  const modelsForTask = (task: LlmTask): LlmModelActiveDto[] =>
    task === 'embedding' ? embeddingModels : chatModels;

  const setMutation = useMutation({
    mutationFn: (payload: { task: LlmTask; llmModelId: string }) =>
      setLlmTaskDefault(payload.task, payload.llmModelId),
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

  const rows = useMemo(() => LLM_TASKS.map((task) => ({ task })), []);

  const columns = useMemo<DataTableColumn<{ task: LlmTask }>[]>(
    () => [
      {
        id: 'task',
        accessorKey: 'task',
        header: 'Task',
        enableSorting: false,
        cell: ({ row }) => {
          const current = defaultsByTask.get(row.original.task);
          // llm_model_id is populated by the backend, but a dangling reference (its LlmModel was
          // deleted after this default was set) comes back as `null`, not a string or object —
          // never assume it is one or the other.
          const currentModelId =
            current?.llm_model_id && typeof current.llm_model_id === 'object'
              ? current.llm_model_id._id
              : typeof current?.llm_model_id === 'string'
                ? current.llm_model_id
                : undefined;
          const isDangling = Boolean(current) && !currentModelId;
          return (
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{TASK_LABELS[row.original.task]}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.original.task}</span>
              {isDangling && (
                <span className="mt-0.5 text-xs text-trend">
                  The model this pointed at was deleted — resolution falls through to the next tier.
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'model',
        header: 'Global default model',
        enableSorting: false,
        meta: { className: 'w-[280px]' },
        cell: ({ row }) => {
          const task = row.original.task;
          const current = defaultsByTask.get(task);
          const currentModelId =
            current?.llm_model_id && typeof current.llm_model_id === 'object'
              ? current.llm_model_id._id
              : typeof current?.llm_model_id === 'string'
                ? current.llm_model_id
                : undefined;
          const taskModels = modelsForTask(task);
          return (
            <Select
              value={currentModelId ?? UNSET}
              onValueChange={(value) => {
                if (value !== UNSET) {
                  setMutation.mutate({ task, llmModelId: value });
                } else if (current) {
                  // Selecting back to the bootstrap option only means something to clear when a
                  // default (possibly dangling) actually exists for this task.
                  clearMutation.mutate(task);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full"
                aria-label={'Default model for ' + TASK_LABELS[task]}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>.env bootstrap (unset)</SelectItem>
                {taskModels.map((model) => (
                  <SelectItem key={model._id} value={model._id}>
                    {model.display_name} ({model.provider_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultsQuery.data, chatModelsQuery.data, embeddingModelsQuery.data],
  );

  const hasModels = chatModels.length > 0 || embeddingModels.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The 3rd of 4 resolution tiers (request override &gt; team default &gt;{' '}
        <strong>global default</strong> &gt; .env bootstrap). Leave a task unset to keep using the
        .env-configured bootstrap model — nothing here is required.
      </p>
      {!hasModels ? (
        <EmptyState
          icon={Sliders}
          title="No active models to choose from"
          description="Add a provider with at least one active model before setting task defaults."
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.task}
          isLoading={defaultsQuery.isLoading}
          isFetching={defaultsQuery.isFetching}
          error={defaultsQuery.error}
          onRetry={() => defaultsQuery.refetch()}
          hidePagination
          enableColumnVisibility={false}
          minWidth={620}
          pageSize={LLM_TASKS.length}
        />
      )}
    </div>
  );
}

export default function AIProviders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [keysProvider, setKeysProvider] = useState<LlmProviderDto | null>(null);
  const [modelsProvider, setModelsProvider] = useState<LlmProviderDto | null>(null);
  const [deleting, setDeleting] = useState<LlmProviderDto | null>(null);

  const providersQuery = useQuery({ queryKey: ['llm-providers'], queryFn: listLlmProviders });
  const providers = providersQuery.data ?? [];

  const form = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: { name: '', provider_type: 'openrouter' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] });

  const createMutation = useMutation({
    mutationFn: (values: ProviderValues) =>
      createLlmProvider({ provider_type: values.provider_type, name: values.name.trim() }),
    onSuccess: (created) => {
      toast.success('Provider "' + created.name + '" created');
      form.reset();
      setCreateOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create provider'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (provider: LlmProviderDto) =>
      updateLlmProvider(provider._id, { is_active: !provider.is_active }),
    onSuccess: (updated) => {
      toast.success(
        updated.is_active ? 'Provider enabled' : 'Provider disabled — no traffic will route to it',
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLlmProvider(id),
    onSuccess: (deleted) => {
      toast.success('Deleted "' + deleted.name + '"');
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  // Keep the open keys sheet pointed at fresh data: it renders from the providers list, so after a
  // key is added the panel must see the refetched provider, not the row captured on click.
  const liveKeysProvider = keysProvider
    ? (providers.find((item) => item._id === keysProvider._id) ?? keysProvider)
    : null;

  const activeProviders = providers.filter((provider) => provider.is_active).length;
  const totalKeys = providers.reduce((sum, provider) => sum + provider.keys.length, 0);
  const activeKeys = providers.reduce(
    (sum, provider) => sum + provider.keys.filter((key) => key.is_active).length,
    0,
  );

  const columns = useMemo<DataTableColumn<LlmProviderDto>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Provider',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.provider_type}
            </span>
          </div>
        ),
      },
      {
        id: 'keys',
        header: 'Keys',
        enableSorting: false,
        cell: ({ row }) => {
          const active = row.original.keys.filter((key) => key.is_active).length;
          return row.original.keys.length === 0 ? (
            <Badge variant="trend">No keys</Badge>
          ) : (
            <span className="text-muted-foreground">
              {active} active / {row.original.keys.length}
            </span>
          );
        },
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: 'Enabled',
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            aria-label={'Enable ' + row.original.name}
            checked={row.original.is_active}
            disabled={toggleActiveMutation.isPending}
            onCheckedChange={() => toggleActiveMutation.mutate(row.original)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Added',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{timeAgo(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        meta: { className: 'w-0', label: 'Actions' },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Provider actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="truncate">{row.original.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setKeysProvider(row.original)}>
                <KeyRound />
                Manage keys
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setModelsProvider(row.original)}>
                <Sliders />
                Manage models
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 />
                Delete provider
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleActiveMutation.isPending],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="AI providers"
        title="& models"
        icon={Server}
        description="Every team's generation, chat, categorization, and embedding call resolves through this registry. Super-admin exclusive."
        actions={
          <Button className="btn-glow gap-2" onClick={() => setCreateOpen(true)}>
            <Plus />
            Add provider
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Server} label="Providers" value={providers.length} accent="brand" />
        <StatCard icon={Server} label="Enabled" value={activeProviders} accent="opportunity" />
        <StatCard icon={KeyRound} label="Keys stored" value={totalKeys} accent="info" />
        <StatCard
          icon={KeyRound}
          label="Keys active"
          value={activeKeys}
          accent={activeKeys === 0 ? 'trend' : 'opportunity'}
        />
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">
            <Server />
            Providers
          </TabsTrigger>
          <TabsTrigger value="defaults">
            <Sliders />
            Task defaults
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <section className="glass-card rounded-xl p-5">
            <DataTable
              data={providers}
              columns={columns}
              getRowId={(row) => row._id}
              isLoading={providersQuery.isLoading}
              isFetching={providersQuery.isFetching}
              error={providersQuery.error}
              onRetry={() => providersQuery.refetch()}
              search={{ value: search, onChange: setSearch, placeholder: 'Search providers' }}
              minWidth={760}
              pageSize={25}
              emptyState={
                <EmptyState
                  icon={Server}
                  title="No providers yet"
                  description="Add one, give it a key, then register the models you want available."
                  action={
                    <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
                      <Plus />
                      Add provider
                    </Button>
                  }
                />
              }
              renderMobileCard={(row) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{row.name}</span>
                    <Badge variant={row.is_active ? 'opportunity' : 'muted'}>
                      {row.is_active ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.provider_type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.keys.filter((key) => key.is_active).length} of {row.keys.length} keys active
                  </span>
                </div>
              )}
            />
          </section>
        </TabsContent>

        <TabsContent value="defaults">
          <section className="glass-card rounded-xl p-5">
            <TaskDefaultsTable />
          </section>
        </TabsContent>
      </Tabs>

      <ProviderKeysSheet
        provider={liveKeysProvider}
        open={Boolean(keysProvider)}
        onOpenChange={(open) => !open && setKeysProvider(null)}
      />

      <ProviderModelsSheet
        provider={modelsProvider}
        open={Boolean(modelsProvider)}
        onOpenChange={(open) => !open && setModelsProvider(null)}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) form.reset();
        }}
        title="Add a provider"
        description="A provider holds its own keys and model catalog."
        icon={Plus}
        form={form}
        isPending={createMutation.isPending}
        submitLabel="Add provider"
        onSubmit={(values) => createMutation.mutate(values)}
      >
        <FormField
          control={form.control}
          name="provider_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PROVIDER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="OpenRouter — primary" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={'Delete provider "' + (deleting?.name ?? '') + '"?'}
        description="This deletes its entire model catalog and stored keys too."
        confirmLabel="Delete provider"
        onConfirm={() => deleting && deleteMutation.mutate(deleting._id)}
      />
    </div>
  );
}
