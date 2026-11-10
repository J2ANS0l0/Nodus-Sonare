import { expect, type Locator, type Page } from '@playwright/test';

/** "Profile" overlay: profile picture, description and node color of the logged-in author. */
export class ProfilePage {
  private readonly container: Locator;
  private readonly change_picture_button: Locator;
  private readonly avatar_image: Locator;
  private readonly description: Locator;
  private readonly swatches: Locator;
  private readonly error: Locator;
  private readonly save_button: Locator;

  constructor(private readonly page: Page) {
    this.container = page.locator('.profile_container');
    this.change_picture_button = this.container.getByRole('button', { name: /Change Profile Picture/ });
    this.avatar_image = this.container.locator('img.profile_avatar_image');
    this.description = this.container.getByPlaceholder('Tell us about yourself');
    this.swatches = this.container.getByRole('radiogroup', { name: 'Node color' }).getByRole('radio');
    this.error = this.container.locator('.error_msg');
    this.save_button = this.container.locator('button.save_btn');
  }

  async expect_visible(): Promise<void> {
    await expect(this.container).toBeVisible();
    // The palette comes from GET /api/palette: the form is ready when the swatches are drawn
    await expect(this.swatches.first()).toBeVisible();
  }

  /**
   * Clicks "[ Change Profile Picture ]" and picks the file in the file chooser, like a user does.
   * The picture is saved right away (it does not wait for "Save Changes"). Returns its public URL.
   */
  async change_picture(file: string): Promise<string> {
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), this.change_picture_button.click()]);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/profile/picture') && r.request().method() === 'POST'),
      chooser.setFiles(file),
    ]);
    expect(response.status(), 'POST /api/profile/picture').toBe(200);
    const url: string = (await response.json()).node.author_profile_picture;
    await this.expect_picture(url);
    return url;
  }

  /** The avatar shows that URL and the browser could actually load the image. */
  async expect_picture(url: string): Promise<void> {
    await expect(this.avatar_image).toHaveAttribute('src', url);
    await expect
      .poll(() => this.avatar_image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), {
        message: 'the profile picture loaded',
      })
      .toBe(true);
  }

  async set_description(text: string): Promise<void> {
    await this.description.fill(text);
  }

  async expect_description(text: string): Promise<void> {
    await expect(this.description).toHaveValue(text);
  }

  async selected_color(): Promise<string | null> {
    const selected = this.swatches.and(this.page.locator('[aria-checked="true"]'));
    return (await selected.count()) ? selected.getAttribute('title') : null;
  }

  /** Picks the first palette color that is not the current one, so the change is always visible. Returns it. */
  async choose_another_color(): Promise<string> {
    const current = (await this.selected_color())?.toLowerCase();
    const titles = await this.swatches.evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
    const color = titles.find((t) => t.toLowerCase() !== current);
    if (!color) throw new Error('the palette has no other color to choose');
    const swatch = this.swatches.and(this.page.locator(`[title="${color}"]`));
    await swatch.click();
    await expect(swatch).toHaveAttribute('aria-checked', 'true');
    return color;
  }

  async expect_color(color: string): Promise<void> {
    expect((await this.selected_color())?.toLowerCase()).toBe(color.toLowerCase());
  }

  /** "Save Changes": on success the overlay closes; on failure it stays open with the backend message. */
  async save(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/profile/update') && r.request().method() === 'POST'),
      this.save_button.click(),
    ]);
    expect(response.status(), 'POST /api/profile/update').toBe(200);
    await expect(this.error, 'profile update error').toBeHidden();
    await expect(this.container).toBeHidden();
  }
}
