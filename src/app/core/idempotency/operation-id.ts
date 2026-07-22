/**
 * Idempotencia NFR-34: cada formulario de creación genera UN operationId al
 * montarse y lo reutiliza en todos los reintentos de ese submit (corte de red,
 * doble click). Solo se regenera al iniciar un alta nueva.
 */
export function newOperationId(): string {
  return crypto.randomUUID();
}
