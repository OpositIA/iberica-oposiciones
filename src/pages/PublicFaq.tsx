import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import CustomButton from "@/components/ui/custom-button";
import { ArrowRight, BadgeCheck, BookOpenText } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type FaqEntry = {
  answer: string;
  id: string;
  question: string;
};

type FaqGroup = {
  description: string;
  id: string;
  items: FaqEntry[];
  label: string;
};

type FlattenedFaqEntry = FaqEntry & {
  groupId: string;
};

const PublicFaq = () => {
  const { t } = useTranslation(["faq", "support"]);

  const faqGroups = useMemo(
    () =>
      t("support:faq.groups", {
        returnObjects: true
      }) as FaqGroup[],
    [t]
  );

  const faqSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      name: t("faq:seo.page.title"),
      description: t("faq:seo.page.description"),
      mainEntity: faqGroups.flatMap((group) =>
        group.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer
          }
        }))
      )
    }),
    [faqGroups, t]
  );

  const faqItems = useMemo(
    () =>
      faqGroups.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          groupId: group.id
        }))
      ),
    [faqGroups]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-charcoal">
        <Navbar />
        <div className="h-24 md:h-28" />
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8 md:px-8 md:pt-12">
        <header className="max-w-3xl pb-8">
          <h1 className="mt-3 text-3xl font-serif md:text-5xl">
            {t("faq:seo.page.title")}
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-base">
            {t("faq:seo.page.description")}
          </p>
        </header>

        <section>
          <Accordion
            type="multiple"
            className="rounded-[1.7rem] bg-secondary/14 px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            {faqItems.map((item) => (
              <AccordionItem
                key={`${item.groupId}-${item.id}`}
                value={`${item.groupId}-${item.id}`}
                className="border-border/55"
              >
                <AccordionTrigger className="gap-4 py-5 text-left text-sm font-semibold leading-6 hover:no-underline md:text-base">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-14 rounded-[2rem] bg-[linear-gradient(135deg,rgba(214,138,69,0.12),rgba(15,23,42,0.04))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t("faq:cta.eyebrow")}
              </div>
              <h2 className="mt-4 text-2xl font-serif md:text-4xl">
                {t("faq:cta.title")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground md:text-base">
                {t("faq:cta.description")}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <CustomButton asChild styleType="primary" className="px-5 py-3">
                <Link to="/registro">
                  {t("faq:cta.primary")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CustomButton>
              <CustomButton asChild styleType="menu" className="px-5 py-3">
                <Link to="/planes">
                  <BookOpenText className="h-4 w-4" />
                  {t("faq:cta.secondary")}
                </Link>
              </CustomButton>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default PublicFaq;
