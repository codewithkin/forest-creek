import { describe, expect, test } from "bun:test";

import {
  canPreview,
  contentDisposition,
  fetchRemoteFile,
  isAllowedFileType,
  isPrivateAddress,
  safeFileName,
  typeFromName,
} from "./file-rules";

describe("what can be stored", () => {
  test("documents, images, video and archives, but nothing a browser runs as a page", () => {
    for (const type of ["application/pdf", "image/png", "video/mp4", "text/csv", "application/zip"]) expect(isAllowedFileType(type)).toBe(true);
    for (const type of ["text/html", "image/svg+xml", "application/x-msdownload", "constructor"]) expect(isAllowedFileType(type)).toBe(false);
  });

  test("a type can come from the name, and only some types preview", () => {
    expect(typeFromName("Report.PDF")).toBe("application/pdf");
    expect(typeFromName("photo.jpeg")).toBe("image/jpeg");
    expect(typeFromName("page.html")).toBeUndefined();
    expect(canPreview("application/pdf")).toBe(true);
    expect(canPreview("application/zip")).toBe(false);
  });
});

describe("safeFileName", () => {
  test("removes paths and awkward characters, never leaving nothing", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\Lease 2026 (final).pdf")).toBe("Lease-2026-final-.pdf");
    expect(safeFileName("...")).toBe("file");
  });

  test("the download header keeps the real name for browsers that read it", () => {
    expect(contentDisposition("Reçu août.pdf", false)).toBe(`attachment; filename="Rec-u-aou-t.pdf"; filename*=UTF-8''Re%C3%A7u%20ao%C3%BBt.pdf`);
    expect(contentDisposition("plan.pdf", true).startsWith("inline")).toBe(true);
  });
});

describe("isPrivateAddress", () => {
  test("refuses anything that isn't plainly public", () => {
    for (const address of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
      "::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::10.0.0.1", "not-an-address",
    ]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  test("lets public addresses through", () => {
    for (const address of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
  });
});

describe("fetchRemoteFile", () => {
  const publicLookup = async () => ["93.184.216.34"];
  const file = (body: string, type = "application/pdf", status = 200, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers: { "content-type": type, ...headers } });
  const reason = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as Error).message;
    }
    return "(did not reject)";
  };
  const fetchOf = (...responses: Response[]) => (async () => responses.shift()!) as unknown as typeof fetch;

  test("downloads a file and works out its type and name", async () => {
    const result = await fetchRemoteFile("https://files.example.com/docs/Lease%202026.pdf", { fetch: fetchOf(file("%PDF")), lookup: publicLookup });
    expect(result).toMatchObject({ contentType: "application/pdf", name: "Lease-2026.pdf" });
    expect(new TextDecoder().decode(result.bytes)).toBe("%PDF");
  });

  test("falls back on the file name when the server says octet-stream", async () => {
    const result = await fetchRemoteFile("https://example.com/plan.xlsx", { fetch: fetchOf(file("x", "application/octet-stream")), lookup: publicLookup });
    expect(result.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  test("refuses plain http, logins, localhost and private addresses without fetching", async () => {
    let fetched = 0;
    const counting = (async () => {
      fetched++;
      return file("x");
    }) as unknown as typeof fetch;
    const local = async () => ["127.0.0.1"];
    expect(await reason(fetchRemoteFile("http://example.com/a.pdf", { fetch: counting, lookup: publicLookup }))).toContain("https");
    expect(await reason(fetchRemoteFile("https://user:pw@example.com/a.pdf", { fetch: counting, lookup: publicLookup }))).toContain("login");
    expect(await reason(fetchRemoteFile("https://localhost/a.pdf", { fetch: counting, lookup: publicLookup }))).toContain("can't be imported");
    expect(await reason(fetchRemoteFile("https://sneaky.example.com/a.pdf", { fetch: counting, lookup: local }))).toContain("can't be imported");
    expect(await reason(fetchRemoteFile("https://169.254.169.254/latest", { fetch: counting, lookup: async (host) => [host] }))).toContain("can't be imported");
    expect(fetched).toBe(0);
  });

  test("a host with any private address is refused, even alongside a public one", async () => {
    const mixed = async () => ["8.8.8.8", "10.0.0.5"];
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(file("x")), lookup: mixed }))).toContain("can't be imported");
  });

  test("a redirect into the private network is refused", async () => {
    const lookup = async (host: string) => (host === "internal.example.com" ? ["10.0.0.5"] : ["93.184.216.34"]);
    const redirect = new Response(null, { status: 302, headers: { location: "https://internal.example.com/secret.pdf" } });
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(redirect), lookup }))).toContain("can't be imported");
  });

  test("redirect chains stop, and a safe redirect is followed", async () => {
    const hop = () => new Response(null, { status: 302, headers: { location: "/next.pdf" } });
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(hop(), hop(), hop(), hop()), lookup: publicLookup }))).toContain("too many");
    const followed = await fetchRemoteFile("https://example.com/a", { fetch: fetchOf(hop(), file("ok")), lookup: publicLookup });
    expect(followed.name).toBe("next.pdf");
  });

  test("an oversized file is cut off, whether it admits it or not", async () => {
    const admits = file("x", "application/pdf", 200, { "content-length": String(60 * 1024 * 1024) });
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(admits), lookup: publicLookup }))).toContain("50 MB");
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(file("0123456789")), lookup: publicLookup, maxBytes: 5 }))).toContain("50 MB");
  });

  test("the wrong kind of file, an error page or nothing at all is refused", async () => {
    expect(await reason(fetchRemoteFile("https://example.com/page", { fetch: fetchOf(file("<html>", "text/html")), lookup: publicLookup }))).toContain("type of file");
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(file("gone", "text/plain", 404)), lookup: publicLookup }))).toContain("404");
    expect(await reason(fetchRemoteFile("https://example.com/a.pdf", { fetch: fetchOf(file("")), lookup: publicLookup }))).toContain("nothing");
  });
});
