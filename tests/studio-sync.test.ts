import assert from "node:assert/strict";
import test from "node:test";
import { createStudioSync } from "../lib/studio-sync";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("an agent write during a pending read cannot restore an outdated calendar", async () => {
  const oldRead = deferred<Response>();
  const snapshots: number[] = [];
  let calls = 0;
  const sync = createStudioSync<number>({
    fetcher: async () => ++calls === 1 ? oldRead.promise : Response.json(2),
    onSnapshot: value => snapshots.push(value), onSuccess() {}, onError() {},
  });
  const poll = sync.refresh();
  const save = sync.refresh(true);
  oldRead.resolve(Response.json(1));
  await Promise.all([poll, save]);
  assert.equal(calls, 2);
  assert.deepEqual(snapshots, [2]);
  sync.stop();
});

test("focus and polling share a read; unchanged responses do not replace editor dependencies", async () => {
  const first = deferred<Response>();
  const snapshots: number[] = [];
  let calls = 0;
  const sync = createStudioSync<number>({
    fetcher: async (_url, init) => {
      calls++;
      assert.equal(init?.cache, "no-store");
      if (calls === 1) return first.promise;
      assert.equal(new Headers(init?.headers).get("if-none-match"), 'W/"one"');
      return new Response(null, { status: 304 });
    },
    onSnapshot: value => snapshots.push(value), onSuccess() {}, onError() {},
  });
  const poll = sync.refresh();
  const focus = sync.refresh();
  assert.equal(calls, 1);
  first.resolve(Response.json(1, { headers: { ETag: 'W/"one"' } }));
  await Promise.all([poll, focus]);
  await sync.refresh();
  assert.deepEqual(snapshots, [1]);
  assert.equal(calls, 2);
  sync.stop();
});

test("a temporary failure preserves the previous snapshot and a retry picks up new content", async () => {
  let calls = 0;
  const snapshots: number[] = [];
  const failures: string[] = [];
  const sync = createStudioSync<number>({
    fetcher: async () => ++calls === 2 ? new Response(null, {status: 503}) : Response.json(calls),
    onSnapshot: value => snapshots.push(value), onSuccess() {},
    onError: error => failures.push(error.message),
  });
  await sync.refresh();
  await assert.rejects(sync.refresh(), /studio_refresh_failed/);
  assert.deepEqual(snapshots, [1]);
  await sync.refresh();
  assert.deepEqual(snapshots, [1, 3]);
  assert.deepEqual(failures, ["studio_refresh_failed"]);
  sync.stop();
});

test("reauthorization after session expiry requests a full snapshot", async () => {
  let calls = 0;
  const sync = createStudioSync<number>({
    fetcher: async (_url, init) => {
      calls++;
      if (calls === 2) return new Response(null, {status: 401});
      assert.equal(new Headers(init?.headers).has("if-none-match"), false);
      return Response.json(calls, {headers: {ETag: 'W/"one"'}});
    },
    onSnapshot() {}, onSuccess() {}, onError() {},
  });
  await sync.refresh();
  await assert.rejects(sync.refresh(), /session_expired/);
  await sync.refresh();
  assert.equal(calls, 3);
  sync.stop();
});

test("unmount aborts pending work without updating React or reporting an error", async () => {
  let signal: AbortSignal | undefined;
  const sync = createStudioSync<number>({
    fetcher: async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    },
    onSnapshot() { assert.fail("updated after unmount"); },
    onSuccess() { assert.fail("updated after unmount"); },
    onError() { assert.fail("reported an intentional abort"); },
  });
  const poll = sync.refresh();
  sync.stop();
  await poll;
  assert.equal(signal?.aborted, true);
});

test("a hung request times out so future refreshes can resume", async () => {
  let calls = 0;
  const snapshots: number[] = [];
  const sync = createStudioSync<number>({
    timeoutMs: 10,
    fetcher: async (_url, init) => {
      if (++calls > 1) return Response.json(2);
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))));
    },
    onSnapshot: value => snapshots.push(value), onSuccess() {}, onError() {},
  });
  await assert.rejects(sync.refresh(), /timeout/);
  await sync.refresh();
  assert.deepEqual(snapshots, [2]);
  sync.stop();
});
