import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Share2, Camera, Loader2, PlayCircle, Briefcase, Music2, X } from 'lucide-react';
import {
  disconnectFacebook,
  getFacebookConnectUrl,
  listPendingPages,
  listTeamCredentials,
  selectPage,
  type PendingPage,
  type TeamCredential,
} from '@/lib/api/meta';
import {
  disconnectLinkedIn,
  getLinkedInConnectUrl,
  listPendingOrgs,
  selectOrg,
  type PendingOrg,
} from '@/lib/api/linkedin';
import { useTeamId } from '@/lib/useTeamId';
import { Button } from '@/components/ui/button';

type FacebookState =
  | { kind: 'not_connected' }
  | { kind: 'connected'; name?: string; ig?: string; by?: string; on?: string }
  | { kind: 'needs_reconnect'; name?: string };

function deriveFacebookState(creds: TeamCredential[]): FacebookState {
  const fb = creds.find((c) => c.platform === 'facebook');
  if (!fb) return { kind: 'not_connected' };
  if (fb.token_expires_at) return { kind: 'needs_reconnect', name: fb.external_name };
  const ig = creds.find((c) => c.platform === 'instagram');
  return {
    kind: 'connected',
    name: fb.external_name,
    ig: ig?.external_name,
    by: fb.connected_by,
    on: fb.updated_at ? new Date(fb.updated_at).toLocaleDateString() : undefined,
  };
}

type LinkedInState =
  | { kind: 'not_connected' }
  | { kind: 'connected'; name?: string; on?: string }
  | { kind: 'needs_reconnect'; name?: string };

function deriveLinkedInState(creds: TeamCredential[]): LinkedInState {
  const li = creds.find((c) => c.platform === 'linkedin');
  if (!li) return { kind: 'not_connected' };
  // LinkedIn tokens carry a real ~60-day expiry — reconnect only once it's actually in the past.
  if (li.token_expires_at && new Date(li.token_expires_at).getTime() < Date.now()) {
    return { kind: 'needs_reconnect', name: li.external_name };
  }
  return {
    kind: 'connected',
    name: li.external_name,
    on: li.updated_at ? new Date(li.updated_at).toLocaleDateString() : undefined,
  };
}

const FB_PREREQUISITES = [
  'You have an Admin (Full control) role on the Facebook Page.',
  'For Instagram metrics: a Professional (Business/Creator) IG account linked to that Page.',
];

const LI_PREREQUISITES = [
  'You are an Administrator of the LinkedIn Company Page.',
  'The app has the “Community Management API” product approved (required for post analytics).',
];

const COMING_SOON = [
  { name: 'YouTube', icon: PlayCircle },
  { name: 'X', icon: X },
  { name: 'TikTok', icon: Music2 },
];

