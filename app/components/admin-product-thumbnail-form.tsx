import { Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { Form } from "react-router";
import { ProductThumbnailLabel } from "~/components/product-thumbnail-label";
import { dominantLabelColor } from "~/lib/image-color";

const neutralBagUrl = "/media/product-cards/zen-coffee-bag-neutral.png";

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

export function AdminProductThumbnailForm({
  productId,
  currentLabelUrl,
  currentBackgroundColor,
  demo,
}: {
  productId: string;
  currentLabelUrl: string | null;
  currentBackgroundColor: string;
  demo: boolean;
}) {
  const [backgroundColor, setBackgroundColor] = useState(currentBackgroundColor);
  const [labelPreview, setLabelPreview] = useState(currentLabelUrl);
  const [detecting, setDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const detectionSequence = useRef(0);

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    detectionSequence.current += 1;
    const sequence = detectionSequence.current;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = file ? URL.createObjectURL(file) : null;
    setLabelPreview(previewObjectUrl.current ?? currentLabelUrl);
    setDetectionMessage(null);
    if (!file) return;
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
        aria-label="Aperçu de la miniature"
      >
        <img className="admin-thumbnail-preview__bag" src={neutralBagUrl} alt="" />
        {labelPreview ? <ProductThumbnailLabel className="admin-thumbnail-preview__label" src={labelPreview} alt="Aperçu de l’étiquette" /> : null}
      </div>
      <Form method="post" encType="multipart/form-data" className="admin-thumbnail-form">
        <input type="hidden" name="intent" value="upload_thumbnail_label" />
        <input type="hidden" name="productId" value={productId} />
        <div className="field">
          <label>
            Fichier de l’étiquette
            <input
              name="file"
              type="file"
              accept="image/png,image/webp,image/jpeg"
              required={!currentLabelUrl}
              onChange={handleFile}
            />
          </label>
          <small>L’étiquette sera centrée et intégrée sur la face avant du paquet, avec un léger effet de matière.</small>
        </div>
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
        <button className="ui-button ui-button--outline" type="submit" disabled={demo || detecting}>
          <Upload aria-hidden="true" /> {currentLabelUrl ? "Enregistrer la miniature" : "Ajouter l’étiquette"}
        </button>
      </Form>
    </div>
  </section>;
}
