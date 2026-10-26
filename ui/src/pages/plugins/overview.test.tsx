import type { JSX } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { captureI18nStateForTesting } from "../../i18n/lib/translate.test-support.ts";
import { i18n } from "../../i18n/lib/translate.ts";
import { domProbe } from "../../test-helpers/dom-probe.ts";
import { mountSolid, cleanupSolid } from "../../test-helpers/mount-solid.ts";
import {
  renderPluginCompatibilityNotices,
  renderPluginMetadata,
  renderPluginPublisher,
} from "./overview.tsx";
import { createDiscoveryDetail } from "./plugins-page.test-support.ts";

const views = new WeakMap<Element, { unmount: () => void }>();
function render(content: () => JSX.Element, container = document.createElement("div")) {
  views.get(container)?.unmount();
  const view = mountSolid(content, { container });
  views.set(container, view);
  flush();
  return { container, ...domProbe(container) };
}
afterEach(cleanupSolid);
const notice = {
  code: "deprecated-sdk-api" as const,
  severity: "info" as const,
  message:
    "Uses OpenClaw APIs that retire on Dec 31, 2026. It keeps working until then; check for a plugin update.",
  removalDate: "2026-12-31",
  migrationGuideUrl: "https://docs.openclaw.ai/plugins/sdk-migration",
  apis: [],
};
function renderNotice(overrides: Partial<typeof notice> = {}) {
  return render(() => renderPluginCompatibilityNotices([{ ...notice, ...overrides }]));
}

it("omits compatibility notices for plugins without observed deprecated API usage", () => {
  const { container } = render(() => renderPluginCompatibilityNotices(undefined));
  expect(container.children).toHaveLength(0);
});

it("localizes a mounted compatibility notice from its structured removal date", async () => {
  onTestFinished(captureI18nStateForTesting());
  const translate = i18n.t.bind(i18n);
  const translation = vi.spyOn(i18n, "t").mockImplementation((key, params) => {
    if (i18n.getLocale() === "de") {
      if (key === "pluginsPage.compatibilityDeprecatedDated") {
        return `Verwendet OpenClaw-APIs bis ${params?.date}.`;
      }
      if (key === "pluginsPage.compatibilityDetails") {
        return "Mehr erfahren";
      }
    }
    return translate(key, params);
  });
  onTestFinished(() => translation.mockRestore());
  await i18n.setLocale("en");
  const { container } = renderNotice({ message: "Server-only English fallback" });
  expect(container.textContent).toBe(
    "Uses OpenClaw APIs that retire on Dec 31, 2026. It keeps working until then; check for a plugin update. Details",
  );
  await i18n.setLocale("de");
  flush();
  expect(container.textContent).toBe("Verwendet OpenClaw-APIs bis 31. Dez. 2026. Mehr erfahren");
});

it("uses catalog copy when a compatibility notice has no removal date", () => {
  const { container } = renderNotice({
    message: "Server-only English fallback",
    removalDate: undefined,
  });
  expect(container.textContent).toBe(
    "Uses older OpenClaw APIs. It keeps working for now; check for a plugin update. Details",
  );
});

it.each([
  "Martian-Engineering/lossless-claw",
  "git+https://github.com/Martian-Engineering/lossless-claw.git",
])("renders repository identity from %s", (source) => {
  const result = createDiscoveryDetail();
  result.detail.repositoryUrl = source;
  const { query } = render(() => renderPluginMetadata(result));
  const link = query(".plugin-metadata__repository");
  expect(link?.getAttribute("href")).toBe("https://github.com/Martian-Engineering/lossless-claw");
  expect(link?.textContent).toContain("Martian-Engineering/lossless-claw");
  expect(link?.querySelector("svg")).not.toBeNull();
});

it("keeps documentation distinct and removes the catalog promotion sections", () => {
  const result = createDiscoveryDetail();
  result.detail.repositoryUrl = "https://github.com/Acme/plugin";
  result.detail.documentationUrl = "https://github.com/Acme/plugin/blob/main/docs/setup.md";
  const { container, text, all, query } = render(() => renderPluginMetadata(result));
  expect([...all("section")].map((section) => section.querySelector("h2")?.textContent)).toEqual([
    "Repository",
    "Documentation",
  ]);
  expect(text(".plugin-metadata__repository")).toContain("Acme/plugin");
  expect(container.textContent).not.toContain("View on ClawHub");
  expect(query('a[href="https://github.com/Acme/plugin/blob/main/docs/setup.md"]')).not.toBeNull();
});

it("omits absent publishers and only badges authoritative publisher status", () => {
  const result = createDiscoveryDetail();
  result.plugin.catalog.official = true;
  result.detail.author = { handle: "acme", displayName: "Acme" };
  const { container, query, text } = render(() => renderPluginPublisher(undefined));
  expect(container.children).toHaveLength(0);
  render(() => renderPluginPublisher(undefined, "Local publisher"), container);
  expect(text("strong")).toBe("Local publisher");
  render(() => renderPluginPublisher(result), container);
  expect(query('a[href="https://clawhub.ai/acme"]')).not.toBeNull();
  expect(query("img")).toBeNull();
  expect(query('[aria-label="Official"]')).toBeNull();
  result.detail.author.official = true;
  render(() => renderPluginPublisher(result), container);
  expect(query('[aria-label="Official"]')).not.toBeNull();
});

it.each([
  ["clean", 3],
  ["review", 2],
  ["malicious", 1],
  ["unknown", 0],
] as const)("shows %s audit with %i bars and the exact ClawHub link", (verdict, count) => {
  const url = "https://clawhub.ai/acme/plugins/demo/security-audit?version=1.0";
  const result = createDiscoveryDetail();
  result.detail.security = { status: verdict, verdict, auditUrl: url };
  const { all, attr } = render(() => renderPluginMetadata(result));
  expect(all(".is-filled")).toHaveLength(count);
  expect(attr("a", "href")).toBe(url);
});
