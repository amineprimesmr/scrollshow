"use client";
/** A non-2xx response is never a successful mutation or a downloadable export. */
export async function checkedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  const response = await fetch(input, { ...init, signal });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "session_expired" : "request_failed");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response;
}
