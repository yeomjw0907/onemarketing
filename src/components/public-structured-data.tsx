import {
  publicStructuredData,
  serializeStructuredData,
  type PublicPath,
} from "@/lib/public-seo";

export default function PublicStructuredData({ path }: { path: PublicPath }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeStructuredData(publicStructuredData(path)),
      }}
    />
  );
}
