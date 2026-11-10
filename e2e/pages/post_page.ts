import { expect, type Locator, type Page } from '@playwright/test';
import type { TrackSource } from '../support/track_sources';

/** "Post" overlay: creates an album from audio files. */
export class PostPage {
  private readonly container: Locator;
  private readonly album_name: Locator;
  private readonly artist_name: Locator;
  private readonly general_tag: Locator;
  private readonly drop_zone: Locator;
  private readonly notice: Locator;
  private readonly error: Locator;
  private readonly create_button: Locator;

  constructor(private readonly page: Page) {
    this.container = page.locator('.post_container');
    this.album_name = this.container.getByPlaceholder('Name your album');
    this.artist_name = this.container.getByPlaceholder('e.g. C418');
    this.general_tag = this.container.getByPlaceholder('e.g. Soundtrack, Indie, Electronic');
    this.drop_zone = this.container.locator('.drop_zone');
    this.notice = this.container.locator('.drop_notice');
    this.error = this.container.locator('.error_msg');
    this.create_button = this.container.locator('button.save_btn');
  }

  async expect_visible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /** Adds the tracks through the given source and waits for the form to list them. */
  async add_tracks(source: TrackSource, expected_count: number): Promise<void> {
    await source.add_to(this.page, this.drop_zone);
    await expect(this.notice).toContainText(`${expected_count} track${expected_count === 1 ? '' : 's'} added`);
    await expect(this.container.locator('.track_input_group')).toHaveCount(expected_count);
  }

  /** The album name is filled from the ID3 tags; it is only typed when the tags did not bring one. */
  async ensure_album_name(fallback: string): Promise<void> {
    if (!(await this.album_name.inputValue())) await this.album_name.fill(fallback);
  }

  async set_artist(name: string): Promise<void> {
    await this.artist_name.fill(name);
  }

  /** Replaces whatever genre the tags put in the field. */
  async set_general_tag(tag: string): Promise<void> {
    await this.general_tag.fill(tag);
    await expect(this.general_tag).toHaveValue(tag);
  }

  async create_album(): Promise<void> {
    await this.create_button.click();
    // On success the overlay closes; on failure it stays open with the backend message
    await expect(this.error, 'album upload error').toBeHidden();
    await expect(this.container).toBeHidden({ timeout: 60_000 });
  }
}
