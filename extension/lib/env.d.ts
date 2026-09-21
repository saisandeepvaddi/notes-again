interface ImportMetaEnv {
  /** Default API origin baked into this build (e.g. your production URL). */
  readonly WXT_SERVER_URL?: string;
  /** Default web-app origin, only when it differs from the API's (local dev). */
  readonly WXT_APP_URL?: string;
}

// Vite handles these; TypeScript just needs to know their shape.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
declare module "*.css";
