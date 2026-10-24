declare module "oidc-provider" {
  interface ProviderOptions { [key: string]: unknown }
  export default class Provider {
    constructor(issuer: string, options: ProviderOptions);
    callback(): unknown;
  }
}
