import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { MetricPoint } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip);

type RollingVolChartProps = {
  data: MetricPoint[];
  title: string;
};

export default function RollingVolChart({ data, title }: RollingVolChartProps) {
  const chartData = {
    labels: data.map((point) => point.date),
    datasets: [
      {
        label: title,
        data: data.map((point) => point.value),
        borderColor: '#78f3da',
        backgroundColor: 'rgba(120, 243, 218, 0.2)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => items[0]?.label ?? '',
          label: (ctx: TooltipItem<'line'>) => {
            const y = ctx.parsed.y;
            return `${title}: ${typeof y === 'number' ? y.toFixed(2) : 'N/A'}%`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9fb4d1', maxTicksLimit: 7 },
        grid: { color: 'rgba(159, 180, 209, 0.1)' },
      },
      y: {
        ticks: { color: '#9fb4d1', callback: (v: number | string) => `${Number(v).toFixed(2)}%` },
        grid: { color: 'rgba(159, 180, 209, 0.1)' },
      },
    },
  };

  return (
    <section className="chart-card small-chart">
      <header className="card-header">
        <h2>{title}</h2>
      </header>
      <div className="chart-wrap small-wrap">
        <Line data={chartData} options={options} />
      </div>
    </section>
  );
}
