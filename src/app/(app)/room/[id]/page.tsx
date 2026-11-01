import { Suspense } from "react";
import { Lobby } from "./lobby";

export default function RoomPage() {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center text-muted">Loading...</main>}>
      <Lobby />
    </Suspense>
  );
}
