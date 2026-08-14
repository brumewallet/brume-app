
export const NATIVE_SOL_TOKEN_SEGMENT = "native" as const;

export function nativeSolTokenPath(): string {
  return `/token/${encodeURIComponent(NATIVE_SOL_TOKEN_SEGMENT)}`;
}
