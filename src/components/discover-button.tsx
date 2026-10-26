// Adapted from ObsidianUI Discover Button (MIT). See THIRD_PARTY_NOTICES.md.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "./discover-button.css";

export default function DiscoverButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link href={href} className="obsidian-discover-button">
      <span className="obsidian-discover-button__fill" aria-hidden="true" />
      <span className="obsidian-discover-button__icon" aria-hidden="true">
        <ArrowRight size={16} strokeWidth={2} />
      </span>
      <span className="obsidian-discover-button__text">{label}</span>
    </Link>
  );
}
