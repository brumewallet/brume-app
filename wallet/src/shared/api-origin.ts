import { DEFAULT_BRUME_API_ORIGIN } from "@brume/shared";

// Set VITE_BRUME_API_ORIGIN=http://localhost:3000 in wallet/.env.development to use a local API.
export const BRUME_API_ORIGIN = (
  import.meta.env.VITE_BRUME_API_ORIGIN || DEFAULT_BRUME_API_ORIGIN
).replace(/\/$/, "");
