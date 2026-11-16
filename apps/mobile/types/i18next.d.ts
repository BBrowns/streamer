import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    returnEmptyString: true;
  }
}
