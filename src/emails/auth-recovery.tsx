import * as React from "react";
import AuthEmailLayout, {
  type AuthEmailLayoutProps
} from "./_components/AuthEmailLayout";

export type AuthRecoveryEmailProps = AuthEmailLayoutProps;

export default function AuthRecoveryEmail(props: AuthRecoveryEmailProps) {
  return (
    <React.Fragment>
      <AuthEmailLayout {...props} />
    </React.Fragment>
  );
}
