import AppLoading from "@/components/AppLoading";
import CustomButton from "@/components/ui/custom-button";
import { useToast } from "@/hooks/use-toast";
import { formatPlanPriceFromCents } from "@/lib/plans";
import {
  createSyllabusDownloadCheckoutSession,
  downloadPurchasedSyllabusArchive,
  useCurrentSyllabusDownloadOfferQuery,
  useResolvedOppositionQuery
} from "@/queries/profileQueries";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  FileArchive,
  FileText,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";

const formatVersionLabel = (
  publishedAt: string | null,
  extractedAt: string | null,
  locale: string
) => {
  const source = publishedAt || extractedAt;
  if (!source) return "Version actual";

  const parsedDate = new Date(source);
  if (Number.isNaN(parsedDate.getTime())) return "Version actual";

  return new Intl.DateTimeFormat(locale || "es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsedDate);
};

const ProfileSyllabusDownload = () => {
  const { t, i18n } = useTranslation(["profile"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ subtopicFileId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const normalizedSubtopicFileId = Number.parseInt(
    String(params.subtopicFileId ?? "").trim(),
    10
  );
  const topicTitle = searchParams.get("topicTitle")?.trim() || "";
  const checkoutState = searchParams.get("checkout")?.trim() || "";

  const {
    data: offer,
    isLoading,
    isFetching,
    refetch
  } = useCurrentSyllabusDownloadOfferQuery(normalizedSubtopicFileId);

  const { data: opposition } = useResolvedOppositionQuery({
    preferredOppositionId: offer?.opposition_id,
    preferredOppositionName: null,
    locale: i18n.resolvedLanguage,
    enabled: Boolean(offer?.opposition_id)
  });

  const oppositionName =
    opposition?.nombre || offer?.opposition_id || "Oposicion";
  const versionLabel = useMemo(
    () =>
      formatVersionLabel(
        offer?.syllabus_published_at ?? null,
        offer?.syllabus_extracted_at ?? null,
        i18n.resolvedLanguage || "es-ES"
      ),
    [
      offer?.syllabus_extracted_at,
      offer?.syllabus_published_at,
      i18n.resolvedLanguage
    ]
  );
  const viewerHref = useMemo(() => {
    const nextParams = new URLSearchParams();
    if (topicTitle) nextParams.set("topicTitle", topicTitle);
    const query = nextParams.toString();
    return `/perfil/temario/pdf/${normalizedSubtopicFileId}${query ? `?${query}` : ""}`;
  }, [normalizedSubtopicFileId, topicTitle]);

  useEffect(() => {
    if (!checkoutState) return;

    if (checkoutState === "success") {
      toast({
        title: t("syllabus.downloadCheckoutSuccessTitle", {
          defaultValue: "Pago confirmado"
        }),
        description: t("syllabus.downloadCheckoutSuccessDescription", {
          defaultValue:
            "La licencia del temario se actualizara en unos segundos y podras descargar el ZIP completo."
        })
      });
      void queryClient.invalidateQueries({
        queryKey: ["syllabus", "download-offer", normalizedSubtopicFileId]
      });
      void refetch();
    }

    if (checkoutState === "cancel") {
      toast({
        title: t("syllabus.downloadCheckoutCancelledTitle", {
          defaultValue: "Pago cancelado"
        }),
        description: t("syllabus.downloadCheckoutCancelledDescription", {
          defaultValue: "No se ha realizado ningun cobro."
        }),
        variant: "destructive"
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    nextParams.delete("session_id");
    setSearchParams(nextParams, { replace: true });
  }, [
    checkoutState,
    normalizedSubtopicFileId,
    queryClient,
    refetch,
    searchParams,
    setSearchParams,
    t,
    toast
  ]);

  if (
    !Number.isFinite(normalizedSubtopicFileId) ||
    normalizedSubtopicFileId <= 0
  ) {
    return (
      <section className="space-y-4">
        <div className="rounded-[1.5rem] border border-border bg-background p-6">
          <p className="text-sm text-muted-foreground">
            {t("syllabus.viewerInvalidPdf", {
              defaultValue: "No se ha identificado un PDF valido del temario."
            })}
          </p>
          <CustomButton asChild className="mt-4">
            <Link to="/perfil/temario">
              <ArrowLeft className="h-4 w-4" />
              {t("syllabus.viewerBack", { defaultValue: "Volver al temario" })}
            </Link>
          </CustomButton>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <AppLoading
        label={t("syllabus.downloadLoading", {
          defaultValue: "Cargando licencia del temario..."
        })}
      />
    );
  }

  if (!offer) {
    return (
      <section className="space-y-4">
        <div className="rounded-[1.5rem] border border-border bg-background p-6">
          <p className="text-sm text-muted-foreground">
            {t("syllabus.downloadUnavailable", {
              defaultValue:
                "La descarga completa no esta disponible para este temario."
            })}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <CustomButton asChild>
              <Link to={viewerHref}>
                <ArrowLeft className="h-4 w-4" />
                {t("syllabus.viewerBack", {
                  defaultValue: "Volver al temario"
                })}
              </Link>
            </CustomButton>
            <CustomButton styleType="ghost" onClick={() => void refetch()}>
              {t("syllabus.viewerRetry", { defaultValue: "Reintentar" })}
            </CustomButton>
          </div>
        </div>
      </section>
    );
  }

  const handleStartCheckout = async () => {
    if (isStartingCheckout) return;
    setIsStartingCheckout(true);

    try {
      const { checkoutUrl } = await createSyllabusDownloadCheckoutSession({
        subtopicFileId: normalizedSubtopicFileId,
        successPath: `/perfil/temario/descarga/${normalizedSubtopicFileId}?checkout=success&session_id={CHECKOUT_SESSION_ID}${topicTitle ? `&topicTitle=${encodeURIComponent(topicTitle)}` : ""}`,
        cancelPath: `/perfil/temario/descarga/${normalizedSubtopicFileId}?checkout=cancel${topicTitle ? `&topicTitle=${encodeURIComponent(topicTitle)}` : ""}`
      });

      window.location.assign(checkoutUrl);
    } catch (error) {
      toast({
        title: t("syllabus.downloadCheckoutStartErrorTitle", {
          defaultValue: "No se pudo iniciar el pago"
        }),
        description:
          error instanceof Error
            ? error.message
            : t("syllabus.downloadCheckoutStartErrorDescription", {
                defaultValue: "Intentalo de nuevo en unos segundos."
              }),
        variant: "destructive"
      });
      setIsStartingCheckout(false);
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const { blob, fileName } = await downloadPurchasedSyllabusArchive(
        normalizedSubtopicFileId
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || "temario-completo.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      toast({
        title: t("syllabus.downloadReadyTitle", {
          defaultValue: "Descarga preparada"
        }),
        description: t("syllabus.downloadReadyDescription", {
          defaultValue:
            "El ZIP incluye los bloques separados y cada PDF individual sin marca de agua visual."
        })
      });
    } catch (error) {
      toast({
        title: t("syllabus.downloadFailedTitle", {
          defaultValue: "No se pudo descargar el temario"
        }),
        description:
          error instanceof Error
            ? error.message
            : t("syllabus.downloadFailedDescription", {
                defaultValue: "Intentalo de nuevo en unos segundos."
              }),
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <CustomButton asChild styleType="ghost" className="rounded-full px-4">
          <Link to={viewerHref}>
            <ArrowLeft className="h-4 w-4" />
            {t("syllabus.viewerBack", { defaultValue: "Volver al temario" })}
          </Link>
        </CustomButton>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          <FileArchive className="h-3.5 w-3.5" />
          {offer.is_purchased
            ? t("syllabus.downloadBadgeOwned", {
                defaultValue: "Licencia activa"
              })
            : t("syllabus.downloadBadge", {
                defaultValue: "Descarga completa"
              })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_22rem]">
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(244,247,250,0.94))] shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_42%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_38%)] p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("syllabus.downloadEyebrow", {
                    defaultValue: "Temario completo actual"
                  })}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  {oppositionName}
                </h1>
                <p className="max-w-xl text-sm leading-7 text-slate-600 md:text-base">
                  {t("syllabus.downloadDescription", {
                    defaultValue:
                      "Pago unico para esta oposicion y esta version concreta del temario. Si cambias de oposicion o aparece una nueva version oficial del programa, la licencia es distinta."
                  })}
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-slate-200 bg-white/90 px-5 py-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.48)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {t("syllabus.downloadPriceLabel", {
                    defaultValue: "Precio"
                  })}
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                  {formatPlanPriceFromCents(
                    offer.price_cents,
                    i18n.resolvedLanguage || "es-ES",
                    offer.currency
                  )}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {t("syllabus.downloadPriceHint", {
                    defaultValue: "Pago unico, sin renovaciones."
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
            <div className="space-y-4 rounded-[1.35rem] border border-slate-200 bg-white/90 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("syllabus.downloadWhatIncluded", {
                  defaultValue: "Incluye"
                })}
              </p>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  {t("syllabus.downloadFeatureZip", {
                    defaultValue:
                      "ZIP completo separado por bloques y con PDFs independientes."
                  })}
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  {t("syllabus.downloadFeatureUnlimited", {
                    defaultValue:
                      "Descargas ilimitadas mientras este temario siga siendo el mismo."
                  })}
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  {t("syllabus.downloadFeatureMetadata", {
                    defaultValue:
                      "Archivos sin marca de agua visual, pero con metadatos del titular."
                  })}
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  {t("syllabus.downloadFeatureVersion", {
                    defaultValue:
                      "Valido solo para esta oposicion y esta version del programa."
                  })}
                </li>
              </ul>
            </div>

            <div className="space-y-4 rounded-[1.35rem] border border-slate-200 bg-slate-950 p-5 text-slate-50">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t("syllabus.downloadCurrentPack", {
                  defaultValue: "Paquete actual"
                })}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <FileText className="h-4 w-4 text-sky-300" />
                  {t("syllabus.downloadPdfCount", {
                    defaultValue: "{{count}} PDFs individuales",
                    count: offer.total_pdf_count
                  })}
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <FileArchive className="h-4 w-4 text-sky-300" />
                  {t("syllabus.downloadBlockCount", {
                    defaultValue: "{{count}} bloques en el ZIP",
                    count: offer.block_count
                  })}
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-sky-300" />
                  {t("syllabus.downloadVersionLabel", {
                    defaultValue: "Version {{version}}",
                    version: versionLabel
                  })}
                </div>
                {offer.syllabus_boe_id ? (
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CreditCard className="h-4 w-4 text-sky-300" />
                    <span>{offer.syllabus_boe_id}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                {offer.is_purchased
                  ? t("syllabus.downloadOwnedNote", {
                      defaultValue:
                        "Ya tienes esta licencia activa. Puedes descargar el ZIP completo tantas veces como necesites."
                    })
                  : t("syllabus.downloadVersionRule", {
                      defaultValue:
                        "Si el temario cambia a una nueva convocatoria o a una nueva version oficial, la compra anterior no cubre ese nuevo contenido."
                    })}
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.38)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {offer.is_purchased
                ? t("syllabus.downloadActionReady", {
                    defaultValue: "Descarga disponible"
                  })
                : t("syllabus.downloadActionTitle", {
                    defaultValue: "Activar licencia"
                  })}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {offer.is_purchased
                ? t("syllabus.downloadActionReadyDescription", {
                    defaultValue:
                      "La descarga se genera al momento con tus metadatos de usuario."
                  })
                : t("syllabus.downloadActionDescription", {
                    defaultValue:
                      "Se abrira la pasarela segura para pagar el temario completo de esta oposicion."
                  })}
            </p>

            <CustomButton
              className="mt-5 w-full rounded-full"
              size="lg"
              onClick={
                offer.is_purchased ? handleDownload : handleStartCheckout
              }
              disabled={isStartingCheckout || isDownloading || isFetching}
            >
              {offer.is_purchased ? (
                <>
                  <Download className="h-4 w-4" />
                  {isDownloading
                    ? t("syllabus.downloading", {
                        defaultValue: "Preparando ZIP..."
                      })
                    : t("syllabus.downloadCta", {
                        defaultValue: "Descargar ZIP completo"
                      })}
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  {isStartingCheckout
                    ? t("syllabus.downloadStartingCheckout", {
                        defaultValue: "Abriendo pago..."
                      })
                    : t("syllabus.downloadCheckoutCta", {
                        defaultValue: "Pagar y desbloquear"
                      })}
                </>
              )}
            </CustomButton>

            {!offer.is_purchased && checkoutState === "success" ? (
              <p className="mt-3 text-xs leading-5 text-amber-600">
                {t("syllabus.downloadPendingSync", {
                  defaultValue:
                    "Si acabas de pagar, la licencia puede tardar unos segundos en aparecer activa."
                })}
              </p>
            ) : null}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t("syllabus.downloadRulesTitle", {
                defaultValue: "Reglas de compra"
              })}
            </p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
              <li>
                {t("syllabus.downloadRuleCurrent", {
                  defaultValue:
                    "Esta licencia cubre solo el temario completo actual de la oposicion seleccionada."
                })}
              </li>
              <li>
                {t("syllabus.downloadRuleSwitch", {
                  defaultValue:
                    "Si cambias a otra oposicion, el temario es distinto y requiere otra compra."
                })}
              </li>
              <li>
                {t("syllabus.downloadRuleUpdate", {
                  defaultValue:
                    "Si aparece una nueva version oficial del mismo proceso, tambien se considera un temario distinto."
                })}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default ProfileSyllabusDownload;
