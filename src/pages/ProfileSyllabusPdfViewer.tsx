import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import BrandLogo from "@/components/BrandLogo";
import PlanUpgradeDialog from "@/components/PlanUpgradeDialog";
import CustomButton from "@/components/ui/custom-button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getWatermarkedSyllabusPdfBytes,
  useCurrentSyllabusDownloadOfferQuery
} from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Lock,
  Minus,
  Plus,
  Search
} from "lucide-react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./profile-syllabus-pdf-viewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.3;
const ZOOM_STEP = 0.2;
const THUMBNAIL_WIDTH = 120;
const FREE_PREVIEW_PAGE_LIMIT = 1;
const PDF_DOCUMENT_OPTIONS = {
  standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`
};
const VIEWER_WATERMARK_BLOCKS = [
  { left: "8%", top: "10%" },
  { right: "8%", top: "24%" },
  { left: "15%", top: "52%" },
  { right: "10%", bottom: "12%" }
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type LoadedPdfDocument = Parameters<
  NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
>[0];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const extractPageText = async (pdf: LoadedPdfDocument, pageNumber: number) => {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();

  return textContent.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
};

const countTextMatches = (value: string, search: string) => {
  if (!value || !search) return 0;

  const normalizedValue = value.toLocaleLowerCase();
  let startIndex = 0;
  let matchCount = 0;

  while (startIndex < normalizedValue.length) {
    const nextIndex = normalizedValue.indexOf(search, startIndex);
    if (nextIndex === -1) break;

    matchCount += 1;
    startIndex = nextIndex + search.length;
  }

  return matchCount;
};

const ProfileSyllabusPdfViewer = () => {
  const { t } = useTranslation(["profile"]);
  const { user } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const params = useParams<{ subtopicFileId: string }>();
  const [searchParams] = useSearchParams();
  const normalizedSubtopicFileId = Number.parseInt(
    String(params.subtopicFileId ?? "").trim(),
    10
  );
  const topicTitle = searchParams.get("topicTitle")?.trim() || "";
  const syllabusDownloadHref = useMemo(() => {
    const nextParams = new URLSearchParams();
    if (topicTitle) nextParams.set("topicTitle", topicTitle);
    const query = nextParams.toString();
    return `/perfil/temario/descarga/${normalizedSubtopicFileId}${query ? `?${query}` : ""}`;
  }, [normalizedSubtopicFileId, topicTitle]);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbnailScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailRefs = useRef(new Map<number, HTMLButtonElement>());
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
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
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const searchIndexTaskRef = useRef(0);
  const currentPageRef = useRef(1);
  const isProgrammaticScrollRef = useRef(false);
  const targetPageRef = useRef<number | null>(null);
  const targetScrollTopRef = useRef<number | null>(null);
  const scrollReleaseTimeoutRef = useRef<number | null>(null);

  const {
    data: pdfPayload,
    isLoading: isLoadingPdfBytes,
    isFetching,
    refetch,
    error: pdfBytesError
  } = useQuery({
    queryKey: [
      "syllabus",
      "pdf-viewer",
      normalizedSubtopicFileId,
      user?.id ?? "guest"
    ],
    queryFn: () => getWatermarkedSyllabusPdfBytes(normalizedSubtopicFileId),
    enabled:
      Number.isFinite(normalizedSubtopicFileId) && normalizedSubtopicFileId > 0,
    staleTime: 4 * 60 * 1000
  });
  const { data: syllabusDownloadOffer } = useCurrentSyllabusDownloadOfferQuery(
    normalizedSubtopicFileId
  );

  const thumbnailPages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );
  const searchResults = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
    if (!normalizedSearch) {
      return [] as Array<{
        pageNumber: number;
        matchIndexOnPage: number;
      }>;
    }

    return thumbnailPages.flatMap((pageNumber) => {
      const matchCount = countTextMatches(
        pageTexts[pageNumber] ?? "",
        normalizedSearch
      );

      return Array.from({ length: matchCount }, (_, matchIndexOnPage) => ({
        pageNumber,
        matchIndexOnPage
      }));
    });
  }, [pageTexts, searchTerm, thumbnailPages]);
  const searchMatchesSet = useMemo(
    () => new Set(searchResults.map(({ pageNumber }) => pageNumber)),
    [searchResults]
  );
  const pageSearchOffsets = useMemo(() => {
    const offsets = new Map<number, number>();

    searchResults.forEach(({ pageNumber }, resultIndex) => {
      if (!offsets.has(pageNumber)) offsets.set(pageNumber, resultIndex);
    });

    return offsets;
  }, [searchResults]);
  const highlightSearchTerm = searchTerm.trim();
  const searchHighlightRegex = useMemo(() => {
    if (!highlightSearchTerm) return null;
    return new RegExp(`(${escapeRegExp(highlightSearchTerm)})`, "gi");
  }, [highlightSearchTerm]);
  const isPreviewOnly = Boolean(pdfPayload?.isPreviewOnly);
  const thumbnailPdfFile = useMemo(() => {
    if (!pdfPayload?.pdfBytes) return null;
    return { data: new Uint8Array(pdfPayload.pdfBytes) };
  }, [pdfPayload]);
  const mainPdfFile = useMemo(() => {
    if (!pdfPayload?.pdfBytes) return null;
    return { data: new Uint8Array(pdfPayload.pdfBytes) };
  }, [pdfPayload]);

  const mainPageWidth = useMemo(() => {
    const horizontalPadding = viewerWidth < 640 ? 24 : 64;
    const baseWidth =
      viewerWidth > 0
        ? Math.min(Math.max(viewerWidth - horizontalPadding, 220), 940)
        : 760;
    return Math.round(baseWidth * zoom);
  }, [viewerWidth, zoom]);
  const viewerWatermarkLabel = useMemo(() => {
    const email = user?.email?.trim();
    if (email) return email;

    const shortUserId = user?.id?.trim().slice(0, 8);
    return shortUserId ? `ID ${shortUserId}` : "Uso personal";
  }, [user?.email, user?.id]);
  const maxPreviewPage = isPreviewOnly
    ? FREE_PREVIEW_PAGE_LIMIT
    : pageCount || 1;
  const isPageLocked = useCallback(
    (pageNumber: number) => pageNumber > maxPreviewPage,
    [maxPreviewPage]
  );
  const renderSearchHighlight = (
    pageNumber: number,
    textItem: { str?: string },
    getNextMatchIndex: () => number
  ) => {
    const value = typeof textItem?.str === "string" ? textItem.str : "";
    const safeValue = escapeHtml(value);
    if (
      !safeValue ||
      !searchHighlightRegex ||
      !searchMatchesSet.has(pageNumber)
    )
      return safeValue;

    return safeValue.replace(searchHighlightRegex, (match) => {
      const matchIndex = getNextMatchIndex();
      const activeClass =
        matchIndex === activeSearchMatchIndex ? " is-active" : "";

      return `<mark class="pdf-search-highlight${activeClass}" data-search-match-index="${matchIndex}" data-search-page="${pageNumber}">${match}</mark>`;
    });
  };

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
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const activeThumbnail = thumbnailRefs.current.get(currentPage);
    const scrollAreaRoot = thumbnailScrollAreaRef.current;
    const viewport = scrollAreaRoot?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (!activeThumbnail || !viewport) return;

    const thumbnailTop = activeThumbnail.offsetTop;
    const thumbnailBottom = thumbnailTop + activeThumbnail.offsetHeight;
    const viewportTop = viewport.scrollTop;
    const viewportBottom = viewportTop + viewport.clientHeight;

    if (thumbnailTop >= viewportTop && thumbnailBottom <= viewportBottom)
      return;

    activeThumbnail.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });
  }, [currentPage]);

  useEffect(() => {
    setDocumentError(null);
    setPageCount(0);
    setRenderedPageCount(0);
    setCurrentPage(1);
    setPageInput("1");
    setSearchInput("");
    setSearchTerm("");
    setPageTexts({});
    setActiveSearchMatchIndex(0);
    setIsIndexingText(false);
    setZoom(1);
    setIsUpgradeDialogOpen(false);
    pageRefs.current.clear();
    searchIndexTaskRef.current += 1;
  }, [pdfPayload]);

  useEffect(() => {
    if (searchResults.length === 0) {
      setActiveSearchMatchIndex(0);
      return;
    }

    setActiveSearchMatchIndex((previousIndex) =>
      clamp(previousIndex, 0, searchResults.length - 1)
    );
  }, [searchResults]);

  const releaseProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = false;
    targetPageRef.current = null;
    targetScrollTopRef.current = null;
    if (scrollReleaseTimeoutRef.current) {
      window.clearTimeout(scrollReleaseTimeoutRef.current);
      scrollReleaseTimeoutRef.current = null;
    }
  }, []);

  const scrollViewerTo = useCallback(
    (
      scrollTop: number,
      pageNumber: number,
      behavior: ScrollBehavior = "smooth"
    ) => {
      const container = viewerScrollRef.current;
      if (!container) return;

      const maxScrollTop = Math.max(
        0,
        container.scrollHeight - container.clientHeight
      );
      const nextTop = clamp(scrollTop, 0, maxScrollTop);

      isProgrammaticScrollRef.current = behavior === "smooth";
      targetPageRef.current = pageNumber;
      targetScrollTopRef.current = nextTop;

      if (scrollReleaseTimeoutRef.current) {
        window.clearTimeout(scrollReleaseTimeoutRef.current);
        scrollReleaseTimeoutRef.current = null;
      }

      if (behavior === "smooth") {
        scrollReleaseTimeoutRef.current = window.setTimeout(() => {
          releaseProgrammaticScroll();
        }, 500);
      } else releaseProgrammaticScroll();

      container.scrollTo({
        top: nextTop,
        behavior
      });
    },
    [releaseProgrammaticScroll]
  );

  const scrollToResolvedPage = useCallback(
    (pageNumber: number, behavior: ScrollBehavior = "smooth") => {
      const node = pageRefs.current.get(pageNumber);
      if (!node) return;

      const nextTop = Math.max(0, node.offsetTop - 24);
      scrollViewerTo(nextTop, pageNumber, behavior);
    },
    [scrollViewerTo]
  );

  const scrollToFirstPage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      setCurrentPage(1);
      setPageInput("1");
      scrollToResolvedPage(1, behavior);
    },
    [scrollToResolvedPage]
  );

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const resolvedPage = clamp(pageNumber, 1, pageCount || 1);
      if (isPageLocked(resolvedPage)) {
        setIsUpgradeDialogOpen(true);
        scrollToFirstPage();
        return;
      }

      setCurrentPage(resolvedPage);
      setPageInput(String(resolvedPage));
      scrollToResolvedPage(resolvedPage, "smooth");
    },
    [isPageLocked, pageCount, scrollToFirstPage, scrollToResolvedPage]
  );

  useEffect(() => {
    if (!searchTerm || searchResults.length === 0) return;

    const activeResult = searchResults[activeSearchMatchIndex];
    if (!activeResult) return;

    setCurrentPage(activeResult.pageNumber);
    setPageInput(String(activeResult.pageNumber));

    let attemptCount = 0;
    let frameId = 0;
    let retryTimeoutId: number | null = null;

    const scrollToActiveMatch = () => {
      const container = viewerScrollRef.current;
      if (!container) return true;

      const activeMatchNode = container.querySelector<HTMLElement>(
        `[data-search-match-index="${activeSearchMatchIndex}"]`
      );

      if (!activeMatchNode) {
        attemptCount += 1;
        if (attemptCount > 18) {
          scrollToResolvedPage(activeResult.pageNumber, "auto");
          return true;
        }

        retryTimeoutId = window.setTimeout(() => {
          frameId = window.requestAnimationFrame(scrollToActiveMatch);
        }, 60);

        return false;
      }

      const containerRect = container.getBoundingClientRect();
      const matchRect = activeMatchNode.getBoundingClientRect();
      const nextTop =
        container.scrollTop +
        (matchRect.top - containerRect.top) -
        container.clientHeight / 2 +
        matchRect.height / 2;

      scrollViewerTo(nextTop, activeResult.pageNumber, "smooth");
      return true;
    };

    frameId = window.requestAnimationFrame(scrollToActiveMatch);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (retryTimeoutId) window.clearTimeout(retryTimeoutId);
    };
  }, [
    activeSearchMatchIndex,
    scrollToResolvedPage,
    scrollViewerTo,
    searchResults,
    searchTerm
  ]);

  useEffect(() => {
    setSearchTerm(searchInput.trim());
    setActiveSearchMatchIndex(0);
  }, [searchInput]);

  useEffect(() => {
    const container = viewerScrollRef.current;
    if (!container || pageCount <= 0) return;

    let frameId = 0;
    const syncPageFromScroll = () => {
      if (isProgrammaticScrollRef.current) {
        const targetScrollTop = targetScrollTopRef.current;
        const targetPage = targetPageRef.current;

        if (
          targetScrollTop !== null &&
          targetPage !== null &&
          Math.abs(container.scrollTop - targetScrollTop) <= 8
        ) {
          releaseProgrammaticScroll();
          setCurrentPage(targetPage);
        }

        return;
      }

      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;
      let closestPage = currentPageRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((node, pageNumber) => {
        const rect = node.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - containerCenter);

        if (distance >= closestDistance) return;
        closestDistance = distance;
        closestPage = pageNumber;
      });

      if (isPageLocked(closestPage)) {
        setIsUpgradeDialogOpen(true);
        scrollToFirstPage("smooth");
        return;
      }

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
      releaseProgrammaticScroll();
      container.removeEventListener("scroll", onScroll);
    };
  }, [isPageLocked, pageCount, releaseProgrammaticScroll, scrollToFirstPage]);

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

  const goToSearchMatch = (nextIndex: number) => {
    if (searchResults.length === 0) return;

    const normalizedIndex =
      ((nextIndex % searchResults.length) + searchResults.length) %
      searchResults.length;

    setActiveSearchMatchIndex(normalizedIndex);
  };

  const handleDocumentLoad = (pdf: LoadedPdfDocument) => {
    setDocumentError(null);
    const totalPages = Math.max(pdf.numPages, pdfPayload?.totalPages ?? 0);
    setRenderedPageCount(pdf.numPages);
    setPageCount(totalPages);
    setCurrentPage((previousPage) => clamp(previousPage, 1, totalPages));

    const taskId = searchIndexTaskRef.current + 1;
    searchIndexTaskRef.current = taskId;
    setIsIndexingText(true);

    void Promise.all(
      Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(
        async (pageNumber) =>
          [pageNumber, await extractPageText(pdf, pageNumber)] as const
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

  if (
    !Number.isFinite(normalizedSubtopicFileId) ||
    normalizedSubtopicFileId <= 0
  ) {
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
    <>
      <section
        className={`flex h-full min-h-0 flex-col select-none overflow-hidden ${shellToneClass}`}
      >
        <header
          className={`border-b px-2 py-2 backdrop-blur md:px-3 ${headerToneClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 md:flex-nowrap md:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                to="/perfil/temario"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all duration-200 hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0"
                aria-label={t("syllabus.viewerBack", {
                  defaultValue: "Volver al temario"
                })}
              >
                <ArrowLeft className="h-6 w-6" />
              </Link>
              <div className="h-5 w-px bg-slate-200" />
              <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:tracking-[0.22em]">
                <FileText className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">
                  {topicTitle ||
                    t("syllabus.viewerBadge", { defaultValue: "Visor PDF" })}
                </span>
              </div>
              <div className="flex items-center gap-1 md:hidden">
                <CustomButton
                  asChild
                  size="sm"
                  styleType="unstyled"
                  className="h-10 w-10 rounded-full p-0 text-slate-600 hover:bg-white"
                >
                  <Link to={syllabusDownloadHref}>
                    <Download className="h-4 w-4" />
                    <span className="sr-only">
                      {syllabusDownloadOffer?.is_purchased
                        ? t("syllabus.viewerDownloadOwned", {
                            defaultValue: "Descarga activa"
                          })
                        : t("syllabus.viewerDownload", {
                            defaultValue: "Descarga"
                          })}
                    </span>
                  </Link>
                </CustomButton>

                <CustomButton
                  type="button"
                  size="sm"
                  styleType="unstyled"
                  className="h-10 w-10 rounded-full p-0 text-slate-600 hover:bg-white"
                  onClick={() => setIsVisualComfortEnabled((value) => !value)}
                >
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">
                    {t("syllabus.viewerVisualComfort", {
                      defaultValue: "Fatiga visual"
                    })}
                  </span>
                </CustomButton>
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 md:w-auto md:min-w-fit md:flex-none md:flex-nowrap">
              <CustomButton
                asChild
                size="sm"
                styleType={
                  syllabusDownloadOffer?.is_purchased ? "primary" : "ghost"
                }
                className="hidden rounded-full px-3 md:inline-flex"
              >
                <Link to={syllabusDownloadHref}>
                  <Download className="h-4 w-4" />
                  {syllabusDownloadOffer?.is_purchased
                    ? t("syllabus.viewerDownloadOwned", {
                        defaultValue: "Descarga activa"
                      })
                    : t("syllabus.viewerDownload", {
                        defaultValue: "Descarga"
                      })}
                </Link>
              </CustomButton>

              <CustomButton
                type="button"
                size="sm"
                styleType={isVisualComfortEnabled ? "primary" : "ghost"}
                className="hidden rounded-full px-3 md:inline-flex"
                onClick={() => setIsVisualComfortEnabled((value) => !value)}
              >
                <Eye className="h-4 w-4" />
                {t("syllabus.viewerVisualComfort", {
                  defaultValue: "Fatiga visual"
                })}
              </CustomButton>

              <div className="order-last flex w-full min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 md:order-none md:w-auto md:min-w-[18rem] lg:min-w-[20rem]">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm md:min-w-[14rem] md:flex-1">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "F3") return;
                      event.preventDefault();
                      goToSearchMatch(activeSearchMatchIndex + 1);
                    }}
                    placeholder={t("syllabus.viewerSearchPlaceholder", {
                      defaultValue: "Buscar en el PDF"
                    })}
                    className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    aria-label={t("syllabus.viewerSearchLabel", {
                      defaultValue: "Buscar en el PDF"
                    })}
                  />
                  <span className="min-w-min shrink-0 text-right text-xs font-medium tabular-nums text-slate-500 sm:min-w-min">
                    {isIndexingText
                      ? t("syllabus.viewerSearchIndexing", {
                          defaultValue: "Indexando"
                        })
                      : searchTerm
                        ? `${searchResults.length === 0 ? 0 : activeSearchMatchIndex + 1}/${searchResults.length}`
                        : ""}
                  </span>
                </div>
                <CustomButton
                  size="iconSm"
                  styleType="unstyled"
                  className="rounded-full text-slate-600 hover:bg-white"
                  onClick={() => goToSearchMatch(activeSearchMatchIndex - 1)}
                  disabled={searchResults.length === 0}
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
                  disabled={searchResults.length === 0}
                  aria-label={t("syllabus.viewerSearchNext", {
                    defaultValue: "Resultado siguiente"
                  })}
                >
                  <ChevronRight className="h-4 w-4" />
                </CustomButton>
              </div>

              <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 md:flex">
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

                <div className="flex items-center gap-2 rounded-full bg-white px-2 py-1 shadow-sm whitespace-nowrap">
                  <Input
                    value={pageInput}
                    onChange={(event) =>
                      setPageInput(event.target.value.replace(/[^0-9]/g, ""))
                    }
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
                  <span className="shrink-0 whitespace-nowrap text-sm font-medium text-slate-500">
                    / {pageCount || "--"}
                  </span>
                </div>

                <CustomButton
                  size="iconSm"
                  styleType="unstyled"
                  className="rounded-full text-slate-600 hover:bg-white"
                  onClick={() => scrollToPage(currentPage + 1)}
                  disabled={
                    !pageCount ||
                    (isPreviewOnly
                      ? currentPage >= maxPreviewPage
                      : currentPage >= pageCount)
                  }
                  aria-label={t("syllabus.viewerNextPage", {
                    defaultValue: "Pagina siguiente"
                  })}
                >
                  <ChevronRight className="h-4 w-4" />
                </CustomButton>
              </div>

              <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 md:flex">
                <CustomButton
                  size="iconSm"
                  styleType="unstyled"
                  className="rounded-full text-slate-600 hover:bg-white"
                  onClick={() =>
                    setZoom((value) =>
                      clamp(
                        Number((value - ZOOM_STEP).toFixed(2)),
                        MIN_ZOOM,
                        MAX_ZOOM
                      )
                    )
                  }
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
                  onClick={() =>
                    setZoom((value) =>
                      clamp(
                        Number((value + ZOOM_STEP).toFixed(2)),
                        MIN_ZOOM,
                        MAX_ZOOM
                      )
                    )
                  }
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

        <div
          className={`grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[17rem_minmax(0,1fr)] ${bodyToneClass}`}
        >
          <aside
            className={`hidden min-h-0 border-r xl:block ${sidebarToneClass}`}
          >
            <ScrollArea ref={thumbnailScrollAreaRef} className="h-full">
              <div className="flex flex-col items-center gap-2 p-4">
                <Document
                  file={thumbnailPdfFile}
                  options={PDF_DOCUMENT_OPTIONS}
                  loading={null}
                  onLoadSuccess={handleDocumentLoad}
                  onLoadError={handleDocumentLoadError}
                  error={null}
                  className="contents"
                >
                  {thumbnailPages.map((pageNumber) => {
                    const isActive = currentPage === pageNumber;
                    const isLocked = isPageLocked(pageNumber);

                    return (
                      <button
                        key={`thumb-${pageNumber}`}
                        ref={(node) => {
                          if (node) {
                            thumbnailRefs.current.set(pageNumber, node);
                            return;
                          }

                          thumbnailRefs.current.delete(pageNumber);
                        }}
                        type="button"
                        onClick={() => scrollToPage(pageNumber)}
                        className={[
                          "group inline-flex w-fit flex-col items-center overflow-hidden rounded-[1.15rem] border p-2 text-left transition-all",
                          isLocked
                            ? "border-slate-300/90 bg-slate-100/90 hover:border-amber-300 hover:bg-slate-50"
                            : "",
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
                        {isLocked ? (
                          <div className="flex h-[10.5rem] w-[7.55rem] flex-col items-center justify-center rounded-[0.5rem] border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.94))] px-3 text-slate-500 shadow-inner">
                            <Lock className="h-5 w-5" />
                            <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                              Premium
                            </span>
                          </div>
                        ) : (
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
                              loading={
                                <div className="h-[10.5rem] bg-slate-100" />
                              }
                            />
                          </div>
                        )}

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

          <div ref={viewerContainerRef} className="min-h-0 min-w-0">
            <div
              ref={viewerScrollRef}
              className="relative h-full overflow-auto"
            >
              <div className="flex min-h-full min-w-fit items-start justify-center p-2 sm:p-4 md:p-6 xl:p-8">
                <Document
                  file={mainPdfFile}
                  options={PDF_DOCUMENT_OPTIONS}
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
                      <p className="mt-2 text-sm text-muted-foreground">
                        {documentError}
                      </p>
                    </div>
                  ) : (
                    <div className="flex w-full max-w-full flex-col items-center gap-6">
                      {thumbnailPages.map((pageNumber) => {
                        const isLockedPage = isPageLocked(pageNumber);
                        const isRenderedPage = pageNumber <= renderedPageCount;
                        const canRenderPage = !isLockedPage && isRenderedPage;
                        const pageMatchOffset =
                          pageSearchOffsets.get(pageNumber) ?? 0;
                        let pageMatchCursor = 0;
                        const renderPageSearchHighlight = (textItem: {
                          str?: string;
                        }) =>
                          renderSearchHighlight(
                            pageNumber,
                            textItem,
                            () => pageMatchOffset + pageMatchCursor++
                          );

                        return (
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
                            {canRenderPage ? (
                              <>
                                <div
                                  style={pdfPageFilterStyle}
                                  draggable={false}
                                >
                                  <Page
                                    pageNumber={pageNumber}
                                    width={mainPageWidth}
                                    renderAnnotationLayer={false}
                                    renderTextLayer={Boolean(
                                      searchHighlightRegex &&
                                      searchMatchesSet.has(pageNumber)
                                    )}
                                    customTextRenderer={
                                      renderPageSearchHighlight
                                    }
                                    className="pdf-viewer-page leading-none"
                                    loading={
                                      <div className="h-[60vh] w-[42rem] max-w-full bg-slate-50" />
                                    }
                                  />
                                </div>
                                <div
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-0 overflow-hidden"
                                >
                                  {VIEWER_WATERMARK_BLOCKS.map(
                                    (position, index) => (
                                      <div
                                        key={`viewer-watermark-${pageNumber}-${index}`}
                                        className="absolute flex w-[30%] min-w-[10rem] max-w-[16rem] rotate-[-24deg] flex-col items-center opacity-45"
                                        style={position}
                                      >
                                        <span className="w-full opacity-[0.50]">
                                          <BrandLogo
                                            alt=""
                                            className="w-full object-contain"
                                          />
                                        </span>
                                        <span className="mt-2 rounded-full bg-white/35 px-3 py-1 text-center text-[10px] font-semibold tracking-[0.14em] text-slate-600 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                                          {viewerWatermarkLabel}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="flex min-h-[60vh] w-[42rem] max-w-full flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(226,232,240,0.94))] px-6 text-center text-slate-500">
                                {isLockedPage ? (
                                  <>
                                    <Lock className="h-8 w-8" />
                                    <span className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                                      Premium
                                    </span>
                                    <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
                                      {t("syllabus.viewerPremiumPageMessage", {
                                        defaultValue:
                                          "Esta pagina forma parte de la vista completa del temario."
                                      })}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <FileText className="h-8 w-8" />
                                    <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
                                      {t("syllabus.viewerPageUnavailable", {
                                        defaultValue:
                                          "Esta pagina no esta disponible en este momento."
                                      })}
                                    </p>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Document>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PlanUpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={setIsUpgradeDialogOpen}
        feature="syllabus-pdf"
        currentPlanName={planState?.plan_name ?? null}
        currentLimit={FREE_PREVIEW_PAGE_LIMIT}
        targetLimit={pageCount || FREE_PREVIEW_PAGE_LIMIT}
      />
    </>
  );
};

export default ProfileSyllabusPdfViewer;
