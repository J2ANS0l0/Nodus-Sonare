import { test } from '@playwright/test';
import { LoginPage } from '../pages/login_page';
import { SideNav } from '../pages/side_nav';
import { GraphPage } from '../pages/graph_page';
import { ProfilePage } from '../pages/profile_page';
import { AccountSeed } from '../support/account_seed';
import { AVATAR_FILE, PROFILE_USER } from '../support/test_data';

test.describe('Profile', () => {
  // Precondition: the journey starts by logging in, so the account must already exist.
  // Created through the API (idempotent), not through the register form that the other journeys already cover.
  test.beforeAll(async ({ playwright }, test_info) => {
    const api = await playwright.request.newContext({ baseURL: test_info.project.use.baseURL });
    try {
      await new AccountSeed(api).ensure_user(PROFILE_USER);
    } finally {
      await api.dispose();
    }
  });

  test('log in, change picture, description and color, and save @regression', async ({ page }) => {
    const login = new LoginPage(page);
    const nav = new SideNav(page);
    const graph = new GraphPage(page);
    const profile = new ProfilePage(page);

    // A new text on every run: if saving failed, the value left by a previous run could not make the test pass
    const description = `Perfil editado por el recorrido e2e (${new Date().toISOString()})`;
    let picture_url = '';
    let color = '';

    await test.step(`log in as ${PROFILE_USER.username}`, async () => {
      await login.open();
      await login.login(PROFILE_USER);
      await nav.expect_visible();
      await graph.expect_loaded();
    });

    await test.step('open Profile', async () => {
      await nav.go_to('Profile');
      await profile.expect_visible();
    });

    await test.step('change the profile picture', async () => {
      picture_url = await profile.change_picture(AVATAR_FILE);
    });

    await test.step('write a description and pick another color', async () => {
      await profile.set_description(description);
      color = await profile.choose_another_color();
    });

    await test.step('save changes', async () => {
      await profile.save();
      await nav.expect_selected('Home');
    });

    await test.step('the changes survive a new session', async () => {
      await nav.logout();
      await login.expect_visible();
      await login.login(PROFILE_USER);
      await graph.expect_loaded();
      await nav.go_to('Profile');
      await profile.expect_visible();
      await profile.expect_picture(picture_url);
      await profile.expect_description(description);
      await profile.expect_color(color);
    });
  });
});
