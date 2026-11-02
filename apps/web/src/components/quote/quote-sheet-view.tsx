import { DocumentSheetView } from "@/components/sheet/document-sheet-view";
import { quoteSheet, type QuoteSheetInput } from "@/lib/quote/quote-sheet";

/** The quotation as paper, on screen: the same sheet as its PDF. */
export function QuoteSheetView({ quote, className = "" }: { quote: QuoteSheetInput; className?: string }) {
  return <DocumentSheetView sheet={quoteSheet(quote)} className={className} />;
}
