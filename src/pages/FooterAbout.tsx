import eduardoPhoto from "@/assets/Edu.jpg";
import oscarPhoto from "@/assets/oscar.jpeg";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-charcoal">
        <Navbar />
        <div className="h-24 md:h-28" />
      </div>

      <main className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-80 w-full bg-[radial-gradient(circle_at_18%_18%,hsl(var(--primary)/0.16),transparent_36%),radial-gradient(circle_at_82%_12%,hsl(var(--accent)/0.16),transparent_30%)]" />

        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 md:px-8 md:pb-24 md:pt-14">
          <header className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {t("about.eyebrow")}
            </p>
            <h1 className="mt-4 text-3xl font-serif tracking-tight md:text-5xl">
              {t("about.title")}
            </h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
              {t("about.intro")}
            </p>
          </header>

          <section className="mt-16 grid gap-16">
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
                  <div className="aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-secondary/45">
                    <img
                      src={teamImages[member.id]}
                      alt={member.imageAlt}
                      className="h-full w-full object-cover object-center"
                      loading="lazy"
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
              </article>
            ))}
          </section>

          <section className="mt-20 border-t border-border/70 pt-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                {t("about.values.eyebrow")}
              </p>
              <h2 className="mt-3 text-2xl font-serif tracking-tight md:text-4xl">
                {t("about.values.title")}
              </h2>
            </div>

            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {values.map((value) => (
                <article
                  key={value.title}
                  className="border-t border-border/60 pt-4"
                >
                  <h3 className="text-base font-semibold tracking-tight">
                    {value.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {value.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FooterAbout;