function PagePickerModal({
  pages,
  onSelect,
  onClose,
  selecting,
}: {
  pages: PendingPage[];
  onSelect: (pageId: string) => void;
  onClose: () => void;
  selecting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-md rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Choose a Page to connect</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                disabled={selecting}
                onClick={() => onSelect(p.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-white/10 p-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {p.picture ? (
                  <img src={p.picture} alt="" className="size-9 rounded-full" />
                ) : (
                  <span className="grid size-9 place-items-center rounded-full bg-violet-500/20">
                    <Share2 className="size-4 text-violet-300" />
                  </span>
                )}
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.ig_linked && (
                    <span className="inline-flex items-center gap-1 text-xs text-pink-300">
                      <Camera className="size-3" /> {p.ig_username ?? 'IG linked'}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OrgPickerModal({
  orgs,
  onSelect,
  onClose,
  selecting,
}: {
  orgs: PendingOrg[];
  onSelect: (orgId: string) => void;
  onClose: () => void;
  selecting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-md rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Choose an Organization to connect</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <button
                disabled={selecting}
                onClick={() => onSelect(o.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-white/10 p-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <span className="grid size-9 place-items-center rounded-full bg-sky-500/20">
                  <Briefcase className="size-4 text-sky-300" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{o.name}</span>
                  {o.vanity_name && <span className="text-muted-foreground text-xs">/{o.vanity_name}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  no_pages: 'You don’t administer any Facebook Pages.',
  no_orgs: 'You don’t administer any LinkedIn Organizations.',
  missing_product: 'This LinkedIn app is missing the Community Management API product (needed for analytics).',
};

export default function Platforms() {
  const teamId = useTeamId();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [pickerPages, setPickerPages] = useState<PendingPage[] | null>(null);
  const [pickerOrgs, setPickerOrgs] = useState<PendingOrg[] | null>(null);
  const pollRef = useRef<number | null>(null);

  const credsQuery = useQuery({
    queryKey: ['credentials', teamId],
    queryFn: () => listTeamCredentials(teamId!),
    enabled: Boolean(teamId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['credentials', teamId] });
    queryClient.invalidateQueries({ queryKey: ['analytics', teamId] });
  };

  const selectPageMutation = useMutation({
    mutationFn: (pageId: string) => selectPage(teamId!, pageId),
    onSuccess: (res) => {
      toast.success(`Connected ${res.page}${res.instagram ? ' + Instagram' : ''}`);
      setPickerPages(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectOrgMutation = useMutation({
    mutationFn: (orgId: string) => selectOrg(teamId!, orgId),
    onSuccess: (res) => {
      toast.success(`Connected ${res.organization}`);
      setPickerOrgs(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectFbMutation = useMutation({
    mutationFn: () => disconnectFacebook(teamId!),
    onSuccess: () => {
      toast.success('Facebook disconnected');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectLiMutation = useMutation({
    mutationFn: () => disconnectLinkedIn(teamId!),
    onSuccess: () => {
      toast.success('LinkedIn disconnected');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Surface OAuth error redirects (?error=...) as toasts, and if this window IS the OAuth popup
  // that landed on ?fb=pick / ?li=pick, close it so the opener can drive the picker.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    if (error) {
      const missing = params.get('missing');
      toast.error(
        error === 'missing_permissions'
          ? `Missing permissions: ${missing ?? ''}`
          : OAUTH_ERROR_MESSAGES[error] ?? `Connect failed (${error}).`,
      );
    }

    const fbPick = params.get('fb') === 'pick';
    const liPick = params.get('li') === 'pick';
    if ((fbPick || liPick) && window.opener) {
      window.close();
      return;
    }
    // Full-page (non-popup) return: load pending candidates directly.
    if (fbPick && teamId) {
      listPendingPages(teamId).then((pages) => pages.length && setPickerPages(pages));
    }
    if (liPick && teamId) {
      listPendingOrgs(teamId).then((orgs) => orgs.length && setPickerOrgs(orgs));
    }
  }, [location.search, teamId]);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  // Shared popup + poll driver: opens the consent popup and polls the backend for pending candidates.
  const startConnect = async (
    getUrl: () => Promise<{ url: string }>,
    windowName: string,
    poll: () => Promise<{ length: number }>,
    onReady: () => void,
  ) => {
    if (!teamId) return;
    try {
      const { url } = await getUrl();
      const popup = window.open(url, windowName, 'width=600,height=750');
      let elapsed = 0;
      pollRef.current = window.setInterval(async () => {
        elapsed += 1500;
        const result = await poll().catch(() => ({ length: 0 }));
        if (result.length) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          popup?.close();
          onReady();
        } else if ((popup && popup.closed) || elapsed > 120000) {
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const startFacebookConnect = () =>
    startConnect(
      () => getFacebookConnectUrl(teamId!),
      'fb-oauth',
      async () => {
        const pages = await listPendingPages(teamId!);
        return { length: pages.length, pages };
      },
      async () => setPickerPages(await listPendingPages(teamId!)),
    );

  const startLinkedInConnect = () =>
    startConnect(
      () => getLinkedInConnectUrl(teamId!),
      'li-oauth',
      async () => {
        const orgs = await listPendingOrgs(teamId!);
        return { length: orgs.length };
      },
      async () => setPickerOrgs(await listPendingOrgs(teamId!)),
    );

  const fbState = credsQuery.data ? deriveFacebookState(credsQuery.data) : { kind: 'not_connected' as const };
  const liState = credsQuery.data ? deriveLinkedInState(credsQuery.data) : { kind: 'not_connected' as const };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          <span className="gradient-text">Platform</span> Connections
        </h1>
        <p className="text-muted-foreground text-sm">Connect your social accounts to pull real analytics.</p>
      </div>

      {/* Facebook / Instagram card */}
      <div className="glass-card flex flex-col gap-4 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-blue-500/15">
            <Share2 className="size-5 text-blue-400" />
          </span>
          <div className="flex flex-col">
            <span className="font-medium">Facebook &amp; Instagram</span>
            <span className="text-muted-foreground text-xs">Page insights + linked IG Business account</span>
          </div>
        </div>

        {credsQuery.isLoading && <Loader2 className="text-muted-foreground size-4 animate-spin" />}

        {!credsQuery.isLoading && fbState.kind === 'not_connected' && (
          <div className="flex flex-col gap-3">
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-xs">
              {FB_PREREQUISITES.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Button onClick={startFacebookConnect} disabled={!teamId} className="btn-glow w-fit bg-violet-600 hover:bg-violet-500">
              <Share2 className="size-4" /> Connect Facebook Page
            </Button>
          </div>
        )}

        {fbState.kind === 'needs_reconnect' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Facebook connection expired{fbState.name ? ` for ${fbState.name}` : ''} — reconnect to resume analytics.
            </div>
            <Button onClick={startFacebookConnect} className="btn-glow w-fit bg-violet-600 hover:bg-violet-500">
              Reconnect Facebook
            </Button>
          </div>
        )}

        {fbState.kind === 'connected' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="size-4" /> {fbState.name ?? 'Connected'}
              </span>
              {fbState.ig && (
                <span className="inline-flex items-center gap-1 text-xs text-pink-300">
                  <Camera className="size-3" /> {fbState.ig}
                </span>
              )}
              {fbState.on && <span className="text-muted-foreground text-xs">Connected on {fbState.on}</span>}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Disconnect Facebook & Instagram for this team?')) disconnectFbMutation.mutate();
              }}
              disabled={disconnectFbMutation.isPending}
            >
              {disconnectFbMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {/* LinkedIn card */}
      <div className="glass-card flex flex-col gap-4 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-sky-500/15">
            <Briefcase className="size-5 text-sky-400" />
          </span>
          <div className="flex flex-col">
            <span className="font-medium">LinkedIn</span>
            <span className="text-muted-foreground text-xs">Organization posts &amp; engagement analytics</span>
          </div>
        </div>

        {credsQuery.isLoading && <Loader2 className="text-muted-foreground size-4 animate-spin" />}

        {!credsQuery.isLoading && liState.kind === 'not_connected' && (
          <div className="flex flex-col gap-3">
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-xs">
              {LI_PREREQUISITES.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Button onClick={startLinkedInConnect} disabled={!teamId} className="btn-glow w-fit bg-sky-600 hover:bg-sky-500">
              <Briefcase className="size-4" /> Connect LinkedIn
            </Button>
          </div>
        )}

        {liState.kind === 'needs_reconnect' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              LinkedIn connection expired{liState.name ? ` for ${liState.name}` : ''} — reconnect to resume analytics.
            </div>
            <Button onClick={startLinkedInConnect} className="btn-glow w-fit bg-sky-600 hover:bg-sky-500">
              Reconnect LinkedIn
            </Button>
          </div>
        )}

        {liState.kind === 'connected' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="size-4" /> {liState.name ?? 'Connected'}
              </span>
              {liState.on && <span className="text-muted-foreground text-xs">Connected on {liState.on}</span>}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Disconnect LinkedIn for this team?')) disconnectLiMutation.mutate();
              }}
              disabled={disconnectLiMutation.isPending}
            >
              {disconnectLiMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {/* Coming soon platforms — honest non-functional state */}
      <div className="grid gap-3 sm:grid-cols-2">
        {COMING_SOON.map((p) => (
          <div key={p.name} className="glass-card flex items-center justify-between rounded-xl p-4 opacity-60">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-white/5">
                <p.icon className="text-muted-foreground size-4" />
              </span>
              <span className="text-sm">{p.name}</span>
            </div>
            <span className="text-muted-foreground rounded-full border border-white/10 px-2 py-0.5 text-xs">
              Coming soon
            </span>
          </div>
        ))}
      </div>

      {pickerPages && (
        <PagePickerModal
          pages={pickerPages}
          selecting={selectPageMutation.isPending}
          onSelect={(id) => selectPageMutation.mutate(id)}
          onClose={() => setPickerPages(null)}
        />
      )}

      {pickerOrgs && (
        <OrgPickerModal
          orgs={pickerOrgs}
          selecting={selectOrgMutation.isPending}
          onSelect={(id) => selectOrgMutation.mutate(id)}
          onClose={() => setPickerOrgs(null)}
        />
      )}
    </div>
  );
}
