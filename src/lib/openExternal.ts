import type { MouseEvent } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Opens an external URL (Meet links) outside the app (F054). In the native
 * app (Capacitor with a remote server) a new window may stay inside the
 * WebView, so it goes through @capacitor/browser; on the web it is a normal
 * new tab.
 */
export function openExternal(url: string): void {
  if (Capacitor.isNativePlatform()) {
    void import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** onClick for `<a target="_blank">`: keeps the link on the web, reroutes it in the app. */
export function handleExternalLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
  if (!Capacitor.isNativePlatform()) return;
  event.preventDefault();
  openExternal(event.currentTarget.href);
}
