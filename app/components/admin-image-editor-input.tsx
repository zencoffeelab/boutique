import { Crop, ImagePlus, RotateCcw, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  calculateImageCrop,
  imageAspectRatio,
  imageCropAspectOptions,
  resizedImageDimensions,
  type ImageCropAspect,
  type ImageCropRect,
} from "~/lib/image-editor";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumSourceBytes = 40_000_000;
const maximumOutputBytes = 8_000_000;

export type AdminProcessedImage = Readonly<{
  file: File;
  width: number;
  height: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cette image ne peut pas être lue."));
    image.src = source;
  });
}

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: ImageCropRect,
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("L’éditeur d’image n’est pas disponible dans ce navigateur.");
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("La création de l’image a échoué.")),
      type,
      type === "image/png" ? undefined : 0.9,
    );
  });
}

function outputFileName(file: File, type: string) {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}-recadree.${type === "image/png" ? "png" : "webp"}`;
}

function assignInputFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  if (!file) {
    input.value = "";
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

export function AdminImageEditorInput({
  name = "file",
  label,
  help,
  required = false,
  currentPreviewUrl,
  defaultAspect = "original",
  lockAspect = false,
  defaultOutputWidth = 1600,
  dimensionFieldNames,
  onProcessed,
}: {
  name?: string;
  label: string;
  help?: string;
  required?: boolean;
  currentPreviewUrl?: string | null;
  defaultAspect?: ImageCropAspect;
  lockAspect?: boolean;
  defaultOutputWidth?: number;
  dimensionFieldNames?: Readonly<{ width: string; height: string }>;
  onProcessed?: (image: AdminProcessedImage) => void | Promise<void>;
}) {
  const inputId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceObjectUrlRef = useRef<string | null>(null);
  const processedObjectUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [processedImage, setProcessedImage] = useState<AdminProcessedImage | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<ImageCropAspect>(defaultAspect);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [outputWidth, setOutputWidth] = useState(defaultOutputWidth);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const sourceWidth = sourceImage?.naturalWidth ?? 1;
  const sourceHeight = sourceImage?.naturalHeight ?? 1;
  const ratio = imageAspectRatio(aspect, sourceWidth, sourceHeight);
  const output = resizedImageDimensions({ requestedWidth: outputWidth, ratio });
  const displayPreviewUrl = processedPreviewUrl ?? currentPreviewUrl ?? null;

  useEffect(() => {
    setHydrated(true);
    return () => {
      if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
      if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceImage) return;
    const crop = calculateImageCrop({
      sourceWidth,
      sourceHeight,
      aspect,
      zoom,
      positionX,
      positionY,
    });
    let previewWidth = 900;
    let previewHeight = previewWidth / crop.ratio;
    if (previewHeight > 620) {
      previewHeight = 620;
      previewWidth = previewHeight * crop.ratio;
    }
    drawCrop(
      canvas,
      sourceImage,
      crop,
      Math.max(1, Math.round(previewWidth)),
      Math.max(1, Math.round(previewHeight)),
    );
  }, [aspect, positionX, positionY, sourceHeight, sourceImage, sourceWidth, zoom]);

  const restoreProcessedSelection = () => {
    assignInputFile(inputRef.current, processedImage?.file ?? null);
  };

  const cancelEditing = () => {
    restoreProcessedSelection();
    setError(null);
    dialogRef.current?.close();
  };

  const resetCrop = () => {
    setAspect(defaultAspect);
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
    setOutputWidth(Math.min(defaultOutputWidth, sourceImage?.naturalWidth ?? defaultOutputWidth));
    setError(null);
  };

  const openEditor = () => {
    if (!sourceImage) return;
    setError(null);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);
    if (!acceptedImageTypes.has(file.type)) {
      setError("Choisissez une image JPEG, PNG ou WebP.");
      assignInputFile(inputRef.current, processedImage?.file ?? null);
      return;
    }
    if (file.size > maximumSourceBytes) {
      setError("L’image source doit peser moins de 40 Mo.");
      assignInputFile(inputRef.current, processedImage?.file ?? null);
      return;
    }
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
    const source = URL.createObjectURL(file);
    sourceObjectUrlRef.current = source;
    try {
      const image = await loadImage(source);
      setSourceFile(file);
      setSourceImage(image);
      setAspect(defaultAspect);
      setZoom(1);
      setPositionX(0);
      setPositionY(0);
      setOutputWidth(Math.max(160, Math.min(defaultOutputWidth, image.naturalWidth)));
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cette image ne peut pas être lue.");
      assignInputFile(inputRef.current, processedImage?.file ?? null);
    }
  };

  const handleAspect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextAspect = event.currentTarget.value as ImageCropAspect;
    const nextRatio = imageAspectRatio(nextAspect, sourceWidth, sourceHeight);
    const nextOutput = resizedImageDimensions({ requestedWidth: outputWidth, ratio: nextRatio });
    setAspect(nextAspect);
    setOutputWidth(nextOutput.width);
    setPositionX(0);
    setPositionY(0);
  };

  const applyCrop = async () => {
    if (!sourceImage || !sourceFile) return;
    setProcessing(true);
    setError(null);
    try {
      const crop = calculateImageCrop({
        sourceWidth,
        sourceHeight,
        aspect,
        zoom,
        positionX,
        positionY,
      });
      const canvas = document.createElement("canvas");
      drawCrop(canvas, sourceImage, crop, output.width, output.height);
      const outputType = sourceFile.type === "image/png" ? "image/png" : "image/webp";
      const blob = await canvasBlob(canvas, outputType);
      if (blob.size > maximumOutputBytes) {
        throw new Error("L’image produite dépasse 8 Mo. Réduisez sa largeur de sortie.");
      }
      const file = new File([blob], outputFileName(sourceFile, outputType), {
        type: outputType,
        lastModified: Date.now(),
      });
      const nextProcessedImage = { file, width: output.width, height: output.height };
      assignInputFile(inputRef.current, file);
      if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      processedObjectUrlRef.current = previewUrl;
      setProcessedImage(nextProcessedImage);
      setProcessedPreviewUrl(previewUrl);
      await onProcessed?.(nextProcessedImage);
      dialogRef.current?.close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le traitement de l’image a échoué.");
    } finally {
      setProcessing(false);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX,
      positionY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPositionX(clamp(drag.positionX - ((event.clientX - drag.x) / bounds.width) * 200, -100, 100));
    setPositionY(clamp(drag.positionY - ((event.clientY - drag.y) / bounds.height) * 200, -100, 100));
  };

  const stopDragging = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setPositionX((value) => clamp(value - step, -100, 100));
    else if (event.key === "ArrowRight") setPositionX((value) => clamp(value + step, -100, 100));
    else if (event.key === "ArrowUp") setPositionY((value) => clamp(value - step, -100, 100));
    else if (event.key === "ArrowDown") setPositionY((value) => clamp(value + step, -100, 100));
    else return;
    event.preventDefault();
  };

  return <div className="admin-image-input" data-ready={hydrated ? "true" : "false"}>
    <input
      ref={inputRef}
      id={inputId}
      className="admin-image-input__native"
      name={name}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      required={required && !processedImage}
      disabled={!hydrated}
      onChange={handleFile}
    />
    {dimensionFieldNames ? <>
      <input type="hidden" name={dimensionFieldNames.width} value={processedImage?.width ?? ""} />
      <input type="hidden" name={dimensionFieldNames.height} value={processedImage?.height ?? ""} />
    </> : null}
    <div className="admin-image-input__summary">
      {displayPreviewUrl ? (
        <img src={displayPreviewUrl} alt="Aperçu de l’image sélectionnée" />
      ) : (
        <span className="admin-image-input__placeholder"><ImagePlus aria-hidden="true" /></span>
      )}
      <div>
        <strong>{label}</strong>
        {processedImage ? (
          <small>{processedImage.width} × {processedImage.height} px · {(processedImage.file.size / 1_000_000).toFixed(2)} Mo</small>
        ) : help ? <small>{help}</small> : null}
        <div className="admin-image-input__actions">
          <label
            className="ui-button ui-button--outline"
            htmlFor={inputId}
            aria-disabled={!hydrated}
          >
            <ImagePlus aria-hidden="true" /> {displayPreviewUrl ? "Choisir une autre image" : "Choisir une image"}
          </label>
          {sourceImage ? (
            <button className="ui-button ui-button--ghost" type="button" onClick={openEditor}>
              <Crop aria-hidden="true" /> Modifier le cadrage
            </button>
          ) : null}
        </div>
      </div>
    </div>
    {error ? <p className="admin-image-input__error" role="alert">{error}</p> : null}

    <dialog
      ref={dialogRef}
      className="admin-image-editor-modal"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); cancelEditing(); }}
      onClick={(event) => { if (event.target === event.currentTarget) cancelEditing(); }}
    >
      <div className="admin-image-editor-modal__panel">
        <header>
          <div>
            <p className="eyebrow">Éditeur d’image</p>
            <h2 id={titleId}>Recadrer et redimensionner</h2>
            <p id={descriptionId}>Déplacez l’image, ajustez le zoom puis choisissez sa largeur finale.</p>
          </div>
          <button type="button" aria-label="Fermer l’éditeur d’image" onClick={cancelEditing}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="admin-image-editor-modal__workspace">
          <div className="admin-image-editor-modal__preview">
            <canvas
              ref={previewCanvasRef}
              tabIndex={0}
              role="img"
              aria-label="Aperçu du recadrage. Faites glisser ou utilisez les flèches du clavier pour déplacer l’image."
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onKeyDown={handleCanvasKeyDown}
            />
            <span>Faites glisser l’aperçu pour déplacer le cadrage</span>
          </div>
          <div className="admin-image-editor-modal__controls">
            <div className="field">
              <label>
                Format de recadrage
                <select value={aspect} disabled={lockAspect} onChange={handleAspect}>
                  {imageCropAspectOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field admin-image-editor-modal__range">
              <label htmlFor={`${inputId}-zoom`}>Zoom <output>{zoom.toFixed(2)}×</output></label>
              <input id={`${inputId}-zoom`} type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} />
            </div>
            <div className="field admin-image-editor-modal__range">
              <label htmlFor={`${inputId}-horizontal`}>Position horizontale <output>{Math.round(positionX)} %</output></label>
              <input id={`${inputId}-horizontal`} type="range" min="-100" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.currentTarget.value))} />
            </div>
            <div className="field admin-image-editor-modal__range">
              <label htmlFor={`${inputId}-vertical`}>Position verticale <output>{Math.round(positionY)} %</output></label>
              <input id={`${inputId}-vertical`} type="range" min="-100" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.currentTarget.value))} />
            </div>
            <div className="field">
              <label>
                Largeur finale (px)
                <input
                  type="number"
                  min="160"
                  max={output.maximumWidth}
                  step="10"
                  value={outputWidth}
                  onChange={(event) => setOutputWidth(Number(event.currentTarget.value))}
                />
              </label>
              <small>Sortie : {output.width} × {output.height} px</small>
            </div>
            <button className="ui-button ui-button--ghost" type="button" onClick={resetCrop}>
              <RotateCcw aria-hidden="true" /> Réinitialiser
            </button>
          </div>
        </div>
        <footer>
          <button className="ui-button ui-button--ghost" type="button" onClick={cancelEditing}>Annuler</button>
          <button className="ui-button ui-button--default" type="button" disabled={processing} onClick={applyCrop}>
            <Crop aria-hidden="true" /> {processing ? "Création de l’image…" : "Valider le recadrage"}
          </button>
        </footer>
      </div>
    </dialog>
  </div>;
}
