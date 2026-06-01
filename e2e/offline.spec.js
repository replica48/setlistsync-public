import { test, expect } from '@playwright/test';

const LEADER = { email: 'leader@test.com', password: 'TestPass123!' };


test.describe('Offline mode', () => {
    test('app shows offline banner when network is disconnected', async ({ page, context }) => {
        // Sign in first so Firebase auth token exists
        await page.goto('/');
        await page.getByLabel(/email/i).fill(LEADER.email);
        await page.getByLabel(/password/i).fill(LEADER.password);
        await page.getByRole('button', { name: /sign in|log in/i }).click();
        await page.getByText(/test band/i).click();
        await expect(page.getByText(/song|setlist/i)).toBeVisible({ timeout: 10000 });

        // Go offline
        await context.setOffline(true);

        // Reload page — app should detect offline state
        await page.reload();
        await expect(page.getByText(/offline|no connection|working offline/i)).toBeVisible({ timeout: 10000 });
    });

    test('app recovers and hides offline banner when reconnected', async ({ page, context }) => {
        await page.goto('/');
        await page.getByLabel(/email/i).fill(LEADER.email);
        await page.getByLabel(/password/i).fill(LEADER.password);
        await page.getByRole('button', { name: /sign in|log in/i }).click();
        await page.getByText(/test band/i).click();
        await expect(page.getByText(/song|setlist/i)).toBeVisible({ timeout: 10000 });

        // Go offline then back online
        await context.setOffline(true);
        await page.waitForTimeout(500);
        await context.setOffline(false);

        // Offline banner should disappear
        await expect(page.getByText(/offline|no connection/i)).not.toBeVisible({ timeout: 10000 });
    });
});
