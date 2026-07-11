import { expect, test } from "@playwright/test";

const user = {
  id: "user-1",
  email: "admin@example.com",
  name: "Production Admin",
  role: "admin",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/login", (route) =>
    route.fulfill({
      json: {
        data: {
          accessToken: "test-token",
          refreshToken: "refresh-token",
          expiresIn: 3600,
          user,
        },
      },
    }),
  );
  await page.route("**/projects?**", (route) =>
    route.fulfill({
      json: {
        data: [],
        pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
      },
    }),
  );
});

test("login opens the authenticated application and only light theme is available", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Пароль").fill("secure-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Сменить тему")).toHaveCount(0);
});
