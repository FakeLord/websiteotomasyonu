import { tr } from "../i18n/tr";

interface ComingSoonProps {
  title: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
        {tr.common.comingSoon}
      </p>
      <p className="max-w-sm text-sm text-slate-500">{tr.common.comingSoonDescription}</p>
    </div>
  );
}
