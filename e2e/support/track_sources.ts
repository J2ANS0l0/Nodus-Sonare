import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

const AUDIO_EXTENSIONS: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
};

/** Audio files of a folder on disk, ordered by name. */
export function audio_files_in(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => path.extname(name).toLowerCase() in AUDIO_EXTENSIONS)
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * How the tracks reach the Post form (OCP + DIP).
 * PostPage depends on this abstraction, not on a concrete gesture: a new way to add tracks
 * (another input, a paste, a folder picker) is a new class, and PostPage does not change.
 */
export interface TrackSource {
  readonly description: string;
  add_to(page: Page, drop_zone: Locator): Promise<void>;
}

/** Drags the files from the OS and drops them on the drop zone, the way a user drops the album/ folder. */
export class DragAndDropSource implements TrackSource {
  readonly description: string;

  constructor(private readonly files: string[]) {
    this.description = `drop ${files.length} file(s)`;
  }

  static from_folder(dir: string): DragAndDropSource {
    return new DragAndDropSource(audio_files_in(dir));
  }

  async add_to(page: Page, drop_zone: Locator): Promise<void> {
    const payload = this.files.map((file) => ({
      name: path.basename(file),
      type: AUDIO_EXTENSIONS[path.extname(file).toLowerCase()],
      base64: fs.readFileSync(file).toString('base64'),
    }));

    // A DataTransfer built in the page carries real File objects, like a drag from the file manager
    const data_transfer = await page.evaluateHandle((files) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      return dt;
    }, payload);

    await drop_zone.dispatchEvent('dragenter', { dataTransfer: data_transfer });
    await drop_zone.dispatchEvent('dragover', { dataTransfer: data_transfer });
    await drop_zone.dispatchEvent('drop', { dataTransfer: data_transfer });
    await data_transfer.dispose();
  }
}

/** Selects the files with the "click to select several" input of the drop zone. */
export class FilePickerSource implements TrackSource {
  readonly description: string;

  constructor(private readonly files: string[]) {
    this.description = `pick ${files.length} file(s)`;
  }

  async add_to(_page: Page, drop_zone: Locator): Promise<void> {
    await drop_zone.locator('input[type="file"]').setInputFiles(this.files);
  }
}
