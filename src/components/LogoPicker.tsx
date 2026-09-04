/**
 * Picking a logo, and getting it onto white paper.
 *
 * Shared by Settings (the business-wide logo) and the Shops page (a logo for
 * one outlet), so both behave identically and there is one place where the
 * awkward parts live: downscaling, and cutting the background out.
 */
import { useRef, useState } from "react";
import { Image as ImageIcon, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

/**
 * The long edge a stored logo is reduced to.
 *
 * It is printed about 34mm wide, so 320px is roughly twice what a 600dpi
 * printer can resolve at that size — and the logo travels inside a row that is
 * read on every page load, where a phone photo's few megabytes of base64 would
 * be felt on every screen in the app.
 */
const MAX_EDGE = 320;

export function LogoPicker({
  value,
  onChange,
  label = "Logo",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  /** The upload before its background was cut out, so the cut can be undone. */
  const original = useRef<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file — PNG or JPG");
      return;
    }
    setBusy(true);
    try {
      const flat = await downscale(file, MAX_EDGE);
      const cut = await removeBackground(flat);
      original.current = cut === flat ? null : flat;
      onChange(cut);
      toast.success(cut === flat ? "Logo updated" : "Logo added, background removed");
    } catch {
      toast.error("That image could not be read");
    } finally {
      setBusy(false);
    }
  };

  const undoCut = () => {
    if (!original.current) return;
    onChange(original.current);
    original.current = null;
    toast.info("Background kept");
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/*
        A checkerboard, not a white card: with a white ground behind it there is
        no way to tell a transparent logo from one that still has a white block
        baked in, which is the single thing this control exists to get right.
      */}
      <div
        className="h-20 w-32 shrink-0 rounded-lg border grid place-items-center overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
          backgroundColor: "#fff",
        }}
      >
        {value ? (
          <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="space-y-2 min-w-0">
        <div className="flex gap-2 flex-wrap">
          <label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                // Cleared so picking the same file twice still fires a change.
                e.target.value = "";
              }}
            />
            <span
              className={`inline-flex items-center h-9 px-3 rounded-md border text-sm font-medium cursor-pointer hover:bg-muted transition-colors ${busy ? "opacity-60 pointer-events-none" : ""}`}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {busy ? "Working…" : value ? "Replace" : "Upload logo"}
            </span>
          </label>

          {original.current && (
            <Button variant="outline" className="h-9" onClick={undoCut}>
              <Undo2 className="h-4 w-4 mr-1.5" />
              Keep background
            </Button>
          )}

          {value && (
            <Button
              variant="outline"
              className="h-9"
              onClick={() => {
                original.current = null;
                onChange("");
              }}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          A solid background is cut out automatically. Large images are resized.
        </p>
      </div>
    </div>
  );
}

/** Reads a file, fits it inside `max` on its long edge, returns a PNG data URL. */
function downscale(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("unreadable"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("not an image"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG, so whatever transparency comes out the other side survives.
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** How close two colours must be, on a 0-255 scale per channel, to count as the same. */
const SOLID = 42;
/** Beyond this distance a pixel is definitely the logo. Between the two, it fades. */
const EDGE = 88;

/**
 * Cuts a solid background out of a logo.
 *
 * Most shop logos arrive as a JPEG or a flattened PNG with the background baked
 * in — a gold mark on a black square, say — and dropped onto a white bill that
 * square is the first thing anyone notices. There is no alpha channel to
 * respect, so the colour has to be keyed out.
 *
 * The background colour is taken from the border rather than assumed: it is
 * whatever surrounds the mark. If the border is not one consistent colour the
 * image is left completely alone, because that means the picture goes right to
 * the edge and anything removed would be part of the logo.
 *
 * Pixels fade out between `SOLID` and `EDGE` rather than switching off at a
 * threshold, which is what keeps the cut edge smooth instead of jagged.
 */
async function removeBackground(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return dataUrl;

  const img = new Image();
  img.src = dataUrl;
  try {
    // A data URL still decodes asynchronously; reading the pixels before this
    // resolves gives an empty canvas, and the logo would come out blank.
    await img.decode();
  } catch {
    return dataUrl;
  }
  if (!img.naturalWidth) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);

  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return dataUrl;
  }

  const bg = borderColour(pixels);
  if (!bg) return dataUrl;

  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const d = distance(data[i], data[i + 1], data[i + 2], bg);
    if (d <= SOLID) {
      data[i + 3] = 0;
    } else if (d < EDGE) {
      data[i + 3] = Math.round(data[i + 3] * ((d - SOLID) / (EDGE - SOLID)));
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

const distance = (r: number, g: number, b: number, to: [number, number, number]) =>
  Math.sqrt((r - to[0]) ** 2 + (g - to[1]) ** 2 + (b - to[2]) ** 2);

/**
 * The colour surrounding the image, or null if the border is not uniform.
 *
 * Uniform means at least 85% of the border pixels sit within `SOLID` of the
 * average — enough to survive JPEG noise and a soft vignette, strict enough
 * that a photograph, or a logo that bleeds to the edge, is left alone.
 */
function borderColour(pixels: ImageData): [number, number, number] | null {
  const { width, height, data } = pixels;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const samples: number[][] = [];

  for (let x = 0; x < width; x++) {
    samples.push([data[at(x, 0)], data[at(x, 0) + 1], data[at(x, 0) + 2]]);
    samples.push([
      data[at(x, height - 1)],
      data[at(x, height - 1) + 1],
      data[at(x, height - 1) + 2],
    ]);
  }
  for (let y = 0; y < height; y++) {
    samples.push([data[at(0, y)], data[at(0, y) + 1], data[at(0, y) + 2]]);
    samples.push([data[at(width - 1, y)], data[at(width - 1, y) + 1], data[at(width - 1, y) + 2]]);
  }
  if (samples.length === 0) return null;

  const avg = samples
    .reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0])
    .map((n) => Math.round(n / samples.length)) as [number, number, number];

  const alike = samples.filter((s) => distance(s[0], s[1], s[2], avg) <= SOLID).length;
  return alike / samples.length >= 0.85 ? avg : null;
}
