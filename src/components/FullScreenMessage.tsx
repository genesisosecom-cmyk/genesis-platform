interface Props {
  loading?: boolean;
  title?: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}

export default function FullScreenMessage({ loading, title, text, action }: Props) {
  return (
    <div className="center-screen">
      {loading ? (
        <span className="spinner" aria-label="Cargando" />
      ) : (
        <div className="center-screen__box fade-in">
          <span className="brand">Genesis</span>
          {title && <h1 className="page__title page__title--sm">{title}</h1>}
          {text && <p className="muted">{text}</p>}
          {action && (
            <button className="btn btn--ghost" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
