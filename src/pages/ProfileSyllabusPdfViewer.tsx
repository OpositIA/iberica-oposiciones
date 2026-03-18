import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import CustomButton from "@/components/ui/custom-button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getWatermarkedSyllabusPdfBytes } from "@/queries/profileQueries";
import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Minus,
  Plus,
  Search
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const THUMBNAIL_WIDTH = 120;
const VIEWER_WATERMARK_BLOCKS = [
  { left: "8%", top: "10%" },
  { right: "8%", top: "24%" },
  { left: "15%", top: "52%" },
  { right: "10%", bottom: "12%" }
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const extractPageText = async (pdf: PDFDocumentProxy, pageNumber: number) => {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();

  return textContent.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
};

const ProfileSyllabusPdfViewer = () => {
  const { t } = useTranslation(["profile"]);
  const { user } = useAuth();
  const params = useParams<{ subtopicFileId: string }>();
  const [searchParams] = useSearchParams();
  const normalizedSubtopicFileId = Number.parseInt(
    String(params.subtopicFileId ?? "").trim(),
    10
  );
  const topicTitle = searchParams.get("topicTitle")?.trim() || "";
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerScrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [isIndexingText, setIsIndexingText] = useState(false);
  const [isVisualComfortEnabled, setIsVisualComfortEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const searchIndexTaskRef = useRef(0);

  const {
    data: pdfBytes,
    isLoading: isLoadingPdfBytes,
    isFetching,
    refetch,
    error: pdfBytesError
  } = useQuery({
    queryKey: ["syllabus", "pdf-viewer", normalizedSubtopicFileId],
    queryFn: () => getWatermarkedSyllabusPdfBytes(normalizedSubtopicFileId),
    enabled: Number.isFinite(normalizedSubtopicFileId) && normalizedSubtopicFileId > 0,
    staleTime: 4 * 60 * 1000
  });

  const thumbnailPages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );
  const searchMatches = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
    if (!normalizedSearch) return [];

    return thumbnailPages.filter((pageNumber) =>
      pageTexts[pageNumber]?.includes(normalizedSearch)
    );
  }, [pageTexts, searchTerm, thumbnailPages]);
  const searchMatchesSet = useMemo(
    () => new Set(searchMatches),
    [searchMatches]
  );
  const thumbnailPdfFile = useMemo(() => {
    if (!pdfBytes) return null;
    return { data: new Uint8Array(pdfBytes) };
  }, [pdfBytes]);
  const mainPdfFile = useMemo(() => {
    if (!pdfBytes) return null;
    return { data: new Uint8Array(pdfBytes) };
  }, [pdfBytes]);

  const mainPageWidth = useMemo(() => {
    const baseWidth = viewerWidth > 0 ? Math.min(Math.max(viewerWidth - 64, 280), 940) : 760;
    return Math.round(baseWidth * zoom);
  }, [viewerWidth, zoom]);
  const viewerWatermarkLabel = useMemo(() => {
    const email = user?.email?.trim();
    if (email) return email;

    const shortUserId = user?.id?.trim().slice(0, 8);
    return shortUserId ? `ID ${shortUserId}` : "Uso personal";
  }, [user?.email, user?.id]);

  useEffect(() => {
    if (!viewerContainerRef.current) return;

    const node = viewerContainerRef.current;
    const updateWidth = () => setViewerWidth(node.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const blockedKeys = new Set(["c", "s", "p"]);

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleCopyLikeAction = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const handleDragStart = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleSelectStart = (event: Event) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!blockedKeys.has(event.key.toLowerCase())) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopyLikeAction);
    document.addEventListener("cut", handleCopyLikeAction);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("selectstart", handleSelectStart);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopyLikeAction);
      document.removeEventListener("cut", handleCopyLikeAction);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("selectstart", handleSelectStart);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    setDocumentError(null);
    setPageCount(0);
    setCurrentPage(1);
    setPageInput("1");
    setSearchInput("");
    setSearchTerm("");
    setPageTexts({});
    setActiveSearchMatchIndex(0);
    setIsIndexingText(false);
    setZoom(1);
    searchIndexTaskRef.current += 1;
  }, [pdfBytes]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      setActiveSearchMatchIndex(0);
      return;
    }

    setActiveSearchMatchIndex((previousIndex) =>
      clamp(previousIndex, 0, searchMatches.length - 1)
    );
  }, [searchMatches]);

  useEffect(() => {
    if (!searchTerm || searchMatches.length === 0) return;
    scrollToPage(searchMatches[activeSearchMatchIndex]);
  }, [activeSearchMatchIndex, searchMatches, searchTerm]);

  useEffect(() => {
    const container = viewerScrollRef.current;
    if (!container || pageCount <= 0) return;

    let frameId = 0;
    const syncPageFromScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;
      let closestPage = currentPage;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((node, pageNumber) => {
        const rect = node.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - containerCenter);

        if (distance >= closestDistance) return;
        closestDistance = distance;
        closestPage = pageNumber;
      });

      setCurrentPage((previousPage) =>
        previousPage === closestPage ? previousPage : closestPage
      );
    };

    const onScroll = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncPageFromScroll);
    };

    syncPageFromScroll();
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      container.removeEventListener("scroll", onScroll);
    };
  }, [currentPage, pageCount]);

  const scrollToPage = (pageNumber: number) => {
    const nextPage = clamp(pageNumber, 1, pageCount || 1);
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));

    const node = pageRefs.current.get(nextPage);
    const container = viewerScrollRef.current;
    if (!node || !container) return;

    const nextTop = Math.max(0, node.offsetTop - 24);
    container.scrollTo({
      top: nextTop,
      behavior: "smooth"
    });
  };

  const commitPageInput = () => {
    if (!pageCount) {
      setPageInput("1");
      return;
    }

    const parsedPage = Number.parseInt(pageInput.trim(), 10);
    const nextPage = Number.isFinite(parsedPage)
      ? clamp(parsedPage, 1, pageCount)
      : currentPage;

    scrollToPage(nextPage);
  };

  const commitSearchInput = () => {
    const normalizedSearch = searchInput.trim();
    setSearchTerm(normalizedSearch);
    setActiveSearchMatchIndex(0);
  };

  const goToSearchMatch = (nextIndex: number) => {
    if (searchMatches.length === 0) return;

    const normalizedIndex =
      ((nextIndex % searchMatches.length) + searchMatches.length) %
      searchMatches.length;

    setActiveSearchMatchIndex(normalizedIndex);
    scrollToPage(searchMatches[normalizedIndex]);
  };

  const handleDocumentLoad = (pdf: PDFDocumentProxy) => {
    setDocumentError(null);
    setPageCount(pdf.numPages);
    setCurrentPage((previousPage) => clamp(previousPage, 1, pdf.numPages));

    const taskId = searchIndexTaskRef.current + 1;
    searchIndexTaskRef.current = taskId;
    setIsIndexingText(true);

    void Promise.all(
      Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(
        async (pageNumber) => [pageNumber, await extractPageText(pdf, pageNumber)] as const
      )
    )
      .then((entries) => {
        if (searchIndexTaskRef.current !== taskId) return;
        setPageTexts(Object.fromEntries(entries));
      })
      .catch(() => {
        if (searchIndexTaskRef.current !== taskId) return;
        setPageTexts({});
      })
      .finally(() => {
        if (searchIndexTaskRef.current !== taskId) return;
        setIsIndexingText(false);
      });
  };

  const handleDocumentLoadError = (loadError: Error) => {
    setDocumentError(loadError.message || "No se ha podido cargar el PDF.");
  };

  if (!Number.isFinite(normalizedSubtopicFileId) || normalizedSubtopicFileId <= 0) {
    return (
      <section className="space-y-4">
        <div className="border border-border bg-background p-6">
          <p className="text-sm text-muted-foreground">
            {t("syllabus.viewerInvalidPdf", {
              defaultValue: "No se ha identificado un PDF valido del temario."
            })}
          </p>
          <CustomButton asChild className="mt-4">
            <Link to="/perfil/temario">
              {t("syllabus.viewerBack", {
                defaultValue: "Volver al temario"
              })}
            </Link>
          </CustomButton>
        </div>
      </section>
    );
  }

  if (isLoadingPdfBytes) {
    return (
      <AppLoading
        label={t("syllabus.viewerDocumentLoading", {
          defaultValue: "Preparando paginas del PDF..."
        })}
      />
    );
  }

  if (pdfBytesError || !thumbnailPdfFile || !mainPdfFile) {
    const message =
      pdfBytesError instanceof Error && pdfBytesError.message.trim().length > 0
        ? pdfBytesError.message
        : t("syllabus.viewerLoadFailedDescription", {
            defaultValue: "No se ha podido cargar el PDF."
          });

    return (
      <section className="space-y-4">
        <div className="border border-border bg-background p-6">
          <p className="text-sm font-semibold text-foreground">
            {t("syllabus.viewerLoadFailedTitle", {
              defaultValue: "No se pudo cargar el visor"
            })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <CustomButton
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {t("syllabus.viewerRetry", {
                defaultValue: "Reintentar"
              })}
            </CustomButton>
            <CustomButton asChild styleType="ghost">
              <Link to="/perfil/temario">
                {t("syllabus.viewerBack", {
                  defaultValue: "Volver al temario"
                })}
              </Link>
            </CustomButton>
          </div>
        </div>
      </section>
    );
  }

  const shellToneClass = isVisualComfortEnabled
    ? "border-stone-300 bg-[linear-gradient(180deg,#efe8dc_0%,#e4dacb_100%)]"
    : "border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]";
  const headerToneClass = isVisualComfortEnabled
    ? "border-stone-300 bg-[#f4ede1]/95"
    : "border-slate-200 bg-white/90";
  const bodyToneClass = isVisualComfortEnabled
    ? "bg-[linear-gradient(180deg,#ebe2d4_0%,#ddd1c0_100%)]"
    : "bg-[linear-gradient(180deg,#edf1f6_0%,#e2e8f0_100%)]";
  const sidebarToneClass = isVisualComfortEnabled
    ? "border-stone-300 bg-[linear-gradient(180deg,#e6dccd_0%,#dacdbb_100%)]"
    : "border-slate-200 bg-[linear-gradient(180deg,#e2e8f0_0%,#dbe4ee_100%)]";
  const pageFrameToneClass = isVisualComfortEnabled
    ? "border-stone-300 bg-transparent shadow-[0_30px_80px_-50px_rgba(120,92,49,0.38)]"
    : "border-slate-300 bg-transparent shadow-[0_30px_80px_-50px_rgba(15,23,42,0.42)]";
  const pdfPageFilterStyle = isVisualComfortEnabled
    ? { filter: "sepia(0.18) saturate(0.86) brightness(0.95) contrast(0.92)" }
    : undefined;

  return (
    <section
      className={`select-none overflow-hidden rounded-[1.5rem] border shadow-[0_32px_90px_-52px_rgba(15,23,42,0.45)] ${shellToneClass}`}
    >
      <header className={`border-b px-2 py-2 backdrop-blur md:px-3 ${headerToneClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/perfil/temario"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all duration-200 hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0"
              aria-label={t("syllabus.viewerBack", {
                defaultValue: "Volver al temario"
              })}
            >
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <div className="hidden h-5 w-px bg-slate-200 md:block" />
            <div className="hidden min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 md:flex">
              <FileText className="h-4 w-4" />
              <span className="max-w-[20rem] truncate lg:max-w-[28rem] xl:max-w-[36rem]">
                {topicTitle || t("syllabus.viewerBadge", { defaultValue: "Visor PDF" })}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <CustomButton
              type="button"
              size="sm"
              styleType={isVisualComfortEnabled ? "primary" : "ghost"}
              className="rounded-full px-3"
              onClick={() => setIsVisualComfortEnabled((value) => !value)}
            >
              <Eye className="h-4 w-4" />
              {t("syllabus.viewerVisualComfort", {
                defaultValue: "Fatiga visual"
              })}
            </CustomButton>

            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onBlur={commitSearchInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitSearchInput();
                      return;
                    }

                    if (event.key !== "F3") return;
                    event.preventDefault();
                    goToSearchMatch(activeSearchMatchIndex + 1);
                  }}
                  placeholder={t("syllabus.viewerSearchPlaceholder", {
                    defaultValue: "Buscar en el PDF"
                  })}
                  className="h-7 w-32 border-0 bg-transparent px-0 py-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 md:w-40"
                  aria-label={t("syllabus.viewerSearchLabel", {
                    defaultValue: "Buscar en el PDF"
                  })}
                />
                <span className="min-w-16 text-right text-xs font-medium tabular-nums text-slate-500">
                  {isIndexingText
                    ? t("syllabus.viewerSearchIndexing", {
                        defaultValue: "Indexando"
                      })
                    : searchTerm
                      ? `${searchMatches.length === 0 ? 0 : activeSearchMatchIndex + 1}/${searchMatches.length}`
                      : ""}
                </span>
              </div>
              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => goToSearchMatch(activeSearchMatchIndex - 1)}
                disabled={searchMatches.length === 0}
                aria-label={t("syllabus.viewerSearchPrevious", {
                  defaultValue: "Resultado anterior"
                })}
              >
                <ChevronLeft className="h-4 w-4" />
              </CustomButton>
              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => goToSearchMatch(activeSearchMatchIndex + 1)}
                disabled={searchMatches.length === 0}
                aria-label={t("syllabus.viewerSearchNext", {
                  defaultValue: "Resultado siguiente"
                })}
              >
                <ChevronRight className="h-4 w-4" />
              </CustomButton>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label={t("syllabus.viewerPreviousPage", {
                  defaultValue: "Pagina anterior"
                })}
              >
                <ChevronLeft className="h-4 w-4" />
              </CustomButton>

              <div className="flex items-center gap-2 rounded-full bg-white px-2 py-1 shadow-sm">
                <Input
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={commitPageInput}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitPageInput();
                  }}
                  inputMode="numeric"
                  className="h-7 w-16 rounded-md border border-slate-200 bg-slate-50 px-1 py-0 text-center text-sm font-semibold text-slate-900 shadow-sm focus-visible:ring-1 focus-visible:ring-slate-300 focus-visible:ring-offset-0"
                  aria-label={t("syllabus.viewerPageInput", {
                    defaultValue: "Numero de pagina"
                  })}
                />
                <span className="text-sm font-medium text-slate-500">
                  / {pageCount || "--"}
                </span>
              </div>

              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={!pageCount || currentPage >= pageCount}
                aria-label={t("syllabus.viewerNextPage", {
                  defaultValue: "Pagina siguiente"
                })}
              >
                <ChevronRight className="h-4 w-4" />
              </CustomButton>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => setZoom((value) => clamp(Number((value - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
                disabled={zoom <= MIN_ZOOM}
                aria-label={t("syllabus.viewerZoomOut", {
                  defaultValue: "Alejar"
                })}
              >
                <Minus className="h-4 w-4" />
              </CustomButton>
              <span className="min-w-16 text-center text-sm font-semibold tabular-nums text-slate-700">
                {Math.round(zoom * 100)}%
              </span>
              <CustomButton
                size="iconSm"
                styleType="unstyled"
                className="rounded-full text-slate-600 hover:bg-white"
                onClick={() => setZoom((value) => clamp(Number((value + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
                disabled={zoom >= MAX_ZOOM}
                aria-label={t("syllabus.viewerZoomIn", {
                  defaultValue: "Acercar"
                })}
              >
                <Plus className="h-4 w-4" />
              </CustomButton>
            </div>
          </div>
        </div>
      </header>

      <div className={`grid min-h-[78vh] grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)] ${bodyToneClass}`}>
        <aside className={`border-b md:border-b-0 md:border-r ${sidebarToneClass}`}>
          <ScrollArea className="h-[12rem] md:h-[78vh]">
            <div className="flex gap-3 p-3 md:flex md:flex-col md:gap-2 md:p-4">
              <Document
                file={thumbnailPdfFile}
                loading={null}
                onLoadSuccess={handleDocumentLoad}
                onLoadError={handleDocumentLoadError}
                error={null}
                className="contents"
              >
                {thumbnailPages.map((pageNumber) => {
                  const isActive = currentPage === pageNumber;

                  return (
                    <button
                      key={`thumb-${pageNumber}`}
                      type="button"
                      onClick={() => scrollToPage(pageNumber)}
                      className={[
                        "group inline-flex w-fit flex-col items-center overflow-hidden rounded-[1.15rem] border p-2 text-left transition-all",
                        isActive
                          ? "border-slate-900 bg-white shadow-[0_24px_40px_-28px_rgba(15,23,42,0.75)]"
                          : searchMatchesSet.has(pageNumber)
                            ? "border-amber-400 bg-amber-50/80 shadow-[0_18px_36px_-30px_rgba(217,119,6,0.55)]"
                          : "border-slate-300/90 bg-white/70 hover:border-slate-400 hover:bg-white"
                      ].join(" ")}
                      aria-label={t("syllabus.viewerGoToPage", {
                        defaultValue: "Ir a la pagina {{page}}",
                        page: pageNumber
                      })}
                    >
                      <div
                        className="inline-block overflow-hidden rounded-[0.5rem] border border-slate-200 bg-transparent leading-none shadow-inner"
                        style={pdfPageFilterStyle}
                      >
                        <Page
                          pageNumber={pageNumber}
                          width={THUMBNAIL_WIDTH}
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                          className="leading-none"
                          loading={<div className="h-[10.5rem] bg-slate-100" />}
                        />
                      </div>

                      <div className="mt-3 flex justify-center">
                        {isActive ? (
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-black px-2 text-xs font-semibold text-white">
                            {pageNumber}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">
                            {pageNumber}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </Document>
            </div>
          </ScrollArea>
        </aside>

        <div ref={viewerContainerRef} className="min-w-0">
          <div
            ref={viewerScrollRef}
            className="h-[calc(78vh-1px)] overflow-y-auto"
          >
            <div className="flex min-h-full items-start justify-center p-4 md:p-8">
              <Document
                file={mainPdfFile}
                loading={
                  <AppLoading
                    label={t("syllabus.viewerDocumentLoading", {
                      defaultValue: "Preparando paginas del PDF..."
                    })}
                  />
                }
                onLoadSuccess={handleDocumentLoad}
                onLoadError={handleDocumentLoadError}
                error={null}
              >
                {documentError ? (
                  <div className="max-w-xl rounded-[1.25rem] border border-destructive/20 bg-background p-6 shadow-sm">
                    <p className="text-sm font-semibold text-foreground">
                      {t("syllabus.viewerLoadFailedTitle", {
                        defaultValue: "No se pudo cargar el visor"
                      })}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{documentError}</p>
                  </div>
                ) : (
                  <div className="flex w-full max-w-full flex-col items-center gap-6">
                    {thumbnailPages.map((pageNumber) => (
                      <div
                        key={`page-${pageNumber}`}
                        ref={(node) => {
                          if (node) {
                            pageRefs.current.set(pageNumber, node);
                            return;
                          }

                          pageRefs.current.delete(pageNumber);
                        }}
                        className={`relative inline-block overflow-hidden rounded-[0.75rem] border leading-none ${pageFrameToneClass}`}
                        data-page-number={pageNumber}
                      >
                        <div style={pdfPageFilterStyle} draggable={false}>
                          <Page
                            pageNumber={pageNumber}
                            width={mainPageWidth}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                            className="leading-none"
                            loading={<div className="h-[60vh] w-[42rem] max-w-full bg-slate-50" />}
                          />
                        </div>
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 overflow-hidden"
                        >
                          {VIEWER_WATERMARK_BLOCKS.map((position, index) => (
                            <div
                              key={`viewer-watermark-${pageNumber}-${index}`}
                              className="absolute flex w-[30%] min-w-[10rem] max-w-[16rem] rotate-[-24deg] flex-col items-center opacity-45"
                              style={position}
                            >
                              <img
                                src={opositaiHorizontalLogo}
                                alt=""
                                draggable={false}
                                className="w-full object-contain opacity-[0.50]"
                              />
                              <span className="mt-2 rounded-full bg-white/35 px-3 py-1 text-center text-[10px] font-semibold tracking-[0.14em] text-slate-600 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                                {viewerWatermarkLabel}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Document>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileSyllabusPdfViewer;
