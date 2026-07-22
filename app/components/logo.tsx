import { Link } from "react-router";

export function Logo({ home = "/", variant = "dark" }: { home?: string; variant?: "dark" | "light" }) {
  return (
    <Link to={home} className="logo" aria-label="Zen Coffee Lab">
      <img
        src={`/media/logo-${variant === "light" ? "white" : "black"}.svg`}
        alt=""
        width="104"
        height="56"
      />
    </Link>
  );
}
