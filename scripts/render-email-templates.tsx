import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as React from "react";
import { pretty, render } from "react-email";
import AuthConfirmationEmail, {
  type AuthConfirmationEmailProps
} from "../src/emails/auth-confirmation";
import AuthRecoveryEmail, {
  type AuthRecoveryEmailProps
} from "../src/emails/auth-recovery";
import SupportTicketReplyEmail, {
  type SupportTicketReplyEmailProps
} from "../src/emails/support-ticket-reply";

type EmailSectionKey = "confirmation" | "recovery" | "supportTicketReply";

interface SharedCopy {
  brandName: string;
  brandStrapline: string;
  fallbackTitle: string;
  siteLabel: string;
  supportLabel: string;
}

interface SectionCopy {
  previewText: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  actionLabel: string;
  fallbackLabel: string;
  securityNote: string;
  footerPrimary: string;
  footerSecondary: string;
}

interface EmailTranslations {
  shared: SharedCopy;
  confirmation: SectionCopy;
  recovery: SectionCopy;
  supportTicketReply: SectionCopy;
}

const projectRoot = process.cwd();
const outputDirectory = path.resolve(projectRoot, "supabase/email-templates");
const localeDirectory = path.resolve(projectRoot, "src/locales");

const readLocale = async (locale: "es" | "en") => {
  const filePath = path.join(localeDirectory, locale, "email.json");
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as EmailTranslations;
};

const escapeTemplateValue = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("{{", "{ {")
    .replaceAll("}}", "} }");

const localize = (esValue: string, enValue: string) =>
  `{{ if eq .Data.locale "en" }}${escapeTemplateValue(
    enValue
  )}{{ else }}${escapeTemplateValue(esValue)}{{ end }}`;

const localizeParagraphs = (esValues: string[], enValues: string[]) =>
  esValues.map((esValue, index) =>
    localize(esValue, enValues[index] ?? esValue)
  );

const buildTemplateProps = (
  sectionKey: EmailSectionKey,
  es: EmailTranslations,
  en: EmailTranslations,
  actionHref: string
) => {
  const esSection = es[sectionKey];
  const enSection = en[sectionKey];

  return {
    previewText: localize(esSection.previewText, enSection.previewText),
    brandName: es.shared.brandName,
    brandStrapline: localize(
      es.shared.brandStrapline,
      en.shared.brandStrapline
    ),
    eyebrow: localize(esSection.eyebrow, enSection.eyebrow),
    title: localize(esSection.title, enSection.title),
    paragraphs: localizeParagraphs(esSection.paragraphs, enSection.paragraphs),
    actionLabel: localize(esSection.actionLabel, enSection.actionLabel),
    actionHref,
    fallbackTitle: localize(es.shared.fallbackTitle, en.shared.fallbackTitle),
    fallbackLabel: localize(esSection.fallbackLabel, enSection.fallbackLabel),
    fallbackHref: actionHref,
    securityNote: localize(esSection.securityNote, enSection.securityNote),
    footerPrimary: localize(esSection.footerPrimary, enSection.footerPrimary),
    footerSecondary: localize(
      esSection.footerSecondary,
      enSection.footerSecondary
    ),
    siteLabel: localize(es.shared.siteLabel, en.shared.siteLabel),
    supportLabel: localize(es.shared.supportLabel, en.shared.supportLabel)
  };
};

const restoreGoTemplateSyntax = (html: string) =>
  html.replace(/\{\{[\s\S]*?\}\}/g, (match) =>
    match.replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
  );

const writeTemplate = async (fileName: string, element: React.ReactElement) => {
  const html = restoreGoTemplateSyntax(await pretty(await render(element)));
  await writeFile(path.join(outputDirectory, fileName), html, "utf8");
};

const main = async () => {
  await mkdir(outputDirectory, { recursive: true });

  const [es, en] = await Promise.all([readLocale("es"), readLocale("en")]);

  const confirmationProps: AuthConfirmationEmailProps = buildTemplateProps(
    "confirmation",
    es,
    en,
    "{{ .ConfirmationURL }}"
  );
  const recoveryProps: AuthRecoveryEmailProps = buildTemplateProps(
    "recovery",
    es,
    en,
    "{{ .ConfirmationURL }}"
  );
  const supportTicketReplyProps: SupportTicketReplyEmailProps =
    buildTemplateProps(
      "supportTicketReply",
      es,
      en,
      "{{ .SiteURL }}/soporte?tab=tickets&ticket={{ .Data.ticket_id }}"
    );

  await Promise.all([
    writeTemplate(
      "confirm-signup.html",
      <AuthConfirmationEmail {...confirmationProps} />
    ),
    writeTemplate(
      "reset-password.html",
      <AuthRecoveryEmail {...recoveryProps} />
    ),
    writeTemplate(
      "support-ticket-reply.html",
      <SupportTicketReplyEmail {...supportTicketReplyProps} />
    )
  ]);
};

main().catch((error) => {
  console.error("Failed to render email templates.", error);
  process.exitCode = 1;
});
