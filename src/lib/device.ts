/** Only actual low-memory small-screen mobile phones use lite assets.
 *  Laptops, desktops, and tablets always load full 4K ultra-quality textures and models. */
export const LITE =
  typeof window !== "undefined" &&
  window.innerWidth < 640 &&
  /Android|iPhone|iPod/i.test(navigator.userAgent);
