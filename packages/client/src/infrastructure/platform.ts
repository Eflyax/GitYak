// The webview runs on the same machine as the app, so its user agent tells the host OS
// synchronously. (The CPU architecture is not reliable there; ask the get_platform command.)
export const isWindowsHost = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

/** Separator between PATH entries on this host. */
export const PATH_DELIMITER = isWindowsHost ? ';' : ':';
