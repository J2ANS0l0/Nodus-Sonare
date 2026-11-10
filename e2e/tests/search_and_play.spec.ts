import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login_page';
import { SideNav } from '../pages/side_nav';
import { GraphPage } from '../pages/graph_page';
import { SearchBar } from '../pages/search_bar';
import { PlayerBar } from '../pages/player_bar';
import { CatalogSeed } from '../support/catalog_seed';
import { REUSE_EXISTING_USER, SEARCH_USER, SEED_PUBLISHER, SEED_TRACK } from '../support/test_data';

test.describe('Search', () => {
  // Precondition: an existing node to find. Seeded through the API so this journey does not depend
  // on the smoke test (or any other) having posted an album first.
  test.beforeAll(async ({ playwright }, test_info) => {
    const base_url = test_info.project.use.baseURL!;
    const api = await playwright.request.newContext({ baseURL: base_url });
    try {
      const result = await new CatalogSeed(api, base_url).ensure_track(SEED_PUBLISHER, SEED_TRACK);
      test_info.annotations.push({ type: 'seed', description: `"${SEED_TRACK.name}" ${result}` });
    } finally {
      await api.dispose();
    }
  });

  test('register, browse Explore, search an existing node and play it @regression', async ({ page }) => {
    const login = new LoginPage(page);
    const nav = new SideNav(page);
    const graph = new GraphPage(page);
    const search = new SearchBar(page);
    const player = new PlayerBar(page);

    await test.step(`register ${SEARCH_USER.username}`, async () => {
      await login.open();
      const created = await login.register_or_login(SEARCH_USER, REUSE_EXISTING_USER);
      test.info().annotations.push({
        type: 'user',
        description: created ? 'account created in this run' : 'account already existed, logged in',
      });
    });

    await test.step('wait for the home page', async () => {
      await nav.expect_visible();
      await nav.expect_selected('Home');
      await graph.expect_loaded();
    });

    await test.step('Explore: see the existing nodes', async () => {
      await nav.go_to('Explore');
      await graph.expect_node(SEED_TRACK.name);
      await graph.expect_node(SEED_PUBLISHER.username);
      const names = await graph.node_names();
      test.info().annotations.push({ type: 'explore', description: `${names.length} nodes visible` });
    });

    await test.step(`Search: look for "${SEED_TRACK.name}"`, async () => {
      await nav.go_to('Search');
      await search.expect_visible();
      await search.search(SEED_TRACK.name);
      // A single match: the graph keeps only the searched node
      await graph.expect_node_count(1);
      await graph.expect_node(SEED_TRACK.name);
    });

    await test.step('play the searched node', async () => {
      await graph.select_node(SEED_TRACK.name);
      await player.expect_playing_track(SEED_TRACK.name, SEED_PUBLISHER.username);
      expect(await player.current_title()).toBe(SEED_TRACK.name);
    });
  });
});
