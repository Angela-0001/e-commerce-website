const BASE = process.env.REACT_APP_API_URL;

function getToken() {
  return localStorage.getItem('token');
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = token;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

export const api = {
  post: (path, body) => req('POST', path, body),
  get: (path) => req('GET', path),
  put: (path, body) => req('PUT', path, body),
  del: (path) => req('DELETE', path),
};
