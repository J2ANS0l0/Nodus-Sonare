import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login_page';
import { SideNav } from '../pages/side_nav';
import { PostPage } from '../pages/post_page';
import { GraphPage } from '../pages/graph_page';
import { PlayerBar } from '../pages/player_bar';
import { album_source_for, audio_files_in } from '../support/track_sources';
import { ALBUM_DIR, REUSE_EXISTING_USER, SMOKE_GENERAL_TAG, SMOKE_USER } from '../support/test_data';

test.describe('Smoke', () => {
  test('register, post an album, play it at random from Explore and log out @smoke', async ({ page, browserName }) => {
    const login = new LoginPage(page);
    const nav = new SideNav(page);
    const post = new PostPage(page);
    const graph = new GraphPage(page);
    const player = new PlayerBar(page);
    const album_files = audio_files_in(ALBUM_DIR);
    const album_source = album_source_for(browserName, ALBUM_DIR);

    await PlayerBar.install_audio_probe(page);

    await test.step(`register ${SMOKE_USER.username}`, async () => {
      await login.open();
      const created = await login.register_or_login(SMOKE_USER, REUSE_EXISTING_USER);
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

    await test.step(`Post: ${album_source.description} from album/ and tag it "${SMOKE_GENERAL_TAG}"`, async () => {
      await nav.go_to('Post');
      await post.expect_visible();
      await post.add_tracks(album_source, album_files.length);
      await post.ensure_album_name(`${SMOKE_USER.username} album`);
      await post.set_artist(SMOKE_USER.username);
      await post.set_general_tag(SMOKE_GENERAL_TAG);
      await post.create_album();
      await nav.expect_selected('Home');
    });

    await test.step(`Explore: select ${SMOKE_USER.username} and press random`, async () => {
      await nav.go_to('Explore');
      // The album is in the graph with the general tag typed in Post, linked to its author
      await graph.expect_node(SMOKE_GENERAL_TAG);
      await graph.select_node(SMOKE_USER.username);
      await player.shuffle();
      await player.expect_playing_from(SMOKE_USER.username);
    });

    await test.step('seek the track to its end', async () => {
      const title = await player.current_title();
      expect(title).not.toBe('');
      await player.seek_to_end();
      await player.expect_track_ended();
    });

    await test.step('log out', async () => {
      await nav.logout();
      await login.expect_visible();
    });
  });
});
