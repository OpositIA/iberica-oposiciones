import AuthEmailLayout, {
  type AuthEmailLayoutProps
} from "./_components/AuthEmailLayout";

export type AuthRecoveryEmailProps = AuthEmailLayoutProps;

export default function AuthRecoveryEmail(props: AuthRecoveryEmailProps) {
  return <AuthEmailLayout {...props} />;
}
