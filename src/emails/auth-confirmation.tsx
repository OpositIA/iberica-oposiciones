import * as React from "react";
import AuthEmailLayout, {
  type AuthEmailLayoutProps
} from "./_components/AuthEmailLayout";

export type AuthConfirmationEmailProps = AuthEmailLayoutProps;

export default function AuthConfirmationEmail(
  props: AuthConfirmationEmailProps
) {
  return (
    <React.Fragment>
      <AuthEmailLayout {...props} />
    </React.Fragment>
  );
}
