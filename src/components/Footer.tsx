import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomInput from "@/components/ui/custom-input";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const Footer = () => {
  const { t } = useTranslation(["landing", "common"]);

  const companyLinks = [
    t("landing:footer.companyLinks.about"),
    t("landing:footer.companyLinks.methodology"),
    t("landing:footer.companyLinks.careers"),
    t("landing:footer.companyLinks.press")
  ];

  const resourceLinks = [
    t("landing:footer.resourceLinks.blog"),
    t("landing:footer.resourceLinks.guides"),
    t("landing:footer.resourceLinks.calendar"),
    t("landing:footer.resourceLinks.laws")
  ];

  const legalLinks = [
    t("landing:footer.legalLinks.privacy"),
    t("landing:footer.legalLinks.terms"),
    t("landing:footer.legalLinks.cookies")
  ];

  return (
    <footer className="bg-charcoal text-white">
      <div className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-20 w-auto"
              />
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              {t("landing:footer.description")}
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-white/70">
              {t("landing:footer.company")}
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((item) => (
                <li key={item}>
                  <Link
                    to="/"
                    className="text-sm text-white/50 hover:text-white transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-white/70">
              {t("landing:footer.resources")}
            </h4>
            <ul className="space-y-3">
              {resourceLinks.map((item) => (
                <li key={item}>
                  <Link
                    to="/"
                    className="text-sm text-white/50 hover:text-white transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-white/70">
              {t("landing:footer.newsletter")}
            </h4>
            <p className="text-sm text-white/50 mb-4">
              {t("landing:footer.newsletterDescription")}
            </p>
            <div className="flex border border-white/20">
              <CustomInput
                type="email"
                placeholder={t("landing:footer.newsletterPlaceholder")}
                className="h-auto flex-1 rounded-none border-0 bg-transparent px-4 py-2.5 text-white placeholder:text-white/30 focus:ring-0 focus:ring-offset-0"
              />
              <button className="px-3 text-primary hover:text-primary/80 transition-colors">
                →
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/40">
            {t("landing:footer.copyright")}
          </p>
          <div className="flex gap-6">
            {legalLinks.map((item) => (
              <Link
                key={item}
                to="/"
                className="text-xs text-white/40 hover:text-white transition-colors"
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
