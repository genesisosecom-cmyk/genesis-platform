export default function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
