/**
 * The published `paynow` package ships no type declarations (its dist/ is
 * plain .js). Typed loosely to just what this package calls — see
 * node_modules/paynow/src/paynow.ts for the real shape if this drifts.
 */
declare module "paynow" {
  export class Paynow {
    constructor(integrationId: string, integrationKey: string, resultUrl: string, returnUrl: string);
    createPayment(reference: string, authEmail: string): { add(title: string, amount: number): unknown };
    /** Web checkout — resolves with a browser URL for Paynow's hosted page. */
    send(payment: unknown): Promise<unknown>;
    sendMobile(payment: unknown, phone: string, method: string): Promise<unknown>;
    pollTransaction(pollUrl: string): Promise<unknown>;
  }
}
