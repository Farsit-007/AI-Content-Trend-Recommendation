import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { useForgotPassword } from "@/hooks/useAuthMutations";
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

const forgotSchema = z.object({
  email: z.email("Enter a valid email"),
});

type ForgotValues = z.infer<typeof forgotSchema>;

const CONFIRMATION =
  "If an account exists for that email, a password reset token has been issued.";

export default function ForgotPassword() {
  const forgot = useForgotPassword();
  // Same non-enumerating confirmation is shown whether or not the email exists.
  const [submitted, setSubmitted] = useState(false);
  // Dev-only convenience: the backend returns the reset token outside production.
  const [devToken, setDevToken] = useState<string | null>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotValues) {
    try {
      const data = await forgot.mutateAsync(values.email);
      setDevToken(data?.reset_token ?? null);
      setSubmitted(true);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Something went wrong. Try again.";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <span className="gradient-text">Reset your password</span>
          </CardTitle>
          <CardDescription>
            Enter your email and we'll issue a reset token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="grid gap-4 text-sm">
              <p className="text-muted-foreground">{CONFIRMATION}</p>
              {devToken && (
                <div className="grid gap-2">
                  <p className="text-muted-foreground text-xs">
                    Dev only — use this reset token:
                  </p>
                  <code className="glass-card break-all rounded-md p-2 text-xs">
                    {devToken}
                  </code>
                  <Button asChild variant="secondary" className="w-full">
                    <Link to={`/reset-password?token=${encodeURIComponent(devToken)}`}>
                      Continue to reset
                    </Link>
                  </Button>
                </div>
              )}
              <Button asChild variant="ghost" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
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
                <Button
                  type="submit"
                  className="mt-2 w-full"
                  disabled={forgot.isPending}
                >
                  {forgot.isPending && <Loader2 className="size-4 animate-spin" />}
                  Send reset token
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/login">Back to sign in</Link>
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
