// Every app screen (sign-in, home, lists, join links, lobby, games, the TV)
// shares this frame: the paper-and-ink look of the public page and its two
// fonts (gameplay look brief v1, approved by Joshua 2 Nov 2026), served from
// our own domain.

import { atkinsonNext, bagelFatOne } from "@/fonts/paper";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <div className={`${bagelFatOne.variable} ${atkinsonNext.variable} flex flex-1 flex-col bg-ground font-sans text-ink`}>{children}</div>;
}
