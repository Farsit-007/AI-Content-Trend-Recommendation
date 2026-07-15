import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import Login from '@/pages/Login';

// Minimal authenticated landing spot so the login flow lands somewhere gated.
// The real dashboard is out of scope for this change.
function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">
        Welcome, <span className="gradient-text">{user?.name}</span>
      </h1>
      <p className="text-muted-foreground text-sm">
        {user?.email} · {user?.role}
      </p>
      <Button variant="outline" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
