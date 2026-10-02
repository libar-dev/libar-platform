// Byte bounds shared by command parsing and context persistence.
export const limitIdLength = 256;
export const limitActorIdLength = 512;
const encoder = new TextEncoder();
// The bytes TextEncoder produces, so an unpaired surrogate counts as the three bytes of U+FFFD.
export function utf8Length(value: string): number {
  return encoder.encode(value).length;
}
