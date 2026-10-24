import { expect, test } from '@playwright/test';

// End-to-end smoke test against the running dev servers (backend :8000, frontend :5173).
// Run with: npm run e2e

test.describe('PULSE AI', () => {
  test('loads the live dashboard with brand assets and a working replay', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(`asset ${r.status()} ${r.url()}`); });
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'PULSE AI' }).first()).toBeVisible();
    // first load of the dev server can take a few seconds while Vite optimises dependencies
    await expect(page.getByRole('img', { name: 'North City FC' }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('img', { name: 'South United FC' }).first()).toBeVisible();
    await expect(page.locator('.scorebar__score')).toContainText('0');
    await page.getByRole('button', { name: /Start replay/ }).click();
    await page.getByRole('button', { name: '300x' }).click();
    await page.waitForTimeout(2500);
    const clock = await page.locator('.pulse-clock').first().innerText();
    expect(clock).not.toContain('00:00');
    await page.getByRole('button', { name: 'Pause replay' }).click();
    const before = await page.locator('.pulse-clock').first().innerText();
    await page.waitForTimeout(600);
    expect(await page.locator('.pulse-clock').first().innerText()).toBe(before);
    // jump to a goal: the score must change
    await page.getByRole('button', { name: /Full-time/ }).click();
    await expect(page.locator('.scorebar__score')).toContainText('3');
    await expect(page.locator('.feed__row[data-type="goal"]').first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('switches scenarios and never leaks future events', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Scenario').selectOption('momentum-paradox');
    await expect(page.locator('.scorebar__status').last()).toContainText('Momentum Paradox');
    await expect(page.locator('.feed__empty')).toBeVisible();
    await page.locator('input[type="range"]').fill('1500');
    await expect(page.locator('.scorebar__score')).toContainText('0');
    await page.locator('input[type="range"]').fill('1700');
    await expect(page.locator('.scorebar__score .pulse-score').first()).toHaveText('1');
  });

  test('Narrative VAR corrects a wrong possession claim and shows evidence', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Narrative VAR' }).click();
    await page.getByRole('button', { name: /Wrong possession figure/ }).click();
    await expect(page.locator('.verdict-hero img[alt="corrected stamp"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Revised commentary')).toBeVisible();
    await expect(page.locator('.claim-row').first()).toContainText('possession');
    await page.getByRole('button', { name: /Fabricated goal/ }).click();
    await expect(page.locator('.verdict-hero img[alt="unsupported stamp"]')).toBeVisible({ timeout: 10000 });
  });

  test('Broadcast airs kit overlays from the replay and fact-checks a claim on air', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Broadcast', exact: true }).click();
    await expect(page.locator('.pb-scorebug')).toBeVisible();
    await expect(page.locator('.pb-pulse')).toBeVisible();
    // the auto director airs the goal graphic when the clock passes the goal
    await page.locator('input[type="range"]').fill('1080');
    await page.locator('input[type="range"]').fill('1092');
    await expect(page.locator('.pb-goal')).toBeVisible();
    await expect(page.locator('.pb-goal__scorer')).not.toBeEmpty();
    // manual cue: Narrative VAR banner with a verdict
    await page.getByRole('button', { name: /^Check on air/ }).click();
    await expect(page.locator('.pb-var__status:not([data-status="checking"])')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('c');
    await expect(page.locator('.pb-var')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('AI Studio runs a bounded debate with three pundits and a verdict', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'AI Studio' }).click();
    await expect(page.getByText('Alex Mercer')).toBeVisible();
    await expect(page.getByText('Mateo Reyes')).toBeVisible();
    await expect(page.getByText('Sofia Hart')).toBeVisible();
    await page.getByRole('button', { name: 'Start debate' }).click();
    await expect(page.getByText('Player of the Match · AI roundtable verdict')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.verdict__name')).not.toBeEmpty();
  });

  test('Match Recap renders fan and analyst modes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Match Recap' }).click();
    await expect(page.getByText('The story')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Analyst mode' }).click();
    await expect(page.getByText('The analysis')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.candidate-table')).toBeVisible();
  });
});
