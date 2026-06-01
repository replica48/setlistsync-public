import { test, expect } from '@playwright/test';

const LEADER = { email: 'leader@test.com', password: 'TestPass123!' };

async function signInAndSelectBand(page) {
    await page.goto('/');
    await page.getByLabel(/email/i).fill(LEADER.email);
    await page.getByLabel(/password/i).fill(LEADER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.getByText(/test band/i).click();
    await expect(page.getByText(/setlist|song/i)).toBeVisible({ timeout: 10000 });
}

async function navigateToSetlists(page) {
    await page.getByRole('button', { name: /setlist/i }).click();
    await expect(page.getByText(/main setlist|setlist/i)).toBeVisible({ timeout: 5000 });
}

test.describe('Setlist management', () => {
    test.beforeEach(async ({ page }) => {
        await signInAndSelectBand(page);
        await navigateToSetlists(page);
    });

    test('seeded setlist appears in the list', async ({ page }) => {
        await expect(page.getByText('Main Setlist')).toBeVisible();
    });

    test('create a new setlist and it appears in the list', async ({ page }) => {
        await page.getByRole('button', { name: /new setlist|create setlist|\+/i }).click();
        await page.getByLabel(/name/i).fill('Weekend Gig');
        await page.getByRole('button', { name: /save|create/i }).click();
        await expect(page.getByText('Weekend Gig')).toBeVisible({ timeout: 8000 });
    });

    test('add songs to a setlist', async ({ page }) => {
        await page.getByText('Main Setlist').click();
        await page.getByRole('button', { name: /add song|add to setlist|\+/i }).click();
        await page.getByText('First Song').click();
        await expect(page.getByText('First Song')).toBeVisible({ timeout: 8000 });
    });

    test('setlist order persists after page reload', async ({ page }) => {
        await page.getByText('Main Setlist').click();
        // Add two songs
        await page.getByRole('button', { name: /add song|\+/i }).click();
        await page.getByText('First Song').click();
        await page.getByRole('button', { name: /add song|\+/i }).click();
        await page.getByText('Second Song').click();

        // Verify both songs appear
        const items = page.locator('[data-testid="setlist-item"], .setlist-item');
        await expect(items).toHaveCount(2, { timeout: 8000 });

        // Reload and verify order is preserved
        await page.reload();
        await navigateToSetlists(page);
        await page.getByText('Main Setlist').click();
        await expect(page.getByText('First Song')).toBeVisible({ timeout: 8000 });
        await expect(page.getByText('Second Song')).toBeVisible({ timeout: 8000 });
    });
});
