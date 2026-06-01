import { test, expect } from '@playwright/test';

const LEADER = { email: 'leader@test.com', password: 'TestPass123!' };

async function signInAndSelectBand(page) {
    await page.goto('/');
    await page.getByLabel(/email/i).fill(LEADER.email);
    await page.getByLabel(/password/i).fill(LEADER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.getByText(/test band/i).click();
    // Wait for song library view to load
    await expect(page.getByText(/song/i)).toBeVisible({ timeout: 10000 });
}

test.describe('Song library', () => {
    test.beforeEach(async ({ page }) => {
        await signInAndSelectBand(page);
    });

    test('seeded songs appear in the song list', async ({ page }) => {
        await expect(page.getByText('First Song')).toBeVisible();
        await expect(page.getByText('Second Song')).toBeVisible();
    });

    test('add a new song and it appears in the list', async ({ page }) => {
        await page.getByRole('button', { name: /add song|new song|\+/i }).click();
        await page.getByLabel(/title/i).fill('Brand New Song');
        await page.getByRole('button', { name: /save|create|add/i }).click();
        await expect(page.getByText('Brand New Song')).toBeVisible({ timeout: 8000 });
    });

    test('edit a song title and see the update', async ({ page }) => {
        await page.getByText('First Song').click();
        await page.getByRole('button', { name: /edit/i }).click();
        const titleInput = page.getByLabel(/title/i);
        await titleInput.clear();
        await titleInput.fill('First Song (Edited)');
        await page.getByRole('button', { name: /save/i }).click();
        await expect(page.getByText('First Song (Edited)')).toBeVisible({ timeout: 8000 });
    });

    test('delete a song and confirm it is removed', async ({ page }) => {
        // Add a throwaway song to delete
        await page.getByRole('button', { name: /add song|new song|\+/i }).click();
        await page.getByLabel(/title/i).fill('Delete Me');
        await page.getByRole('button', { name: /save|create|add/i }).click();
        await expect(page.getByText('Delete Me')).toBeVisible({ timeout: 8000 });

        // Delete it
        await page.getByText('Delete Me').click();
        await page.getByRole('button', { name: /delete/i }).click();
        // Confirm the confirmation modal
        await page.getByRole('button', { name: /confirm|yes|delete/i }).last().click();
        await expect(page.getByText('Delete Me')).not.toBeVisible({ timeout: 8000 });
    });

    test('song with empty lyrics shows empty state indicator', async ({ page }) => {
        await page.getByText('Second Song').click();
        // The app should show some empty lyrics indicator
        await expect(page.getByText(/no lyrics|empty|add lyrics/i)).toBeVisible({ timeout: 5000 });
    });
});
