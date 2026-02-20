import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { HistogramBin } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type ReturnsHistogramChartProps = {
  data: HistogramBin[];
  title: string;
};

export default function ReturnsHistogramChart({ data, title }: ReturnsHistogramChartProps) {
  const chartData = {
    labels: data.map((bin) => bin.label),
    datasets: [
      {
        label: title,
        data: data.map((bin) => bin.count),
        backgroundColor: 'rgba(90, 179, 255, 0.45)',
        borderColor: '#5ab3ff',
        borderWidth: 1,
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `${items[0]?.label ?? ''}%`,
          label: (ctx: TooltipItem<'bar'>) => `Count: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9fb4d1', maxTicksLimit: 6 },
        grid: { color: 'rgba(159, 180, 209, 0.06)' },
      },
      y: {
        ticks: { color: '#9fb4d1' },
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
        <Bar data={chartData} options={options} />
      </div>
    </section>
  );
}
