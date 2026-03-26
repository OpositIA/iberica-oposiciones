import AuthEmailLayout, {
  type AuthEmailLayoutProps
} from "./_components/AuthEmailLayout";

export type AuthConfirmationEmailProps = AuthEmailLayoutProps;

export default function AuthConfirmationEmail(
  props: AuthConfirmationEmailProps
) {
  return <AuthEmailLayout {...props} />;
}
