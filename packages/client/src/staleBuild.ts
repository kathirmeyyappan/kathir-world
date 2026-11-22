// A tab left open across a deploy holds a bundle whose lazy chunks (a look's files, the game) are
// named by content hash, and the new deploy has taken those names away. When one fails to load,
// this asks the server for the page again: if it now points at a different bundle the tab is stale
// and is reloaded; if it's the same one the failure was the network's, and the chunk is left to
// be asked for again by the next thing that wants it (fetchOnce.ts).
let checking = false;

function bundleOf(page: ParentNode): string | null {
  return page.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? null;
}

async function reloadIfStale(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const response = await fetch(location.href, { cache: 'no-store' });
    const latest = bundleOf(new DOMParser().parseFromString(await response.text(), 'text/html'));
    if (latest !== null && latest !== bundleOf(document)) location.reload();
  } catch {
    // Offline: nothing to compare against.
  } finally {
    checking = false;
  }
}

// Reloads a stale tab when a chunk fails to load, until the returned function is called. A page
// stops it once the player is in a world: a reload there would drop them out of a match.
export function reloadOnStaleChunks(): () => void {
  const check = () => void reloadIfStale();
  window.addEventListener('vite:preloadError', check);
  return () => window.removeEventListener('vite:preloadError', check);
}
