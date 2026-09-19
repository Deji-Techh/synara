export interface ExpandedImageItem {
  src: string;
  name: string;
}

export interface ExpandedImagePreview {
  images: ExpandedImageItem[];
  index: number;
}

export function buildExpandedImagePreview(
  images: ReadonlyArray<{ id: string; name: string; previewUrl?: string | null }>,
  selectedImageId: string,
  resolveSrc: (image: { id: string; previewUrl?: string | null }) => string | undefined = (image) =>
    image.previewUrl ?? undefined,
): ExpandedImagePreview | null {
  const previewableImages = images.flatMap((image) => {
    const src = resolveSrc(image);
    return src ? [{ id: image.id, src, name: image.name }] : [];
  });
  if (previewableImages.length === 0) {
    return null;
  }
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId);
  if (selectedIndex < 0) {
    return null;
  }
  return {
    images: previewableImages.map((image) => ({
      src: image.src,
      name: image.name,
    })),
    index: selectedIndex,
  };
}
