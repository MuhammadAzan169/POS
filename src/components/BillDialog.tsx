/**
 * The bill for one sale, on screen, with the two things anyone opens it for:
 * print it, or save it as a PDF to send.
 *
 * Shared by the till and the sales list so a bill looks the same however it was
 * reached, and so the account figures on it are built in exactly one place.
 */
import { useStore } from "@/lib/store";
import { buildInvoice, printInvoice } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import type { Sale } from "@/lib/store";
import { Invoice } from "./Invoice";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

export function BillDialog({ sale: opened, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { settings, customers, shops, sales, customerPayments, setOffs, adjustments } = useStore();
  if (!opened) return null;

  /*
   * The bill is always built from the CURRENT record, not the one that was
   * handed over when the dialog opened. Edit a sale, take a payment against it
   * or process a return with this open and the figures move with it — a stale
   * snapshot here would print a bill that disagreed with the ledger it was
   * supposed to summarise, and it would be the printed copy the customer kept.
   */
  const sale = sales.find((s) => s.id === opened.id) ?? opened;

  const customer = sale.customerId ? (customers.find((c) => c.id === sale.customerId) ?? null) : null;
  const shop = shops.find((s) => s.id === sale.shopId) ?? null;
  const data = buildInvoice(
    sale,
    { sales, customerPayments, setOffs, adjustments },
    { customer, shop },
  );

  /**
   * Straight to a file: no print dialog, no preview tab, no destination to
   * choose. The PDF is drawn from the same data and the same design toggles as
   * the bill on screen.
   */
  const download = async () => {
    try {
      await downloadInvoicePdf(data, settings);
      toast.success(`Bill ${sale.invoice} downloaded`);
    } catch {
      toast.error("Could not build the PDF. Use Print instead.");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader data-print="hide">
          <DialogTitle>Bill {sale.invoice}</DialogTitle>
        </DialogHeader>

        {/* The print stylesheet prints only this node, wherever it sits. */}
        <div data-print="only">
          <Invoice data={data} settings={settings} />
        </div>

        <div data-print="hide" className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button className="flex-1 h-11" onClick={download}>
            <Download className="h-4 w-4 mr-1.5" />
            Download PDF
          </Button>
          <Button variant="outline" className="flex-1 h-11" onClick={() => printInvoice()}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
