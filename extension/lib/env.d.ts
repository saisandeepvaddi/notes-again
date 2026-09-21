interface ImportMetaEnv {
  /** Firebase web API key baked in at build time (optional; can be set in Options instead). */
  readonly WXT_FIREBASE_API_KEY?: string;
}

// Vite handles these; TypeScript just needs to know their shape.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
declare module "*.css";
