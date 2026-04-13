declare module "@react-email/components" {
  import type { ComponentType, PropsWithChildren } from "react";

  type EmailComponentProps = PropsWithChildren<Record<string, unknown>>;

  export const Body: ComponentType<EmailComponentProps>;
  export const Button: ComponentType<EmailComponentProps>;
  export const Container: ComponentType<EmailComponentProps>;
  export const Head: ComponentType<EmailComponentProps>;
  export const Hr: ComponentType<EmailComponentProps>;
  export const Html: ComponentType<EmailComponentProps>;
  export const Link: ComponentType<EmailComponentProps>;
  export const Preview: ComponentType<EmailComponentProps>;
  export const Section: ComponentType<EmailComponentProps>;
  export const Text: ComponentType<EmailComponentProps>;
}

declare module "@react-email/render" {
  import type { ReactElement } from "react";

  export function render(element: ReactElement): Promise<string>;
  export function pretty(html: string): Promise<string>;
}
