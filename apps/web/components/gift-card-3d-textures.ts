/** Bakes theme-aware canvas textures used by the 3D gift-card materials. */

import type { FeaturedCard } from "./wallet-static-card";

const PALETTE_VARS = [
  "--card-bg-1",
  "--card-bg-2",
  "--card-bg-3",
  "--card-ink",
  "--card-ink-dim",
  "--card-foil-hi",
  "--card-foil-lo",
  "--card-gold",
] as const;

type PaletteVar = (typeof PALETTE_VARS)[number];

export type CardPalette = Record<PaletteVar, string> & {
  serif: string;
  sans: string;
  mono: string;
};

export type CardTextureMode = "color" | "material";

export const CARD_FACE_WIDTH = 400;
export const CARD_FACE_HEIGHT = 252;
const TEXTURE_SCALE = 3;

/** Resolve the scene palette from the same CSS tokens and font stacks as the static card. */
export function readCardPalette(element: HTMLElement): CardPalette {
  const computed = getComputedStyle(element);
  const palette = {} as CardPalette;
  for (const name of PALETTE_VARS) {
    palette[name] = computed.getPropertyValue(name).trim() || "#000";
  }
  palette.serif = computed.getPropertyValue("--font-serif").trim() || "serif";
  palette.sans = computed.getPropertyValue("--font-sans").trim() || "sans-serif";
  palette.mono = computed.getPropertyValue("--font-mono").trim() || "monospace";
  return palette;
}

type TexturePainters = {
  face: (
    context: CanvasRenderingContext2D,
    mode: CardTextureMode,
    palette: CardPalette,
    card: FeaturedCard,
  ) => void;
  height: (
    context: CanvasRenderingContext2D,
    palette: CardPalette,
    card: FeaturedCard,
  ) => void;
};

export type CardTextureCanvases = {
  palette: CardPalette;
  color: HTMLCanvasElement;
  material: HTMLCanvasElement;
  height: HTMLCanvasElement;
};

/** Bake registered color, material, and relief canvases at one shared scale. */
export function createCardTextureCanvases(
  host: HTMLElement,
  card: FeaturedCard,
  painters: TexturePainters,
): CardTextureCanvases | null {
  const palette = readCardPalette(host);
  const makeCanvas = (paint: (context: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_FACE_WIDTH * TEXTURE_SCALE;
    canvas.height = CARD_FACE_HEIGHT * TEXTURE_SCALE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.scale(TEXTURE_SCALE, TEXTURE_SCALE);
    paint(context);
    return canvas;
  };

  const color = makeCanvas((context) => painters.face(context, "color", palette, card));
  const material = makeCanvas((context) => painters.face(context, "material", palette, card));
  const height = makeCanvas((context) => painters.height(context, palette, card));
  if (!color || !material || !height) return null;
  return { palette, color, material, height };
}
