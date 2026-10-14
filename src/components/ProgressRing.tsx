interface Props {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export default function ProgressRing({ percent, size = 168, stroke = 3, label }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${percent}% completado`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring__value"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <div className="ring__center">
        <span className="ring__number">{percent}<small>%</small></span>
        {label && <span className="eyebrow">{label}</span>}
      </div>
    </div>
  );
}
