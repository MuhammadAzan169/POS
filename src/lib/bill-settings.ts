/**
 * Which bill design a particular shop's bills use.
 *
 * There is one business-wide design on Settings, and any shop may override
 * parts of it. Resolving that in one function — rather than at each of the
 * places a bill is produced — is what stops the preview, the printed copy and
 * the downloaded PDF from ever disagreeing about a branch's paperwork.
 */
import type { Settings, Shop } from "./store-types";

/**
 * The settings to render a bill with, for a given shop.
 *
 * Overrides are merged field by field, so a shop that has only set a title
 * follows the business design for everything else — including later changes to
 * it. Storing a whole copy per shop would freeze each branch at the moment it
 * was last touched, and a group-wide change to the terms would silently miss
 * every outlet that had ever opened the designer.
 */
export function settingsForShop(settings: Settings, shop: Shop | null | undefined): Settings {
  const over = shop?.bill;
  // Nothing overridden and no logo of its own: the business settings as they are.
  if (!over && !shop?.logo) return settings;

  return {
    ...settings,
    invoice: { ...settings.invoice, ...(over?.design ?? {}) },
    // `||`, not `??`: a cleared field is an empty string, which means "fall
    // back", not "print nothing".
    invoiceTitle: over?.title || settings.invoiceTitle,
    invoiceTerms: over?.terms || settings.invoiceTerms,
    invoiceSignatory: over?.signatory || settings.invoiceSignatory,
    invoiceCopyLabel: over?.copyLabel || settings.invoiceCopyLabel,
    invoiceNote: over?.note || settings.invoiceNote,
    invoiceLogo: shop?.logo || settings.invoiceLogo,
  };
}
