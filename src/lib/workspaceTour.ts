export const WORKSPACE_TOUR_STORAGE_KEY_PREFIX = "opositai:workspace-tour:v1";

export const WORKSPACE_TOUR_TARGETS = {
  navigation: "workspace-tour-navigation",
  dashboardHero: "workspace-tour-dashboard-hero",
  dashboardMetrics: "workspace-tour-dashboard-metrics",
  dashboardPerformance: "workspace-tour-dashboard-performance",
  dashboardHistory: "workspace-tour-dashboard-history",
  accountMenu: "workspace-tour-account-menu"
} as const;

export const getWorkspaceTourStorageKey = (userId: string) =>
  `${WORKSPACE_TOUR_STORAGE_KEY_PREFIX}:${userId}`;
