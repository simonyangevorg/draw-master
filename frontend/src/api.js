/**
 * Authenticated fetch wrapper.
 * Automatically attaches Authorization: Bearer <token> from localStorage.
 */
function getToken() {
  try {
    const user = JSON.parse(localStorage.getItem("tennis_user") || "null");
    return user?.token ?? null;
  } catch {
    return null;
  }
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
    // Token expired or invalid — clear storage and redirect to login
    localStorage.removeItem("tennis_user");
    window.location.href = "/login";
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
