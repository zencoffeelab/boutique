export type ImageCropAspect =
  | "original"
  | "75:83"
  | "1:1"
  | "4:3"
  | "3:2"
  | "16:9"
  | "3:4";

export type ImageCropRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  ratio: number;
}>;

const aspectRatios: Readonly<Record<Exclude<ImageCropAspect, "original">, number>> = {
  "75:83": 75 / 83,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "3:4": 3 / 4,
};

export const imageCropAspectOptions: ReadonlyArray<Readonly<{
  value: ImageCropAspect;
  label: string;
}>> = [
  { value: "original", label: "Format original" },
  { value: "75:83", label: "Éditorial · 75:83" },
  { value: "1:1", label: "Carré · 1:1" },
  { value: "4:3", label: "Paysage · 4:3" },
  { value: "3:2", label: "Photo · 3:2" },
  { value: "16:9", label: "Panoramique · 16:9" },
  { value: "3:4", label: "Portrait · 3:4" },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function imageAspectRatio(
  aspect: ImageCropAspect,
  sourceWidth: number,
  sourceHeight: number,
) {
  if (aspect !== "original") return aspectRatios[aspect];
  if (sourceWidth <= 0 || sourceHeight <= 0) return 1;
  return sourceWidth / sourceHeight;
}

export function calculateImageCrop({
  sourceWidth,
  sourceHeight,
  aspect,
  zoom,
  positionX,
  positionY,
}: {
  sourceWidth: number;
  sourceHeight: number;
  aspect: ImageCropAspect;
  zoom: number;
  positionX: number;
  positionY: number;
}): ImageCropRect {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const ratio = imageAspectRatio(aspect, safeWidth, safeHeight);
  const sourceRatio = safeWidth / safeHeight;
  let fittedWidth = safeWidth;
  let fittedHeight = safeHeight;

  if (sourceRatio > ratio) fittedWidth = safeHeight * ratio;
  else fittedHeight = safeWidth / ratio;

  const safeZoom = clamp(zoom, 1, 4);
  const width = fittedWidth / safeZoom;
  const height = fittedHeight / safeZoom;
  const availableX = safeWidth - width;
  const availableY = safeHeight - height;
  const x = availableX * ((clamp(positionX, -100, 100) + 100) / 200);
  const y = availableY * ((clamp(positionY, -100, 100) + 100) / 200);

  return { x, y, width, height, ratio };
}

export function resizedImageDimensions({
  requestedWidth,
  ratio,
  maximumDimension = 3200,
}: {
  requestedWidth: number;
  ratio: number;
  maximumDimension?: number;
}) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const maximumWidth = Math.max(
    160,
    Math.floor(Math.min(maximumDimension, maximumDimension * safeRatio)),
  );
  const width = Math.round(clamp(requestedWidth, 160, maximumWidth));
  const height = Math.max(1, Math.round(width / safeRatio));
  return { width, height, maximumWidth };
}
