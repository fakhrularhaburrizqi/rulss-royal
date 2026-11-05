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

type RevenueTrendChartProps = {
  data: ChartPoint[];
  ariaLabel: string;
};

export function RevenueTrendChart({ data, ariaLabel }: RevenueTrendChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} className="mt-4 h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="omzetAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#047857" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#047857" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#ecfdf5" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#475569" }}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#475569" }}
            width={78}
            tickFormatter={(value: number) => formatRupiahCompact(value)}
            domain={[0, "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "#047857", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }
              const point = payload[0].payload as ChartPoint;
              return (
                <div className="rounded-lg border border-emerald-900/10 bg-white px-3 py-2 shadow-sm">
                  <div className="text-xs font-medium text-emerald-700">
                    {point.label}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-emerald-950">
                    {formatRupiah(point.revenue)}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#047857"
            strokeWidth={2}
            fill="url(#omzetAreaFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
