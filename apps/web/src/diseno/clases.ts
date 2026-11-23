export function clases(...valores: Array<string | false | null | undefined>): string {
  return valores.filter(Boolean).join(' ');
}
