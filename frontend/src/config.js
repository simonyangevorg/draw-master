/**
 * API base URL. Empty string means "same origin, relative paths" — correct
 * for the web SPA served through Nginx. A packaged Capacitor app has no
 * origin, so mobile builds set VITE_API_BASE_URL (see .env.example) to the
 * Nginx gateway's full address (e.g. http://192.168.1.20:80).
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
