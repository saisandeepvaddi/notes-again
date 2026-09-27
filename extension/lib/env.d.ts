interface ImportMetaEnv {
  readonly WXT_SERVER_URL?: string;
  readonly WXT_APP_URL?: string;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}
declare module "*.css";
