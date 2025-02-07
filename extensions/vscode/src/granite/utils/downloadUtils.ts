import { createWriteStream } from "fs";
import * as fs from "fs/promises";
import * as path from 'path';
import { Readable } from "stream";

import fetch from "node-fetch";
import { CancellationToken, Progress } from "vscode";

import { checkFileExists } from './fsUtils';
import { ProgressReporter } from "core/granite/commons/progressData";

export async function downloadFileFromUrl(
  url: string,
  destinationPath: string,
  token: CancellationToken,
  progressReporter: ProgressReporter
) {
  const fileName = destinationPath.split("/").pop()!;
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  const response = await fetch(url, { signal: controller.signal });

  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}`);
  }
  const totalBytes = parseInt(response.headers.get('Content-Length') || '0');
  progressReporter.begin("Downloading Ollama", totalBytes);
  const body = response.body;
  if (!body) {
    throw new Error(`Failed to download ${fileName}`);
  }

  const writer = createWriteStream(destinationPath);
  await new Promise((resolve, reject) => {
    const reader = Readable.from(body);

    reader.on('data', (chunk) => {
      progressReporter.update(chunk.length);
    });

    reader.pipe(writer)
      .on('finish', resolve)
      .on('error', reject);
  });

  if (!(await checkFileExists(destinationPath))) {
    throw new Error(`${destinationPath} doesn't exist`);
  }
  progressReporter.done();
}