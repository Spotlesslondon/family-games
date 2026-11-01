// Every app screen (sign-in, home, lists, join links, lobby) shares this
// frame: the app's current look and its two fonts. The public coming-soon page
// at the root sits outside it, so it does not download fonts it never uses.

import { fredoka, nunito } from "@/fonts/app";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <div className={`${fredoka.variable} ${nunito.variable} flex flex-1 flex-col bg-ground font-sans text-ink`}>{children}</div>;
}
