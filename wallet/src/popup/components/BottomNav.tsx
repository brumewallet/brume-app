import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ClockOutlineIcon,
  ClockSolidIcon,
  HomeOutlineIcon,
  HomeSolidIcon,
  NavSendIcon,
  NavSendSolidIcon,
  SettingIcon,
  SettingSolidIcon,
  ShieldIcon,
  ShieldSolidIcon,
} from "@/components/Icons";

const linkBase =
  "relative flex flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden py-2 text-[10px] transition-colors duration-200 brume-press";

export function BottomNav() {
  return (
    <nav
      className="mt-auto flex shrink-0 border-t border-border bg-background/90 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] pt-0.5 backdrop-blur-md"
      aria-label="Main"
    >
      <NavLink to="/" end className={linkBase}>
        {({ isActive }) => (
          <span className="flex flex-col items-center gap-0.5">
            {isActive ? <HomeSolidIcon className="text-primary" /> : <HomeOutlineIcon className="text-muted-foreground" />}
            <span className={cn(isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>Home</span>
          </span>
        )}
      </NavLink>
      <NavLink to="/send" className={linkBase}>
        {({ isActive }) => (
          <span className="flex flex-col items-center gap-0.5">
            {isActive ? <NavSendSolidIcon className="text-primary" /> : <NavSendIcon className="text-muted-foreground" />}
            <span className={cn(isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>Send</span>
          </span>
        )}
      </NavLink>
      <NavLink to="/shield" className={linkBase}>
        {({ isActive }) => (
          <span className="flex flex-col items-center gap-0.5">
            {isActive ? <ShieldSolidIcon className="text-primary" /> : <ShieldIcon className="text-muted-foreground" />}
            <span className={cn(isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>Shield</span>
          </span>
        )}
      </NavLink>
      <NavLink to="/activity" className={linkBase}>
        {({ isActive }) => (
          <span className="flex flex-col items-center gap-0.5">
            {isActive ? <ClockSolidIcon className="text-primary" /> : <ClockOutlineIcon className="text-muted-foreground" />}
            <span className={cn(isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>Activity</span>
          </span>
        )}
      </NavLink>
      <NavLink to="/settings" className={linkBase}>
        {({ isActive }) => (
          <span className="flex flex-col items-center gap-0.5">
            {isActive ? <SettingSolidIcon className="text-primary" /> : <SettingIcon className="text-muted-foreground" />}
            <span className={cn(isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>Settings</span>
          </span>
        )}
      </NavLink>
    </nav>
  );
}
