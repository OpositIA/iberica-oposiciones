type DataLayerEvent = {
  event: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[];
  }
}

export const pushDataLayerEvent = (event: DataLayerEvent) => {
  if (typeof window === "undefined") return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
};

export const trackSignUpSuccess = () => {
  pushDataLayerEvent({
    event: "sign_up_success"
  });
};
