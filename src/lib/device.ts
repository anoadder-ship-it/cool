/**
 * Device / browser detection utilities.
 */

/** True when running on a mobile OS (Android, iOS). */
export function isMobileDevice(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}
