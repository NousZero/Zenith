import type { ZenithApi } from "../shared/types";

export {};

declare global {
  interface Window {
    zenith: ZenithApi;
  }
}
