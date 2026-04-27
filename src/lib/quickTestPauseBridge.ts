const QUICK_TEST_PAUSE_REQUEST_EVENT = "quick-test:pause-request";
const QUICK_TEST_PAUSE_RESULT_EVENT = "quick-test:pause-result";

type QuickTestPauseRequestDetail = {
  requestId: string;
};

type QuickTestPauseResultDetail = {
  handled: boolean;
  requestId: string;
};

const buildRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `quick-test-pause-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const requestActiveQuickTestPause = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;

  const requestId = buildRequestId();

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener(
        QUICK_TEST_PAUSE_RESULT_EVENT,
        handleResult as EventListener
      );
    };

    const finish = (handled: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(handled);
    };

    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<QuickTestPauseResultDetail>).detail;
      if (!detail || detail.requestId !== requestId) return;
      finish(detail.handled);
    };

    window.addEventListener(
      QUICK_TEST_PAUSE_RESULT_EVENT,
      handleResult as EventListener
    );

    window.dispatchEvent(
      new CustomEvent<QuickTestPauseRequestDetail>(
        QUICK_TEST_PAUSE_REQUEST_EVENT,
        { detail: { requestId } }
      )
    );

    window.setTimeout(() => finish(false), 1200);
  });
};

export const registerActiveQuickTestPauseHandler = (
  handler: () => Promise<boolean>
) => {
  if (typeof window === "undefined") return () => undefined;

  const handleRequest = (event: Event) => {
    const detail = (event as CustomEvent<QuickTestPauseRequestDetail>).detail;
    if (!detail?.requestId) return;

    void handler()
      .then((handled) => {
        window.dispatchEvent(
          new CustomEvent<QuickTestPauseResultDetail>(
            QUICK_TEST_PAUSE_RESULT_EVENT,
            { detail: { handled, requestId: detail.requestId } }
          )
        );
      })
      .catch(() => {
        window.dispatchEvent(
          new CustomEvent<QuickTestPauseResultDetail>(
            QUICK_TEST_PAUSE_RESULT_EVENT,
            { detail: { handled: false, requestId: detail.requestId } }
          )
        );
      });
  };

  window.addEventListener(
    QUICK_TEST_PAUSE_REQUEST_EVENT,
    handleRequest as EventListener
  );

  return () => {
    window.removeEventListener(
      QUICK_TEST_PAUSE_REQUEST_EVENT,
      handleRequest as EventListener
    );
  };
};
