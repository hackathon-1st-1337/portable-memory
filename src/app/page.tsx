import { Logo } from "@/components/logo";
import { HeroActions } from "./hero-actions";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
        <Logo />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-5xl dark:text-zinc-100">
          One memory. Every AI. Your rules.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-zinc-600 dark:text-zinc-400">
          Keep your preferences, projects, and context in one memory pod. Connect Claude, ChatGPT, or
          any custom agent, and decide exactly what each one can read and write.
        </p>
        <HeroActions />
      </main>
    </div>
  );
}
