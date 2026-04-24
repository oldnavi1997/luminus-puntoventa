import { CheckCircle, Bell } from "lucide-react";

interface ModuleHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function ModuleHeader({ title, subtitle, right }: ModuleHeaderProps) {
  return (
    <header className="flex items-center gap-4 px-5 py-3 bg-surface border-b border-border sticky top-0 z-10">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight leading-none">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-ink-3 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium bg-success-soft text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          SUNAT conectado
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium bg-surface-light text-ink-3 border border-border">
          {process.env.NEXT_PUBLIC_SUNAT_RUC ?? "RUC empresa"}
        </span>
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-3 hover:bg-surface-light hover:text-ink-2 transition-colors border border-border">
          <Bell size={15} />
        </button>
        {right}
      </div>
    </header>
  );
}
