import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text
} from "@react-email/components";

const palette = {
  background: "#f8fafc",
  panel: "#ffffff",
  panelMuted: "#fff7ed",
  border: "#e2e8f0",
  borderWarm: "#fed7aa",
  primary: "#f97316",
  accent: "#0284c7",
  text: "#0f172a",
  textMuted: "#475569",
  textSoft: "#64748b",
  dark: "#111827"
} as const;

const bodyStyle = {
  backgroundColor: palette.background,
  color: palette.text,
  fontFamily:
    "'Mulish', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: "0",
  padding: "32px 12px"
};

const shellStyle = {
  maxWidth: "620px",
  margin: "0 auto"
};

const cardStyle = {
  backgroundColor: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: "28px",
  overflow: "hidden",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.10)"
};

const headerStyle = {
  backgroundColor: palette.dark,
  padding: "28px 32px 24px"
};

const badgeStyle = {
  display: "inline-block",
  borderRadius: "999px",
  border: "1px solid rgba(249, 115, 22, 0.24)",
  backgroundColor: "rgba(249, 115, 22, 0.14)",
  color: "#fed7aa",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.18em",
  lineHeight: "1",
  margin: "0 0 18px",
  padding: "10px 14px",
  textTransform: "uppercase"
};

const brandStyle = {
  color: "#ffffff",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "28px",
  fontStyle: "italic",
  fontWeight: "700",
  letterSpacing: "-0.02em",
  lineHeight: "1.1",
  margin: "0"
};

const straplineStyle = {
  color: "#cbd5e1",
  fontSize: "13px",
  lineHeight: "22px",
  margin: "8px 0 0"
};

const contentStyle = {
  padding: "32px"
};

const titleStyle = {
  color: palette.text,
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "34px",
  fontStyle: "italic",
  fontWeight: "700",
  letterSpacing: "-0.03em",
  lineHeight: "1.12",
  margin: "0 0 18px"
};

const paragraphStyle = {
  color: palette.textMuted,
  fontSize: "15px",
  lineHeight: "27px",
  margin: "0 0 14px"
};

const buttonWrapStyle = {
  padding: "12px 0 10px"
};

const buttonStyle = {
  backgroundColor: palette.primary,
  borderRadius: "999px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "1",
  padding: "15px 26px",
  textDecoration: "none"
};

const infoPanelStyle = {
  backgroundColor: palette.panelMuted,
  border: `1px solid ${palette.borderWarm}`,
  borderRadius: "20px",
  margin: "18px 0 0",
  padding: "18px 20px"
};

const infoTitleStyle = {
  color: palette.text,
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.14em",
  lineHeight: "1.2",
  margin: "0 0 10px",
  textTransform: "uppercase"
};

const linkStyle = {
  color: palette.accent,
  fontSize: "13px",
  lineHeight: "22px",
  textDecoration: "underline",
  wordBreak: "break-all" as const
};

const securityStyle = {
  color: palette.textSoft,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "18px 0 0"
};

const dividerStyle = {
  borderColor: palette.border,
  margin: "0"
};

const footerStyle = {
  padding: "20px 32px 28px"
};

const footerTextStyle = {
  color: palette.textSoft,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0 0 10px"
};

const footerLinkStyle = {
  color: palette.accent,
  fontSize: "12px",
  lineHeight: "20px",
  textDecoration: "underline"
};

export interface AuthEmailLayoutProps {
  previewText: string;
  brandName: string;
  brandStrapline: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  actionLabel: string;
  actionHref: string;
  fallbackTitle: string;
  fallbackLabel: string;
  fallbackHref: string;
  securityNote: string;
  footerPrimary: string;
  footerSecondary: string;
  siteLabel: string;
  supportLabel: string;
}

export default function AuthEmailLayout({
  previewText,
  brandName,
  brandStrapline,
  eyebrow,
  title,
  paragraphs,
  actionLabel,
  actionHref,
  fallbackTitle,
  fallbackLabel,
  fallbackHref,
  securityNote,
  footerPrimary,
  footerSecondary,
  siteLabel,
  supportLabel
}: AuthEmailLayoutProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={shellStyle}>
          <Section style={cardStyle}>
            <Section style={headerStyle}>
              <Text style={badgeStyle}>{eyebrow}</Text>
              <Text style={brandStyle}>{brandName}</Text>
              <Text style={straplineStyle}>{brandStrapline}</Text>
            </Section>

            <Section style={contentStyle}>
              <Text style={titleStyle}>{title}</Text>
              {paragraphs.map((paragraph) => (
                <Text key={paragraph} style={paragraphStyle}>
                  {paragraph}
                </Text>
              ))}

              <Section style={buttonWrapStyle}>
                <Button href={actionHref} style={buttonStyle}>
                  {actionLabel}
                </Button>
              </Section>

              <Section style={infoPanelStyle}>
                <Text style={infoTitleStyle}>{fallbackTitle}</Text>
                <Text style={{ ...paragraphStyle, marginBottom: "10px" }}>
                  {fallbackLabel}
                </Text>
                <Link href={fallbackHref} style={linkStyle}>
                  {fallbackHref}
                </Link>
              </Section>

              <Text style={securityStyle}>{securityNote}</Text>
            </Section>

            <Hr style={dividerStyle} />

            <Section style={footerStyle}>
              <Text style={footerTextStyle}>{footerPrimary}</Text>
              <Text style={footerTextStyle}>{footerSecondary}</Text>
              <Text style={{ ...footerTextStyle, marginBottom: "0" }}>
                <Link href="{{ .SiteURL }}" style={footerLinkStyle}>
                  {siteLabel}
                </Link>{" "}
                ·{" "}
                <Link href="{{ .SiteURL }}/support" style={footerLinkStyle}>
                  {supportLabel}
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
