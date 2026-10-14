/** Fondo "ambient gradient": manchas de luz difuminadas que derivan lentamente. */
export default function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__blob ambient__blob--a" />
      <div className="ambient__blob ambient__blob--b" />
      <div className="ambient__blob ambient__blob--c" />
      <div className="ambient__shadow" />
      <div className="ambient__grain" />
    </div>
  );
}
