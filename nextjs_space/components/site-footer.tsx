const REPO_URL = 'https://github.com/TimetoSwett/Questbound';

export function SiteFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex h-[var(--site-footer-offset)] items-center border-t border-border bg-card/80 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Questbound on GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </footer>
  );
}
