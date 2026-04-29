import eduardoPhoto from "@/assets/Edu.webp";
import oscarPhoto from "@/assets/oscar.webp";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type TeamMember = {
  bio: string;
  id: string;
  imageAlt: string;
  name: string;
  role: string;
};

type Value = {
  description: string;
  title: string;
};

const FooterAbout = () => {
  const { t } = useTranslation("footerPages");
  const team = t("about.team.members", {
    returnObjects: true
  }) as TeamMember[];
  const values = t("about.values.items", {
    returnObjects: true
  }) as Value[];
  const teamImages: Record<string, string> = {
    eduardo: eduardoPhoto,
    oscar: oscarPhoto
  };
  const [isPageReady, setIsPageReady] = useState(
    typeof document !== "undefined" && document.readyState === "complete"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.readyState === "complete") {
      setIsPageReady(true);
      return;
    }

    const handleLoad = () => setIsPageReady(true);
    window.addEventListener("load", handleLoad, { once: true });
    return () => window.removeEventListener("load", handleLoad);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-charcoal">
        <Navbar />
        <div className="h-24 md:h-28" />
      </div>

      <main className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-80 w-full bg-[radial-gradient(circle_at_18%_18%,hsl(var(--primary)/0.16),transparent_36%),radial-gradient(circle_at_82%_12%,hsl(var(--accent)/0.16),transparent_30%)]" />

        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 md:px-8 md:pb-24 md:pt-14">
          {isPageReady ? (
            <div className="animate-in fade-in-0 duration-700">
              <Reveal
                as="header"
                className="max-w-3xl"
                duration={760}
                threshold={0}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                  {t("about.eyebrow")}
                </p>
                <h1 className="mt-4 text-3xl font-serif tracking-tight md:text-5xl">
                  {t("about.title")}
                </h1>
                <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
                  {t("about.intro")}
                </p>
              </Reveal>

              <section className="mt-16 grid gap-16">
                {team.map((member, index) => (
                  <Reveal
                    as="article"
                    key={member.id}
                    delay={index * 90}
                    duration={820}
                    variant={index % 2 === 0 ? "left" : "right"}
                    className="grid gap-8 border-t border-border/70 pt-8 md:grid-cols-[minmax(0,520px)_minmax(0,1fr)] md:items-center md:gap-12"
                  >
                    <div
                      className={`max-w-sm ${
                        index % 2 === 1 ? "md:order-2 md:justify-self-end" : ""
                      }`}
                    >
                      <div className="aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-secondary/45">
                        <img
                          src={teamImages[member.id]}
                          alt={member.imageAlt}
                          className="h-full w-full object-cover object-center"
                          loading={index === 0 ? "eager" : "lazy"}
                          fetchPriority={index === 0 ? "high" : "auto"}
                          decoding="async"
                        />
                      </div>
                    </div>

                    <div
                      className={`max-w-3xl ${index % 2 === 1 ? "md:order-1" : ""}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                        {member.role}
                      </p>
                      <h2 className="mt-3 text-2xl font-serif tracking-tight md:text-4xl">
                        {member.name}
                      </h2>
                      <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
                        {member.bio}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </section>

              <Reveal
                as="section"
                className="mt-20 border-t border-border/70 pt-8"
                duration={780}
                variant="soft"
              >
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                    {t("about.values.eyebrow")}
                  </p>
                  <h2 className="mt-3 text-2xl font-serif tracking-tight md:text-4xl">
                    {t("about.values.title")}
                  </h2>
                </div>

                <div className="mt-10 grid gap-8 md:grid-cols-3">
                  {values.map((value, index) => (
                    <Reveal
                      as="article"
                      key={value.title}
                      delay={index * 70}
                      duration={760}
                      variant="gentle"
                      className="border-t border-border/60 pt-4"
                    >
                      <h3 className="text-base font-semibold tracking-tight">
                        {value.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">
                        {value.description}
                      </p>
                    </Reveal>
                  ))}
                </div>
              </Reveal>
            </div>
          ) : (
            <div className="space-y-16">
              <section className="max-w-3xl">
                <Skeleton className="app-skeleton-strong h-3 w-24 rounded-full" />
                <Skeleton className="app-skeleton-strong mt-4 h-12 w-full max-w-2xl rounded-[1.5rem]" />
                <Skeleton className="app-skeleton-soft mt-3 h-12 w-10/12 rounded-[1.5rem]" />
                <Skeleton className="app-skeleton-soft mt-6 h-4 w-full rounded-full" />
                <Skeleton className="app-skeleton-soft mt-3 h-4 w-11/12 rounded-full" />
                <Skeleton className="app-skeleton-soft mt-3 h-4 w-9/12 rounded-full" />
              </section>

              <section className="grid gap-16">
                {team.map((member, index) => (
                  <article
                    key={member.id}
                    className="grid gap-8 border-t border-border/70 pt-8 md:grid-cols-[minmax(0,520px)_minmax(0,1fr)] md:items-center md:gap-12"
                  >
                    <div
                      className={`max-w-sm ${
                        index % 2 === 1 ? "md:order-2 md:justify-self-end" : ""
                      }`}
                    >
                      <Skeleton className="app-skeleton-strong aspect-[4/5] w-full rounded-[2rem]" />
                    </div>

                    <div
                      className={`max-w-3xl ${index % 2 === 1 ? "md:order-1" : ""}`}
                    >
                      <Skeleton className="app-skeleton-strong h-3 w-32 rounded-full" />
                      <Skeleton className="app-skeleton-strong mt-4 h-10 w-72 rounded-[1.25rem]" />
                      <Skeleton className="app-skeleton-soft mt-6 h-4 w-full rounded-full" />
                      <Skeleton className="app-skeleton-soft mt-3 h-4 w-11/12 rounded-full" />
                      <Skeleton className="app-skeleton-soft mt-3 h-4 w-10/12 rounded-full" />
                    </div>
                  </article>
                ))}
              </section>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FooterAbout;
