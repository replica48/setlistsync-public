import { test, expect } from '@playwright/test';

/**
 * Auth flow E2E tests.
 *
 * Prerequisites:
 *   - Firebase emulators running (auth, firestore)
 *   - App pointed at emulators (emulator block uncommented in src/App.jsx)
 *   - Seed data created (node e2e/fixtures/seed.js)
 */

const LEADER = { email: 'leader@test.com', password: 'TestPass123!' };

test.describe('Authentication', () => {
    test('shows auth screen on first load', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /sign in|log in|setlistsync/i })).toBeVisible();
    });

    test('signs in with valid credentials and reaches band selection', async ({ page }) => {
        await page.goto('/');
        await page.getByLabel(/email/i).fill(LEADER.email);
        await page.getByLabel(/password/i).fill(LEADER.password);
        await page.getByRole('button', { name: /sign in|log in/i }).click();
        // After login, user should see band list or band selection UI
        await expect(page.getByText(/test band|select a band|your bands/i)).toBeVisible({ timeout: 10000 });
    });

    test('shows error message with wrong password', async ({ page }) => {
        await page.goto('/');
        await page.getByLabel(/email/i).fill(LEADER.email);
        await page.getByLabel(/password/i).fill('WrongPassword!');
        await page.getByRole('button', { name: /sign in|log in/i }).click();
        await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 8000 });
    });

    test('shows email verification screen after new account registration', async ({ page }) => {
        const randomEmail = `newuser_${Date.now()}@test.com`;
        await page.goto('/');
        // Navigate to the register/create account form
        await page.getByRole('button', { name: /create account|register|sign up/i }).click();
        await page.getByLabel(/email/i).fill(randomEmail);
        await page.getByLabel(/password/i).fill('NewPass123!');
        await page.getByRole('button', { name: /create account|register|sign up/i }).last().click();
        await expect(page.getByText(/verify|verification|check your email/i)).toBeVisible({ timeout: 10000 });
    });
});
