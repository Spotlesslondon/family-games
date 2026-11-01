import Link from "next/link";

export default function Welcome() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-16">
      <div className="font-display text-2xl font-bold tracking-wide text-go">Asher Games</div>
      <h1 className="font-display text-4xl font-semibold leading-tight">Game night on everyone&apos;s phone</h1>
      <p className="text-lg text-muted">One phone each. One family. Secret words, sneaky missions and a quiz where everyone has a fair shot.</p>
      <div className="mt-auto flex flex-col gap-3">
        <Link
          href="/join"
          className="flex h-15 items-center justify-center rounded-full bg-go font-display text-xl font-bold text-ground"
        >
          Join your family
        </Link>
        <Link
          href="/start"
          className="flex h-15 items-center justify-center rounded-full border-2 border-line font-display text-xl font-semibold"
        >
          Start a new family
        </Link>
      </div>
    </main>
  );
}
