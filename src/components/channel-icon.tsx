import styles from "./application-inputs.module.css";
const images: Record<string, string> = {
  blog: "naver.png",
  clip: "naver.png",
  instagram: "instagram.svg",
  facebook: "facebook.png",
  linkedin: "linkedin.png",
  youtube: "youtube.png",
};
export default function ChannelIcon({ channel }: { channel: string }) {
  const image = images[channel];
  return image ? (
    <img
      src={`/brands/${image}`}
      alt=""
      aria-hidden="true"
      className={
        channel === "blog" || channel === "clip"
          ? styles.brandNaver
          : styles.brand
      }
    />
  ) : null;
}
