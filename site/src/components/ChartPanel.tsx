import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  type Plugin,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { EventMarker, FxPoint, RegimeBand } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

type ChartPanelProps = {
  series: {
    pair: string;
    data: FxPoint[];
  }[];
  normalized: boolean;
  labels: {
    rateHistory: string;
    relativePerformance: string;
  };
  regimeBands: RegimeBand[];
  eventMarkers: EventMarker[];
};

const COLORS = ['#5ab3ff', '#78f3da', '#ff9f6e'];
const REGIME_COLOR: Record<RegimeBand['regime'], string> = {
  low: 'rgba(82, 193, 164, 0.08)',
  normal: 'rgba(255, 206, 116, 0.07)',
  high: 'rgba(250, 124, 112, 0.09)',
};

export default function ChartPanel({
  series,
  normalized,
  labels,
  regimeBands,
  eventMarkers,
}: ChartPanelProps) {
  const allDates = Array.from(
    new Set(series.flatMap((item) => item.data.map((point) => point.date))),
  ).sort();
  const indexByDate = new Map(allDates.map((date, idx) => [date, idx]));
  const eventLabelByDate = new Map(eventMarkers.map((item) => [item.date, item.label]));

  const regimeBandPlugin: Plugin<'line'> = {
    id: 'regimeBands',
    beforeDatasetsDraw: (chart) => {
      if (!regimeBands.length) return;
      const xScale = chart.scales.x;
      const { ctx, chartArea } = chart;
      ctx.save();
      for (const band of regimeBands) {
        const startIdx = indexByDate.get(band.startDate);
        const endIdx = indexByDate.get(band.endDate);
        if (typeof startIdx !== 'number' || typeof endIdx !== 'number') continue;
        const xStart = xScale.getPixelForValue(startIdx);
        const xEnd = xScale.getPixelForValue(endIdx);
        const left = Math.min(xStart, xEnd);
        const right = Math.max(xStart, xEnd);
        ctx.fillStyle = REGIME_COLOR[band.regime];
        ctx.fillRect(left, chartArea.top, Math.max(1, right - left), chartArea.bottom - chartArea.top);
      }
      ctx.restore();
    },
  };

  const chartData = {
    labels: allDates,
    datasets: [
      ...series.map((item, idx) => {
        const base = item.data[0]?.rate ?? 1;
        const map = new Map(item.data.map((point) => [point.date, point.rate]));
        const values = allDates.map((date) => {
          const raw = map.get(date);
          if (typeof raw !== 'number') {
            return null;
          }
          if (!normalized) {
            return raw;
          }
          return (raw / base) * 100;
        });

        const color = COLORS[idx % COLORS.length];
        return {
          label: normalized ? `${item.pair} (index)` : item.pair,
          data: values,
          borderColor: color,
          backgroundColor: `${color}33`,
          pointRadius: 0,
          spanGaps: true,
          borderWidth: 2,
          tension: 0.3,
          fill: false,
        };
      }),
      {
        label: 'Events',
        data: allDates.map((date) => {
          const marker = eventMarkers.find((item) => item.date === date);
          return marker ? marker.value : null;
        }),
        borderColor: '#f7cf58',
        backgroundColor: '#f7cf58',
        pointStyle: 'triangle',
        pointRadius: 5,
        pointHoverRadius: 6,
        showLine: false,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: '#9fb4d1',
        },
      },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => items[0]?.label ?? '',
          label: (ctx: TooltipItem<'line'>) => {
            if (ctx.dataset.label === 'Events') {
              const label = eventLabelByDate.get(ctx.label);
              return label ? `Event: ${label}` : 'Event';
            }
            const y = ctx.parsed.y;
            if (typeof y !== 'number') {
              return `${ctx.dataset.label}: N/A`;
            }
            return normalized
              ? `${ctx.dataset.label}: ${y.toFixed(2)}`
              : `${ctx.dataset.label}: ${y.toFixed(4)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#9fb4d1',
          maxTicksLimit: 8,
        },
        grid: {
          color: 'rgba(159, 180, 209, 0.1)',
        },
      },
      y: {
        ticks: {
          color: '#9fb4d1',
          callback: (value: number | string) =>
            normalized ? Number(value).toFixed(1) : Number(value).toFixed(2),
        },
        grid: {
          color: 'rgba(159, 180, 209, 0.1)',
        },
      },
    },
  };

  return (
    <section className="chart-card">
      <header className="card-header">
        <h2>{normalized ? labels.relativePerformance : labels.rateHistory}</h2>
      </header>
      <div className="chart-wrap">
        <Line data={chartData} options={options} plugins={[regimeBandPlugin]} />
      </div>
    </section>
  );
}
