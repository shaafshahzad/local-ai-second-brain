import { expect, test } from "@playwright/test";

test.describe.serial("Local AI Second Brain", () => {
  test("navigates the four application workflows", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your local knowledge base."
    );
    await expect(page.getByText("Services offline")).toBeVisible();

    await page.getByRole("link", { name: "Capture", exact: true }).click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Capture now. Organize later."
    );

    await page.getByRole("link", { name: "Ask", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Find and synthesize what you saved."
    );

    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Manage captures and wiki pages."
    );
  });

  test("captures, filters, edits, and deletes a source", async ({ page }) => {
    await page.goto("/capture");
    await page.getByPlaceholder("Title, optional").fill("E2E durable note");
    await page
      .getByPlaceholder("Paste text, a URL, or a note...")
      .fill("This note exercises the deployed filesystem and SQLite flow.");
    await page.getByRole("button", { name: "Save capture" }).click();
    await expect(page.getByText(/Saved E2E durable note to/)).toBeVisible();

    await page.getByRole("link", { name: "Library", exact: true }).click();
    await page.getByPlaceholder("Filter captures").fill("durable");
    await page.getByRole("button", { name: /E2E durable note/ }).click();
    await expect(page.locator(".editor-panel h2")).toHaveText("E2E durable note");

    await page.locator(".markdown-textarea").fill("# E2E durable note\n\nEdited and verified.");
    await page.locator(".editor-panel").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved E2E durable note.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".editor-panel").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Deleted E2E durable note.")).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E durable note/ })).toHaveCount(0);
  });

  test("creates, edits, and deletes a wiki page", async ({ page }) => {
    await page.goto("/library");
    page.once("dialog", (dialog) => dialog.accept("E2E Wiki Concept"));
    await page.getByRole("button", { name: "New wiki page" }).click();

    await expect(page.locator(".editor-panel h2")).toHaveText("E2E Wiki Concept");
    await page.locator(".markdown-textarea").fill("# E2E Wiki Concept\n\nVerified wiki content.");
    await page.locator(".editor-panel").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved E2E Wiki Concept.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".editor-panel").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Deleted E2E Wiki Concept.")).toBeVisible();
  });
});
