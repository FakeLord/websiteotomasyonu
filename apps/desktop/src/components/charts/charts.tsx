import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { SEGMENTS, SERIES, THEME } from "../../lib/theme-colors";

// Kurumsal palet (src/lib/theme-colors.ts): beyaz yüzeyde ≥ 4.5:1. Sıra sabittir; seri sayısı değişse de
// renkler yeniden dağıtılmaz.
export const SERIES_COLORS = SERIES;
export const SEGMENT_COLORS = SEGMENTS;
export const OTHER_COLOR = THEME.subtle;

const AXIS_TICK = { fill: THEME.muted, fontSize: 11 };

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  name?: string;
}

function ChartTooltip({ active, payload, label, series }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  series: LineSeries[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-text">{label}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        return (
          <p key={s.key} className="flex items-center justify-between gap-6 py-0.5 text-muted">
            <span className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-text tabular-nums">{entry?.value ?? 0}</span>
          </p>
        );
      })}
    </div>
  );
}

export function MultiLineChart({ data, series, xKey, height = 240 }: {
  data: Array<Record<string, string | number>>;
  series: LineSeries[];
  xKey: string;
  height?: number;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={THEME.border} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: THEME.borderStrong, strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as TooltipEntry[] | undefined}
                label={props.label as string | undefined}
                series={series}
              />
            )}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: THEME.surface, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, centerLabel, size = 180 }: {
  segments: DonutSegment[];
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible.length > 0 ? visible : [{ key: "empty", label: "", value: 1, color: THEME.surface3 }]}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={visible.length > 1 ? 2 : 0}
              stroke={THEME.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {(visible.length > 0 ? visible : [{ key: "empty", color: THEME.surface3 }]).map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            {visible.length > 0 && (
              <Tooltip
                content={({ active, payload }) => {
                  const entry = payload?.[0]?.payload as DonutSegment | undefined;
                  if (!active || !entry) return null;
                  return (
                    <div className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs shadow-pop">
                      <span className="text-muted">{entry.label}: </span>
                      <span className="font-medium text-text">
                        {entry.value.toLocaleString("tr-TR")} (%{total ? Math.round((entry.value / total) * 100) : 0})
                      </span>
                    </div>
                  );
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-text tabular-nums">{total.toLocaleString("tr-TR")}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-text tabular-nums">{s.value.toLocaleString("tr-TR")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
