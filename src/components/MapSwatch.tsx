export function MapSwatch({ color }: { color: string | undefined }) {
  return <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flex: "none" }} />;
}
