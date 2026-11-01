import { Suspense } from "react";
import { BigScreen } from "./big-screen";

export default function TvPage() {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center text-3xl text-muted">Loading...</main>}>
      <BigScreen />
    </Suspense>
  );
}
