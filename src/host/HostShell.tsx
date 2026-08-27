import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  CalendarDays,
  ChevronsLeft,
  Contact,
  ChevronsRight,
  House,
  LayoutTemplate,
  LogOut,
  NotebookPen,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, useHost } from "./AuthProvider";
import { useSidebar, type SidebarState } from "./useSidebar";
import { FeedbackButton } from "./FeedbackButton";
import { Wordmark } from "./Wordmark";
import { cx } from "../ui/primitives";
import { initials } from "../data/profiles";
import TodayPage from "./pages/TodayPage";
import EventsPage from "./pages/EventsPage";
import EventWorkspace from "./event/EventWorkspace";
import NewEventPage from "./pages/NewEventPage";
import CalendarPage from "./pages/CalendarPage";
import PartnersPage from "./pages/PartnersPage";
import PeoplePage from "./pages/PeoplePage";
import PersonDetailPage from "./pages/PersonDetailPage";
import PartnerDetailPage from "./pages/PartnerDetailPage";
import PartnerFormPage from "./pages/PartnerFormPage";
import CapturePage from "./pages/CapturePage";
import HostCardPage from "./pages/HostCardPage";
import TemplatesPage from "./pages/TemplatesPage";
import TemplateEditorPage from "./pages/TemplateEditorPage";
import RecapEditorPage from "./event/RecapEditorPage";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Today", icon: House, end: true },
  { to: "/app/events", label: "Events", icon: Sparkles },
  { to: "/app/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/app/partners", label: "Partners", icon: Users },
  { to: "/app/people", label: "People", icon: Contact },
  { to: "/app/capture", label: "Capture", icon: NotebookPen },
];

/** Capture is the split-view page, so it starts collapsed. */
function useSplitView(): boolean {
  return useLocation().pathname.startsWith("/app/capture");
}

/**
 * Collapsed labels become hover tooltips, so the nav stays readable.
 *
 * Keyboard focus shows them too, but via :focus-visible rather than
 * :focus-within. A clicked link keeps focus after the pointer leaves, so
 * focus-within left the tooltip stranded on screen.
 */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-[10px] py-[5px] text-xs font-medium text-white opacity-0 shadow-[0_4px_14px_rgba(36,31,61,.2)] transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
    >
      {label}
    </span>
  );
}

function SideNav({
  collapsed,
  onToggle,
}: SidebarState & { onToggle: () => void }) {
  const host = useHost();
  const { signOut } = useAuth();

  return (
    <nav
      className={cx(
        // Pinned to the viewport, not to the page. The nav stretches to the
        // flex container's height otherwise, so on a long page (People runs to
        // 1,233 rows) the foot of the sidebar, sign out included, ends up
        // thousands of pixels below the fold.
        "hairline sticky top-0 flex h-screen shrink-0 flex-col overflow-y-auto border-0 border-r border-line bg-surface",
        collapsed ? "w-[54px] items-center py-[14px]" : "w-44 px-3 py-4",
      )}
    >
      {collapsed ? (
        <span className="accent-gradient mb-[14px] flex size-[30px] items-center justify-center rounded-[9px] font-display text-sm font-semibold text-white">
          N
        </span>
      ) : (
        <div className="mb-5 px-2">
          <Wordmark />
        </div>
      )}

      {NAV.map(({ to, label, icon: Icon, end }) => (
        <div key={to} className={cx("group relative", !collapsed && "w-full")}>
          <NavLink
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              cx(
                "flex items-center rounded-[9px] transition",
                collapsed
                  ? "size-[34px] justify-center"
                  : "mb-[2px] w-full gap-[9px] px-[10px] py-[7px] text-[13px]",
                isActive
                  ? "bg-viot font-medium text-vio"
                  : "text-sec hover:text-ink",
              )
            }
          >
            <Icon size={collapsed ? 16 : 15} />
            {!collapsed && label}
          </NavLink>
          {collapsed && <Tooltip label={label} />}
        </div>
      ))}

      <div
        className={cx(
          "mt-auto flex flex-col",
          collapsed ? "items-center gap-2" : "w-full gap-3",
        )}
      >
        <FeedbackButton collapsed={collapsed} />

        <div className="group relative">
          <button
            type="button"
            onClick={onToggle}
            aria-label={
              collapsed ? "Expand the sidebar" : "Collapse the sidebar"
            }
            className={cx(
              "hairline flex items-center justify-center rounded-[9px] border-line text-sec transition hover:text-ink",
              collapsed ? "size-[34px]" : "ml-auto size-[30px]",
            )}
          >
            {collapsed ? (
              <ChevronsRight size={15} />
            ) : (
              <ChevronsLeft size={15} />
            )}
          </button>
          {collapsed && <Tooltip label="Expand" />}
        </div>

        {collapsed ? (
          <div className="group relative">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-av text-[11px] font-medium text-vio">
              {initials(host.displayName)}
            </span>
            <Tooltip label={host.displayName} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-av text-[11px] font-medium text-vio">
              {initials(host.displayName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {host.displayName}
              </span>
              <span className="block truncate text-[11px] text-mut">
                {host.email}
              </span>
            </span>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="shrink-0 text-mut transition hover:text-ink"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default function HostShell() {
  const splitView = useSplitView();
  const sidebar = useSidebar(splitView);

  return (
    <div className="flex min-h-screen bg-field">
      <SideNav {...sidebar} onToggle={sidebar.toggle} />
      <main className="min-w-0 flex-1">
        <Routes>
          <Route index element={<TodayPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/new" element={<NewEventPage />} />
          <Route path="events/:eventId/recap" element={<RecapEditorPage />} />
          <Route path="events/:eventId/*" element={<EventWorkspace />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route
            path="templates/:templateId"
            element={<TemplateEditorPage />}
          />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="partners/new" element={<PartnerFormPage />} />
          <Route path="partners/:orgId/edit" element={<PartnerFormPage />} />
          <Route path="partners/:orgId" element={<PartnerDetailPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:personId" element={<PersonDetailPage />} />
          <Route path="capture" element={<CapturePage />} />
          {/* Not in the nav: it is reached from Capture, which is where a
              host already is when handing out a card. */}
          <Route path="card" element={<HostCardPage />} />
          {/* PRD 3.4 called this orgs; the wireframes call it partners. */}
          <Route
            path="orgs"
            element={<Navigate to="/app/partners" replace />}
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
    </div>
  );
}
