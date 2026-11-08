"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatRupiah, formatRupiahCompact } from "@/lib/utils/format-rupiah";

type ChartPoint = {
  dateKey: string;
  label: string;
  revenue: number;
};

type SalesTrendChartProps = {
  data: ChartPoint[];
  ariaLabel: string;
};

export function SalesTrendChart({ data, ariaLabel }: SalesTrendChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} className="mt-4 h-64 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#27272a" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            width={74}
            tickFormatter={(value: number) => formatRupiahCompact(value)}
            domain={[0, "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "#10b981", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }
              const point = payload[0].payload as ChartPoint;
              return (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-lg">
                  <div className="text-xs font-medium text-zinc-400">{point.label}</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-300">
                    {formatRupiah(point.revenue)}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#salesTrendFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
