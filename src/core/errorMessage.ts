/** The message of a thrown value: an `Error`'s `message`, or the value as a
 * string for anything else that was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
