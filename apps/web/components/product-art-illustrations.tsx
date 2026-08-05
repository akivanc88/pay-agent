/** Maps catalog product identifiers to their deterministic illustration components. */

import { Roses, Sunflowers, Tulips } from "./product-art-bouquet-specimens";
import { Gardenias, Orchid } from "./product-art-flowering-specimens";
import { CeramicPot } from "./product-art-potted-specimen";

export const PRODUCT_ILLUSTRATIONS: Readonly<Record<string, () => React.ReactElement>> = {
  bouquet_roses: Roses,
  bouquet_sunflowers: Sunflowers,
  bouquet_tulips: Tulips,
  orchid_white: Orchid,
  gardenias: Gardenias,
  pot_ceramic: CeramicPot,
};

export const FALLBACK_PRODUCT_ILLUSTRATION = Gardenias;
