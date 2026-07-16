import { logos } from '@/lib/mock/landing';

export function LogoCloud() {
  return (
    <section className="bg-muted/30 border-border border-y py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-muted-foreground text-center text-sm">
          Trusted by growth teams everywhere
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {logos.map((name) => (
            <span
              key={name}
              className="text-muted-foreground text-lg font-semibold tracking-tight grayscale"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
