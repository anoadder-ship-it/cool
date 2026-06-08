/**
 * NftImage — reusable NFT image with error-fallback to an icon placeholder.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";

interface NftImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  fallbackIconClass?: string;
  /** Extra props forwarded to the <img> element */
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
}

export function NftImage({
  src,
  alt,
  className = "w-full h-full object-cover",
  fallbackIconClass = "w-10 h-10 text-muted-foreground/15",
  loading = "lazy",
  decoding = "async",
}: NftImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <ImageOff className={fallbackIconClass} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={() => setError(true)}
      className={className}
    />
  );
}
