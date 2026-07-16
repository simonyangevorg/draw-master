/**
 * Authenticated fetch wrapper.
 * Automatically attaches Authorization: Bearer <token> from localStorage.
 * On a 401, transparently refreshes the access token once via /auth/refresh
 * and retries; if that fails too, clears the session and lets AuthContext
 * (listening for "tennis:session-expired") navigate to /login instead of
 * hard-redirecting — a hard redirect only makes sense inside a browser tab.
 */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("tennis_user") || "null");
  } catch {
    return null;
  }
}

function getToken() {
  return getUser()?.token ?? null;
}

function saveUser(userData) {
  localStorage.setItem("tennis_user", JSON.stringify(userData));
}

function notifySessionExpired() {
  localStorage.removeItem("tennis_user");
  window.dispatchEvent(new Event("tennis:session-expired"));
}

// Dedupe concurrent refresh attempts — several requests can 401 at once.
let refreshPromise = null;

function refreshToken() {
  const user = getUser();
  if (!user?.refreshToken) return Promise.resolve(null);

  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: user.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        const updated = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          token: data.token,
          refreshToken: data.refreshToken,
        };
        saveUser(updated);
        return updated;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    if (!options._retried) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return apiFetch(path, { ...options, _retried: true });
      }
    }
    notifySessionExpired();
    throw new Error("Unauthorized");
  }

  return res;
}

export async function apiGet(path) {
  return apiFetch(path);
}

export async function apiPost(path, body) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

export async function apiPatch(path, body) {
  return apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDelete(path) {
  return apiFetch(path, { method: "DELETE" });
}
