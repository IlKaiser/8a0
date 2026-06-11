import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

test('blind draft restricts picks to the imposed role', async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  await host.goto('/');
  await host.getByTestId('nickname').fill('Ann');
  await host.getByTestId('create').click();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  await guest.goto('/');
  await guest.getByTestId('nickname').fill('Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('join').click();
  await host.getByTestId('timer').selectOption('0');
  await host.getByTestId('draft-mode').selectOption('blind');
  await host.getByTestId('start').click();
  await host.getByTestId('formation-4-4-2').click();
  await guest.getByTestId('formation-4-3-3').click();

  for (let pickNum = 0; pickNum < 22; pickNum++) {
    await expect(host.getByTestId('pick-counter')).toHaveText(`Pick ${pickNum + 1}/22`);
    await expect(host.getByTestId('required-role')).toBeVisible();
    if (pickNum === 6) await host.screenshot({ path: '/tmp/otto-blind.png' });
    const active = (await host.getByTestId('your-turn').count()) > 0 ? host : guest;
    // make sure the active page has caught up to this pick before reading the banner
    await expect(active.getByTestId('pick-counter')).toHaveText(`Pick ${pickNum + 1}/22`);
    await expect(active.getByTestId('your-turn')).toBeVisible();
    // role text like "you must pick a DEFENDER"
    const roleText = (await active.getByTestId('required-role').textContent()) ?? '';
    const role = (roleText.match(/GOALKEEPER|DEFENDER|MIDFIELDER|FORWARD/) ?? [''])[0];
    const pos = { GOALKEEPER: 'GK', DEFENDER: 'DF', MIDFIELDER: 'MF', FORWARD: 'FW' }[role]!;
    const enabled = active.locator('[data-testid^="squad-player-"]:enabled');
    // every enabled player in the card is of the imposed role
    const count = await enabled.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(enabled.nth(i).locator('.pos')).toHaveText(pos);
    }
    await enabled.first().click();
    await active.locator('[data-eligible="true"]').first().click();
  }
  await expect(host.getByTestId('champion')).toBeVisible({ timeout: 90_000 });
});
