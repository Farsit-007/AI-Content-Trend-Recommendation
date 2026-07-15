import { useAuth } from '@/context/auth-context';

export default function Overview() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        Welcome, <span className="gradient-text">{user?.name}</span>
      </h1>
      <p className="text-muted-foreground text-sm">
        {user?.email} · {user?.role}
      </p>
    </div>
  );
}
