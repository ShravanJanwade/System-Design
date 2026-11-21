import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useMatch } from 'react-router';
import { Minimize2, Moon, Search, Settings, Sun, SunMoon } from 'lucide-react';
import { sections } from './sections';
import { cn } from '@/lib/cn';
import { IconButton } from '@/design/Button';
import { Kbd, isMac } from '@/design/primitives';
import { CurriculumNav } from '@/features/learn/CurriculumNav';
import { CommandPalette } from '@/features/search/CommandPalette';
import { useApplySettings, useSettings, type ThemePref } from '@/state/settings';
import { Wordmark, LogoMark } from './Logo';

const nextTheme: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const themeLabel: Record<ThemePref, string> = {
  system: 'Theme: match the system. Switch to light',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to match the system',
};

function ThemeButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const Icon = theme === 'system' ? SunMoon : theme === 'light' ? Sun : Moon;
  return (
    <IconButton label={themeLabel[theme]} size={size} onClick={() => setTheme(nextTheme[theme])}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </IconButton>
  );
}

export function AppShell() {
  useApplySettings();
  const focusMode = useSettings((s) => s.focusMode);
  const setFocusMode = useSettings((s) => s.setFocusMode);
  const lessonMatch = useMatch('/learn/:moduleId/:lessonId');
  const inLesson = Boolean(lessonMatch);
  const focused = focusMode && inLesson;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  // Ctrl+K / Cmd+K opens the command palette anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A default title from the section. It is set in a layout effect, which runs before every page's
  // own (passive) effect, so detail pages such as a lesson or a simulator can replace it.
  useLayoutEffect(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const special: Record<string, string> = { '/settings': 'Settings', '/plan': 'Study plan', '/reference/glossary': 'Glossary' };
    const s = sections.find((x) => (x.to === '/' ? path === '/' : path === x.to || path.startsWith(`${x.to}/`)));
    const label = special[path] ?? (s && s.to !== '/' ? s.label : undefined);
    document.title = label ? `${label} — Blueprint` : 'Blueprint';
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-paper px-3 py-2 text-ui font-semibold text-blueprint focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {!focused ? (
        <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-[264px] flex-col border-r border-rule bg-paper lg:flex" aria-label="Main">
          <div className="flex h-16 shrink-0 items-center px-5">
            <Link to="/" aria-label="Blueprint home">
              <Wordmark />
            </Link>
          </div>
          <div className="px-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-control border border-rule bg-canvas px-3 text-ui text-graphite hover:border-graphite"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <span className="flex-1 text-left">Search</span>
              <span className="flex gap-0.5">
                <Kbd>{isMac() ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </div>
          <nav aria-label="Sections" className="mt-3 flex flex-col gap-0.5 px-3">
            {sections.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                end={s.end}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-3 rounded-control px-3 text-ui font-semibold transition-colors ease-ui',
                    isActive ? 'bg-blueprint-wash text-blueprint' : 'text-ink hover:bg-wash',
                  )
                }
              >
                <s.icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
                {s.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-rule px-3 pt-3 pb-4">
            {inLesson ? <CurriculumPanel lessonId={lessonMatch?.params.lessonId} /> : null}
          </div>
          <div className="flex h-14 shrink-0 items-center justify-between border-t border-rule px-3">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn('flex h-9 items-center gap-3 rounded-control px-3 text-ui font-semibold', isActive ? 'bg-blueprint-wash text-blueprint' : 'text-ink hover:bg-wash')
              }
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
              Settings
            </NavLink>
            <ThemeButton />
          </div>
        </aside>
      ) : null}

      {/* Phones and tablets: a top bar and a bottom tab bar */}
      {!focused ? (
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-rule bg-paper px-4 lg:hidden">
          <Link to="/" aria-label="Blueprint home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <IconButton label="Search" onClick={() => setPaletteOpen(true)} tipSide="bottom">
              <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </IconButton>
            <ThemeButton />
            <Link to="/settings" aria-label="Settings" className="flex h-9 w-9 items-center justify-center rounded-control text-graphite hover:bg-wash hover:text-ink">
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </Link>
          </div>
        </header>
      ) : null}

      <main id="main" className={cn('min-w-0', !focused && 'lg:pl-[264px]', !focused && 'pb-20 lg:pb-0')}>
        <Outlet />
      </main>

      {!focused ? (
        <nav aria-label="Sections" className="no-print fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-6 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn('flex flex-col items-center justify-center gap-0.5 text-[11px] leading-4 font-semibold', isActive ? 'text-blueprint' : 'text-graphite')
              }
            >
              <s.icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              {s.label}
            </NavLink>
          ))}
        </nav>
      ) : (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="no-print fixed top-3 right-3 z-30 inline-flex h-9 items-center gap-2 rounded-control border border-rule bg-paper px-3 text-ui font-semibold text-ink shadow-float hover:bg-wash"
        >
          <Minimize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Exit focus mode
        </button>
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ScrollRestoration />
    </div>
  );
}

function CurriculumPanel({ lessonId }: { lessonId?: string }) {
  const open = useSettings((s) => s.curriculumOpen);
  const setOpen = useSettings((s) => s.setCurriculumOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mb-1 flex w-full items-center justify-between rounded-control px-2 py-1 text-small font-semibold text-graphite hover:bg-wash"
      >
        <span className="inline-flex items-center gap-2">
          <LogoMark size={16} />
          Curriculum
        </span>
        <span className="text-small font-normal">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <CurriculumNav currentLessonId={lessonId} /> : null}
    </div>
  );
}
