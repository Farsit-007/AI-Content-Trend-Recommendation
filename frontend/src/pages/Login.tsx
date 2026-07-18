import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldQuestion, User } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { useLogin } from "@/hooks/useAuthMutations";
import { ApiError } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Fixed, non-production-only demo credentials — seeded automatically at server boot
 * (see backend `seedSuperAdminIfMissing` / `seedDemoAccountsIfMissing`). Surfaced here so a
 * reviewer/judge can sign in as any role in one click with zero setup.
 */
const DEMO_ACCOUNTS = [
  {
    role: "Super Admin",
    email: "superadmin@gmail.com",
    password: "superadmin123456",
    icon: ShieldCheck,
    description: "Full platform control + style-pack library",
  },
  {
    role: "Admin",
    email: "demo.admin@growthstudio.dev",
    password: "DemoAdmin123!",
    icon: ShieldQuestion,
    description: "Team, user & pipeline management",
  },
  {
    role: "Member",
    email: "demo.member@growthstudio.dev",
    password: "DemoMember123!",
    icon: User,
    description: "Feed, Generate, Drafts, Chat",
  },
] as const;

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const loginMutation = useLogin();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in → don't show the login form.
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  function fillDemoAccount(email: string, password: string) {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", password, { shouldValidate: true });
  }

  async function onSubmit(values: LoginValues) {
    try {
      await loginMutation.mutateAsync(values);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10 lg:flex-row lg:items-start lg:justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <span className="gradient-text">Growth Studio</span>
          </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="mt-2 w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Sign in
              </Button>
              <Link
                to="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-center text-sm"
              >
                Forgot password?
              </Link>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm border-violet-400/20 bg-violet-400/[0.03]">
        <CardHeader>
          <CardTitle className="text-base">Reviewing this project?</CardTitle>
          <CardDescription>
            Use any of these seeded accounts — no setup needed. Click one to fill the form.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map(({ role, email, password, icon: Icon, description }) => (
            <button
              key={email}
              type="button"
              onClick={() => fillDemoAccount(email, password)}
              className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-left transition hover:border-violet-400/40 hover:bg-violet-400/5"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-400/10 text-violet-300">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{role}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">{email}</p>
              </div>
            </button>
          ))}
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            Seeded automatically on server boot — dev/demo environments only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
