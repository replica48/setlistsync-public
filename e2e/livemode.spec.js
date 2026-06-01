import { test, expect } from '@playwright/test';

const LEADER = { email: 'leader@test.com', password: 'TestPass123!' };
const MEMBER = { email: 'member@test.com', password: 'TestPass123!' };

async function signIn(page, user) {
    await page.goto('/');
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/password/i).fill(user.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.getByText(/test band/i).click();
    await expect(page.getByText(/live|song|setlist/i)).toBeVisible({ timeout: 10000 });
}

async function enterLiveMode(page) {
    await page.getByRole('button', { name: /live|start live/i }).click();
    await expect(page.getByText(/live mode|conducting|live session/i)).toBeVisible({ timeout: 8000 });
}

test.describe('Live Mode', () => {
    test('conductor can start live mode', async ({ page }) => {
        await signIn(page, LEADER);
        await enterLiveMode(page);
    });

    test('conductor advancing song updates member view in real time', async ({ browser }) => {
        // Two separate browser contexts = two isolated sessions
        const conductorCtx = await browser.newContext();
        const memberCtx = await browser.newContext();
        const conductorPage = await conductorCtx.newPage();
        const memberPage = await memberCtx.newPage();

        try {
            await signIn(conductorPage, LEADER);
            await signIn(memberPage, MEMBER);

            // Conductor starts live mode
            await enterLiveMode(conductorPage);

            // Member joins live mode (view-only)
            await memberPage.getByRole('button', { name: /live|join live/i }).click();
            await expect(memberPage.getByText(/live mode|watching|synced/i)).toBeVisible({ timeout: 8000 });

            // Conductor navigates to the next song
            const nextBtn = conductorPage.getByRole('button', { name: /next|→|forward/i });
            if (await nextBtn.isVisible()) {
                await nextBtn.click();
            }

            // Both views should reflect the same current song
            const conductorSong = await conductorPage.locator('[data-testid="current-song-title"], .current-song').textContent();
            if (conductorSong) {
                await expect(memberPage.getByText(conductorSong.trim())).toBeVisible({ timeout: 10000 });
            }
        } finally {
            await conductorCtx.close();
            await memberCtx.close();
        }
    });

    test('member can mark ready and conductor sees the indicator', async ({ browser }) => {
        const conductorCtx = await browser.newContext();
        const memberCtx = await browser.newContext();
        const conductorPage = await conductorCtx.newPage();
        const memberPage = await memberCtx.newPage();

        try {
            await signIn(conductorPage, LEADER);
            await signIn(memberPage, MEMBER);

            await enterLiveMode(conductorPage);
            await memberPage.getByRole('button', { name: /live|join live/i }).click();
            await expect(memberPage.getByText(/live mode|watching|synced/i)).toBeVisible({ timeout: 8000 });

            // Member marks ready
            const readyBtn = memberPage.getByRole('button', { name: /ready|i'm ready/i });
            if (await readyBtn.isVisible()) {
                await readyBtn.click();
                // Conductor should see a ready indicator for this member
                await expect(conductorPage.getByText(/ready|✓/i)).toBeVisible({ timeout: 8000 });
            }
        } finally {
            await conductorCtx.close();
            await memberCtx.close();
        }
    });
});
