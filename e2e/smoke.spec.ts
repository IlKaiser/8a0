import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('two players complete a full game: draft, tournament, results', async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);

  // Home: create + join
  await host.goto('/');
  await host.getByTestId('nickname').fill('Ann');
  await host.getByTestId('create').click();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z]{5}$/);

  await guest.goto('/');
  await guest.getByTestId('nickname').fill('Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('join').click();

  // Lobby: disable the turn timer so the test controls every pick
  await host.getByTestId('timer').selectOption('0');
  await host.getByTestId('start').click();

  // Formations
  await host.getByTestId('formation-4-4-2').click();
  await guest.getByTestId('formation-4-3-3').click();

  // Draft: 22 exclusive picks, alternating per the snake order
  for (let pickNum = 0; pickNum < 22; pickNum++) {
    await expect(host.getByTestId('pick-counter'))
      .toHaveText(`Pick ${pickNum + 1}/22`);
    const active = (await host.getByTestId('your-turn').count()) > 0 ? host : guest;
    await expect(active.getByTestId('your-turn')).toBeVisible();
    await active.locator('[data-testid^="squad-player-"]:enabled').first().click();
    await active.locator('[data-eligible="true"]').first().click();
  }

  // Tournament reveals, then both clients see the champion
  await expect(host.getByTestId('champion')).toBeVisible({ timeout: 60_000 });
  await expect(guest.getByTestId('champion')).toBeVisible();

  // Host can trigger a rematch back to formation pick
  await host.getByTestId('rematch').click();
  await expect(host.getByTestId('formation-4-4-2')).toBeVisible();
  await expect(guest.getByTestId('formation-4-3-3')).toBeVisible();
});
