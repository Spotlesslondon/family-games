import { Suspense } from "react";
import { NightJoin } from "./night-join";

export default function JoinNightPage() {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center text-muted">Loading...</main>}>
      <NightJoin />
    </Suspense>
  );
}
