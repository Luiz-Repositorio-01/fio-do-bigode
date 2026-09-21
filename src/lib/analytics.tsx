"use client";

/**
 * Analytics preparado por variáveis de ambiente. Sem IDs configurados, NADA é
 * carregado nem enviado: `track()` só registra no console em desenvolvimento.
 *
 *  NEXT_PUBLIC_GA_ID          (Google Analytics 4)
 *  NEXT_PUBLIC_META_PIXEL_ID  (Meta Pixel)
 *  Search Console: verificação via NEXT_PUBLIC_GSC_VERIFICATION (metadata em app/layout).
 */
import Script from "next/script";

export type AnalyticsEvent =
  | "page_view"
  | "click_whatsapp"
  | "start_booking"
  | "select_service"
  | "select_professional"
  | "select_date"
  | "booking_completed"
  | "customer_registered"
  | "loyalty_reward_redeemed"
  | "referral_created"
  | "referral_visit";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function track(event: AnalyticsEvent, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", event, params);
    if (event === "booking_completed") window.fbq?.("track", "Schedule", params);
    else if (event === "customer_registered") window.fbq?.("track", "Lead", params);
    else window.fbq?.("trackCustom", event, params);
    if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event, params);
  } catch {
    /* analytics nunca deve quebrar a página */
  }
}

export function Analytics() {
  return (
    <>
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
