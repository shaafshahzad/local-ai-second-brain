// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecondBrainApp from "@/components/SecondBrainApp";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );

describe("SecondBrainApp", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/dashboard") {
          return jsonResponse({
            vaultRoot: "/test-vault",
            stats: { sources: 2, unprocessed: 1, chunks: 4 },
            recentSources: [],
            recentWikiPages: [],
            reviewItems: [],
            suggestedTopics: [],
          });
        }
        if (url === "/api/health") {
          return jsonResponse({
            local: {
              vaultRoot: "/test-vault",
              dbPath: "/test-vault/test.sqlite",
              chatModel: "test-chat",
              embeddingModel: "test-embed",
              qdrantCollection: "test",
            },
            ollama: { ok: true, host: "http://ollama" },
            qdrant: { ok: true, url: "http://qdrant" },
          });
        }
        if (url === "/api/sources") return jsonResponse({ sources: [] });
        if (url === "/api/wiki-pages") return jsonResponse({ pages: [] });
        if (url === "/api/capture" && init?.method === "POST") {
          return jsonResponse({
            sourceId: 3,
            title: "Test note",
            localPath: "inbox/quick-notes/test-note.md",
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      })
    );
  });

  it("renders service status and dashboard metrics after refresh", async () => {
    render(<SecondBrainApp view="dashboard" />);

    expect(screen.getByRole("heading", { level: 1, name: "Your local knowledge base." })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Local AI ready")).toBeInTheDocument());
    expect(screen.getByText("/test-vault")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("submits and clears a capture", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<SecondBrainApp view="capture" />);

    fireEvent.change(screen.getByPlaceholderText("Title, optional"), {
      target: { value: "Test note" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste text, a URL, or a note..."), {
      target: { value: "A source-backed note." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save capture" }));

    await waitFor(() =>
      expect(
        screen.getByText("Saved Test note to inbox/quick-notes/test-note.md")
      ).toBeInTheDocument()
    );
    const captureCall = fetchMock.mock.calls.find(([url]) => url === "/api/capture");
    expect(JSON.parse(String(captureCall?.[1]?.body))).toEqual({
      content: "A source-backed note.",
      title: "Test note",
      saveAndProcess: false,
    });
    expect(screen.getByPlaceholderText("Title, optional")).toHaveValue("");
    expect(screen.getByPlaceholderText("Paste text, a URL, or a note...")).toHaveValue("");
  });
});
