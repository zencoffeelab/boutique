import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Form } from "react-router";
import { AdminImageEditorInput, type AdminProcessedImage } from "~/components/admin-image-editor-input";
import { PRODUCT_THUMBNAIL_BAG_URL, ProductThumbnailLabel } from "~/components/product-thumbnail-label";
import { dominantLabelColor } from "~/lib/image-color";

async function detectFileColor(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("Image illisible"));
      candidate.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Analyse de couleur indisponible");
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return dominantLabelColor(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function loadImage(sourceUrl: string) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Image indisponible");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("Image illisible"));
      candidate.src = objectUrl;
    });
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight);
}

function pastelColor(color: string) {
  const channels = color.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) return "#e8eee4";
  return `rgb(${channels.map((channel) => Math.round(255 * 0.72 + channel * 0.28)).join(" ")})`;
}

async function exportThumbnailAsPng(labelUrl: string, backgroundColor: string, filename: string) {
  const [label, bag] = await Promise.all([loadImage(labelUrl), loadImage(PRODUCT_THUMBNAIL_BAG_URL)]);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 3000;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Export indisponible");
    context.fillStyle = pastelColor(backgroundColor);
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(canvas.width * 0.54, canvas.height * 0.78);
    context.scale(canvas.width * 0.26, canvas.height * 0.055);
    const shadow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, "#10170d3d");
    shadow.addColorStop(0.48, "#10170d12");
    shadow.addColorStop(0.76, "transparent");
    context.fillStyle = shadow;
    context.fillRect(-1, -1, 2, 2);
    context.restore();

    context.save();
    context.shadowColor = "#10170d2e";
    context.shadowBlur = canvas.width * 0.024;
    context.shadowOffsetY = canvas.height * 0.028;
    drawContainedImage(context, bag.image, canvas.width * 0.136, canvas.height * 0.13, canvas.width * 0.73, canvas.height * 0.76);
    context.restore();

    const labelWidth = canvas.width * 0.28;
    const labelHeight = labelWidth * (697 / 1240);
    context.save();
    context.shadowColor = "#10170d38";
    context.shadowBlur = canvas.width * 0.009;
    context.shadowOffsetY = canvas.height * 0.01;
    context.drawImage(label.image, (canvas.width - labelWidth) / 2, canvas.height * 0.595 - labelHeight / 2, labelWidth, labelHeight);
    context.restore();

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Export indisponible");
    const downloadUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } finally {
    URL.revokeObjectURL(label.objectUrl);
    URL.revokeObjectURL(bag.objectUrl);
  }
}

export function AdminProductThumbnailForm({
  productId,
  productSlug,
  currentLabelUrl,
  currentBackgroundColor,
  demo,
}: {
  productId: string;
  productSlug: string;
  currentLabelUrl: string | null;
  currentBackgroundColor: string;
  demo: boolean;
}) {
  const [backgroundColor, setBackgroundColor] = useState(currentBackgroundColor);
  const [labelPreview, setLabelPreview] = useState(currentLabelUrl);
  const [detecting, setDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const detectionSequence = useRef(0);

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  const handleFile = async ({ file }: AdminProcessedImage) => {
    detectionSequence.current += 1;
    const sequence = detectionSequence.current;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = URL.createObjectURL(file);
    setLabelPreview(previewObjectUrl.current ?? currentLabelUrl);
    setDetectionMessage(null);
    setDetecting(true);
    try {
      const detectedColor = await detectFileColor(file);
      if (detectionSequence.current !== sequence) return;
      setBackgroundColor(detectedColor);
      setDetectionMessage(`Couleur principale détectée : ${detectedColor.toUpperCase()}`);
    } catch {
      if (detectionSequence.current === sequence)
        setDetectionMessage("La couleur n’a pas pu être détectée. Vous pouvez la choisir manuellement.");
    } finally {
      if (detectionSequence.current === sequence) setDetecting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (currentLabelUrl) return;
    const hasFile = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .some((input) => input.files && input.files.length > 0);
    if (hasFile) return;
    event.preventDefault();
    formRef.current?.querySelector<HTMLInputElement>('input[name="fileSource"]')?.click();
  };

  const handleExport = async () => {
    if (!labelPreview) return;
    setExporting(true);
    setExportMessage(null);
    try {
      await exportThumbnailAsPng(labelPreview, backgroundColor, `${productSlug}-miniature-3000.png`);
      setExportMessage("Miniature complète PNG 3000 × 3000 téléchargée.");
    } catch {
      setExportMessage("Le téléchargement n’a pas pu être préparé. Réessayez dans un instant.");
    } finally {
      setExporting(false);
    }
  };

  return <section className="ui-card admin-editor admin-thumbnail-editor">
    <div className="admin-thumbnail-editor__heading">
      <div>
        <p className="eyebrow">Carte produit</p>
        <h2>Étiquette de la miniature</h2>
      </div>
      <p>Ajoutez l’étiquette seule, idéalement en PNG ou WebP avec un fond transparent.</p>
    </div>
    <div className="admin-thumbnail-editor__layout">
      <div
        className="admin-thumbnail-preview"
        style={{ "--product-thumbnail-color": backgroundColor } as CSSProperties}
        role="img"
        aria-label="Aperçu de la miniature"
      >
        <img className="admin-thumbnail-preview__bag" src={PRODUCT_THUMBNAIL_BAG_URL} alt="" />
        {labelPreview ? <ProductThumbnailLabel className="admin-thumbnail-preview__label" src={labelPreview} alt="Aperçu de l’étiquette" /> : null}
      </div>
      <Form ref={formRef} method="post" encType="multipart/form-data" className="admin-thumbnail-form" noValidate onSubmit={handleSubmit}>
        <input type="hidden" name="intent" value="upload_thumbnail_label" />
        <input type="hidden" name="productId" value={productId} />
        <AdminImageEditorInput
          label="Fichier de l’étiquette"
          help="PNG, WebP ou JPEG. L’étiquette sera centrée et intégrée sur la face avant du paquet."
          required={!currentLabelUrl}
          currentPreviewUrl={currentLabelUrl}
          defaultAspect="original"
          defaultOutputWidth={1600}
          onProcessed={handleFile}
        />
        <div className="field admin-thumbnail-color-field">
          <label>
            Couleur de fond
            <span>
              <input
                name="thumbnailBackgroundColor"
                type="color"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.currentTarget.value)}
              />
              <code>{backgroundColor.toUpperCase()}</code>
            </span>
          </label>
          <small aria-live="polite">{detecting ? "Analyse de l’étiquette…" : detectionMessage ?? "Détectée automatiquement, puis ajustable si nécessaire."}</small>
        </div>
        <button className="ui-button ui-button--outline" type="submit" disabled={demo}>
          <Upload aria-hidden="true" /> {currentLabelUrl ? "Enregistrer la miniature" : "Ajouter l’étiquette"}
        </button>
        <div className="admin-thumbnail-form__export">
          <button className="ui-button ui-button--outline" type="button" disabled={!labelPreview || exporting} onClick={handleExport}>
            <Download aria-hidden="true" /> {exporting ? "Préparation du PNG…" : "Télécharger la miniature PNG 3000 × 3000"}
          </button>
          <small aria-live="polite">{exportMessage ?? "La miniature complète est exportée avec son fond coloré et son paquet blanc."}</small>
        </div>
      </Form>
    </div>
  </section>;
}
