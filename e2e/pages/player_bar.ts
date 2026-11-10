import { expect, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __e2e_audio?: { ended: string[] };
  }
}

/** Bottom player: controls, progress bar and the track being played. */
export class PlayerBar {
  private readonly root: Locator;
  private readonly title: Locator;
  private readonly author: Locator;
  private readonly elapsed: Locator;
  private readonly duration: Locator;
  private readonly progress_track: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('.player_bar');
    this.title = this.root.locator('.player_title');
    this.author = this.root.locator('.player_author');
    this.elapsed = this.root.locator('.player_time').first();
    this.duration = this.root.locator('.player_time').last();
    this.progress_track = this.root.locator('.player_progress_track');
  }

  /**
   * The player uses `new Audio()`, which is never attached to the DOM. This init script records the
   * `ended` events of every media element so the test can prove a track really played to its end.
   * Must run before the page loads.
   */
  static async install_audio_probe(page: Page): Promise<void> {
    await page.addInitScript(() => {
      window.__e2e_audio = { ended: [] };
      const original_play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (!(this as any).__e2e_probe) {
          (this as any).__e2e_probe = true;
          this.addEventListener('ended', () => window.__e2e_audio!.ended.push(this.currentSrc || this.src));
        }
        return original_play.call(this);
      };
    });
  }

  /** "Random" button (`ctrl_btn icon_btn`, aria-label Shuffle). */
  async shuffle(): Promise<void> {
    await this.root.locator('button.ctrl_btn.icon_btn[aria-label="Shuffle"]').click();
  }

  async expect_playing_from(author: string): Promise<void> {
    await expect(this.title).not.toBeEmpty();
    await expect(this.author).toHaveText(author);
    await expect(this.root.getByRole('button', { name: 'Pause' })).toBeVisible();
    // Duration is known once the audio metadata loaded
    await expect(this.duration).not.toHaveText('0:00');
  }

  async current_title(): Promise<string> {
    return (await this.title.textContent()) ?? '';
  }

  /** Drags the progress thumb to the right edge of the bar: the track jumps to its end. */
  async seek_to_end(): Promise<void> {
    const box = await this.progress_track.boundingBox();
    if (!box) throw new Error('progress bar is not visible');
    const y = box.y + box.height / 2;
    await this.page.mouse.move(box.x + box.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width + 5, y, { steps: 5 }); // past the edge: ratio is clamped to 1
    await this.page.mouse.up();
  }

  async expect_track_ended(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.__e2e_audio?.ended.length ?? 0), {
        message: 'the audio fired "ended"',
      })
      .toBeGreaterThan(0);
  }
}
