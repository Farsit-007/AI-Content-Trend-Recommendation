import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppLayout } from '@/components/shared/AppLayout';
import { PublicLayout } from '@/components/shared/PublicLayout';
import { useAuth } from '@/context/auth-context';
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import Login from '@/pages/Login';

// Authenticated dashboard landing. Real section pages are built incrementally;
// unbuilt ones render a titled placeholder for now.
function DashboardHome() {
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

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
      </Route>
      <Route path="/login" element={<Login />} />

      {/* Protected dashboard */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<AppLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="feed" element={<Placeholder title="Feed" />} />
          <Route path="generate" element={<Placeholder title="Generate" />} />
          <Route path="report" element={<Placeholder title="Report" />} />
          <Route path="chat" element={<Placeholder title="Chat" />} />
          <Route path="admin" element={<Placeholder title="Admin" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
