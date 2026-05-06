import * as React from "react";
import AuthEmailLayout, {
  type AuthEmailLayoutProps
} from "./_components/AuthEmailLayout";

export type SupportTicketReplyEmailProps = AuthEmailLayoutProps;

export default function SupportTicketReplyEmail(
  props: SupportTicketReplyEmailProps
) {
  return (
    <React.Fragment>
      <AuthEmailLayout {...props} />
    </React.Fragment>
  );
}
