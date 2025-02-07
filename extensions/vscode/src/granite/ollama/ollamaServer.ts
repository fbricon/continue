import os from "os";
import path from 'path';

import { DEFAULT_MODEL_GRANITE_LARGE, DEFAULT_MODEL_GRANITE_SMALL } from "core/config/default";
import { EXTENSION_ID } from "core/granite/commons/constants";
import { DEFAULT_MODEL_INFO, ModelInfo } from "core/granite/commons/modelInfo";
import { getStandardName } from "core/granite/commons/naming";
import { ProgressData, ProgressReporter } from "core/granite/commons/progressData";
import { ModelStatus, ServerStatus } from "core/granite/commons/statuses";
import { CancellationToken, env, ExtensionContext, ProgressLocation, Uri, window } from "vscode";

import { IModelServer } from "../modelServer";
import { terminalCommandRunner } from "../terminal/terminalCommandRunner";
import { executeCommand } from "../utils/cpUtils";
import { downloadFileFromUrl } from "../utils/downloadUtils";

import { getRemoteModelInfo } from "./ollamaLibrary";
import { isOllamaInstalled, startLocalOllama } from "core/util/ollamaHelper";

const PLATFORM = os.platform();

export class OllamaServer implements IModelServer {

  private currentStatus = ServerStatus.unknown;
  protected installingModels = new Set<string>();
  private modelInfoPromises: Map<string, Promise<ModelInfo | undefined>> = new Map();
  private modelInfoResults: Map<string, ModelInfo | undefined> = new Map();
  constructor(private context: ExtensionContext, private name: string = "Ollama", private serverUrl = "http://localhost:11434") { }

  getName(): string {
    return this.name;
  }

  async supportedInstallModes(): Promise<{ id: string; label: string, supportsRefresh: boolean }[]> {
    const modes = [];
    if (isLinux()) {
      if (isDevspaces()) {
        // sudo is not available in devspaces, so we can't use ollama's or manual install script
        return [{ id: "devspaces", label: "See Red Hat Dev Spaces instructions", supportsRefresh: false }];
      } else {
        // on linux
        modes.push({ id: "script", label: "Install with script", supportsRefresh: true });
      }
    }
    if (await isHomebrewAvailable()) {
      // homebrew is available
      modes.push({ id: "homebrew", label: "Install with Homebrew", supportsRefresh: true });
    }
    if (isWin()) {
      modes.push({ id: "windows", label: "Install automatically", supportsRefresh: true });
    }
    modes.push({ id: "manual", label: "Install manually", supportsRefresh: true });
    return modes;
  }

  async getStatus(): Promise<ServerStatus> {
    let isStarted = false;
    try {
      isStarted = await this.isServerStarted();
    } catch (e) {
    }
    if (isStarted) {
      this.currentStatus = ServerStatus.started;
    } else {
      const ollamaInstalled = await this.isServerInstalled();
      if (this.currentStatus !== ServerStatus.installing) {
        this.currentStatus = (ollamaInstalled) ? ServerStatus.stopped : ServerStatus.missing;
      }
    }
    return this.currentStatus;
  }

  async isServerInstalled(): Promise<boolean> {
    return isOllamaInstalled();
  }

  async isServerStarted(): Promise<boolean> {
    //check if ollama is installed
    try {
      await this.getTags();
      //console.log("Ollama server is started");
      return true;
    } catch (error: any) {
      //TODO Check error
      //console.log("Ollama server is NOT started", error?.message);
      return false;
    }
  }

  async startServer(): Promise<boolean> {
    //FIXME startLocalOllama(IDE) exists in core/util/ollamaHelper.ts, but we don't have the IDE instance here;

    let startCommand: string | undefined;
    if (isWin()) {
      startCommand = [
        `$ErrorActionPreference = "Stop"`,
        `& "ollama app.exe"`,
      ].join(' ; ');
    } else if (isMac()) {
      startCommand = [
        //'set -e',  // Exit immediately if a command exits with a non-zero status
        'open -a Ollama.app',
      ].join(' && ');
    } else {//Linux
      const start_ollama_sh = path.join(this.context.extensionPath, 'start_ollama.sh');
      startCommand = [
        //'set -e',  // Exit immediately if a command exits with a non-zero status
        `chmod +x "${start_ollama_sh}"`,  // Ensure the script is executable
        `"${start_ollama_sh}"`,  // Use quotes in case the path contains spaces
      ].join(' && ');
    }
    if (startCommand) {
      await terminalCommandRunner.runInTerminal(
        startCommand,
        {
          name: "Start Ollama",
          show: true,
        }
      );
      return true;
    }
    return false;
  }

  async installServer(mode: string, token: CancellationToken, reportProgress: (progress: ProgressData) => void): Promise<boolean> {
    let installCommand: string | undefined;
    switch (mode) {
      case "devspaces": {
        env.openExternal(Uri.parse("https://developers.redhat.com/articles/2024/08/12/integrate-private-ai-coding-assistant-ollama"));
        return false;
      }
      case "homebrew": {
        installCommand = [
          'clear',
          'set -e',  // Exit immediately if a command exits with a non-zero status
          'brew install --cask ollama',
          'sleep 3',
          'ollama list',  // run ollama list to start the server
        ].join(' && ');
        break;
      }
      case "script":
        const start_ollama_sh = path.join(this.context.extensionPath, 'start_ollama.sh');
        installCommand = [
          'clear',
          'set -e',  // Exit immediately if a command exits with a non-zero status
          'command -v curl >/dev/null 2>&1 || { echo >&2 "curl is required but not installed. Aborting."; exit 1; }',
          'curl -fsSL https://ollama.com/install.sh | sh',
          `chmod +x "${start_ollama_sh}"`,  // Ensure the script is executable
          `"${start_ollama_sh}"`,  // Use quotes in case the path contains spaces
        ].join(' && ');
        break;
      case "windows":
        this.currentStatus = ServerStatus.installing;
        const ollamaInstallerPath = await this.downloadOllamaInstaller(token, reportProgress);
        if (!ollamaInstallerPath) {
          return false;
        }
        //At this point the file is guaranteed to exist
        installCommand = [
          'clear',
          `$ErrorActionPreference = "Stop"`,
          `& "${ollamaInstallerPath}" /Silent`,
          `$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")`, // refresh environment variables in the terminal
        ].join(' ; ');
        break;
      case "manual":
      default:
        env.openExternal(Uri.parse("https://ollama.com/download"));
        return true;
    }
    if (installCommand) {
      this.currentStatus = ServerStatus.installing;//We need to detect the terminal output to know when installation stopped (successfully or not)
      await terminalCommandRunner.runInTerminal(
        installCommand,
        {
          name: "Granite Models Setup",
          show: true,
        }
      );
    }
    return true;
  }

  async downloadOllamaInstaller(token: CancellationToken, reportProgress: (progress: ProgressData) => void): Promise<string | undefined> {
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const ollamaInstallerPath = path.join(os.tmpdir(), EXTENSION_ID, `OllamaSetup-${randomSuffix}.exe`);
      await downloadFileFromUrl("https://ollama.com/download/OllamaSetup.exe", ollamaInstallerPath, token, new DownloadingProgressReporter(reportProgress));
      return ollamaInstallerPath;
  }


  async getModelStatus(modelName?: string): Promise<ModelStatus> {
    if (!modelName || this.currentStatus !== ServerStatus.started) {
      return ModelStatus.unknown;
    }
    // Check if the model is currently being installed
    if (this.installingModels.has(modelName)) {
      return ModelStatus.installing;
    }

    let status = ModelStatus.missing;
    try {
      const models = await this.getTags();
      modelName = getStandardName(modelName);
      const model = models.find((tag: any) => tag.name === modelName);
      if (model) {
        status = ModelStatus.installed;
        // Query the model info - once - from the remote server, in the background, to avoid blocking the UI.
        // modelInfoResults will be updated with the most recent info once it's available
        if (!this.modelInfoPromises.has(modelName)) {
          this.modelInfoPromises.set(modelName, this.fetchModelInfo(modelName));
        }
        //It's installed, but is it the most recent version?
        const cachedInfo = this.modelInfoResults.get(modelName);
        //cachedInfo.digest should be a substring of model.digest if the model is not stale
        if (cachedInfo && !model.digest.startsWith(cachedInfo.digest)) {
          // Since the digests differ, we assume a more recent version is available
          status = ModelStatus.stale;
        }
      }
    } catch (error) {
      console.log(`Error getting ${modelName} status:`, error);
      status = ModelStatus.unknown;
    }
    return status;
  }

  private cachedTags?: { timestamp: number, tags: any[] };

  async getTags(): Promise<any[]> {
    if (!this.cachedTags || (Date.now() - this.cachedTags.timestamp) > 100) {//cache for 100ms
      this.cachedTags = {
        timestamp: Date.now(),
        tags: await this._getTags(),
      };
    }
    return this.cachedTags.tags;
  }

  async _getTags(): Promise<any[]> {
    const json = (
      await fetch(`${this.serverUrl}/api/tags`)
    ).json() as any;
    const rawModels = (await json)?.models || [];
    return rawModels;
  }

  async listModels(): Promise<string[]> {
    const json = (
      await fetch(`${this.serverUrl}/v1/models`)
    ).json() as any;
    const rawModels = (await json)?.data;
    const models = rawModels ? rawModels.map((model: any) => model.id) : [];
    return models;
  }

  async pullModels(type: string, token: CancellationToken, reportProgress: (progress: ProgressData) => void): Promise<boolean> {
    const graniteModel = (type === 'large') ? DEFAULT_MODEL_GRANITE_LARGE : DEFAULT_MODEL_GRANITE_SMALL;
    const models: string[] = [graniteModel.model, 'nomic-embed-text:latest'];
    const abortController = new AbortController();
    token.onCancellationRequested(() => {
      abortController.abort();
    });

    const modelInfos: ModelInfo[] = [];
    const signal = abortController.signal;
    for (const model of models) {
      if (token.isCancellationRequested) {
        return false;
      }
      const modelInfo = await this.fetchModelInfo(model, signal);
      if (!modelInfo) {
        throw new Error(`Failed to fetch ${model} manifest`);
      }
      modelInfos.push(modelInfo);
    }
    const expectedTotal = modelInfos.reduce((sum, modelInfo) => sum + modelInfo.size, 0);
    console.log(`Expected total: ${expectedTotal}`);
    const progressReporter = new DownloadingProgressReporter(reportProgress);
    progressReporter.begin("Downloading models", expectedTotal)
    for (const modelInfo of modelInfos) {
      if (token.isCancellationRequested) {
        return false;
      }
      await this._pullModel(modelInfo.id, progressReporter, signal);
    }
    progressReporter.done();
    return true;
  }

  async _pullModel(modelName: string, progressReporter: ProgressReporter, signal?: AbortSignal): Promise<void> {
    console.log(`Pulling ${modelName}`);
    const response = await fetch(`${this.serverUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
      signal,
    });
    const reader = response.body?.getReader();
    let currentProgress = 0;

    while (true) {
      const { done, value } = await reader?.read() || { done: true, value: undefined };
      if (done) {
        break;
      }

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        const data = JSON.parse(line);
        //console.log(data);
        if (data.total) {
          const completed = data.completed ? data.completed : 0;
          if (completed < currentProgress) {
            currentProgress = 0;
          }
          const increment = completed - currentProgress;
          progressReporter.update(increment, `Pulling ${modelName}`);
          currentProgress = completed;
        }
      }
    }
  }

  async getModelInfo(modelName: string): Promise<ModelInfo | undefined> {
    let modelInfo: ModelInfo | undefined;
    try {
      modelInfo = await getRemoteModelInfo(modelName);
    } catch (error) {
      console.log(`Failed to retrieve remote model info for ${modelName}: ${error}`);
    }
    return modelInfo || DEFAULT_MODEL_INFO.get(modelName);
  }

  private async fetchModelInfo(modelName: string, signal?: AbortSignal): Promise<ModelInfo | undefined> {
    try {
      const modelInfo = await getRemoteModelInfo(modelName, signal);
      this.modelInfoResults.set(modelName, modelInfo);
      return modelInfo;
    } catch (error) {
      console.log(`Failed to retrieve remote model info for ${modelName}:`, error);
      return undefined;
    }
  }
}

async function isHomebrewAvailable(): Promise<boolean> {
  if (isWin()) {
    //TODO Would that be an issue on WSL2?
    return false;
  }
  try {
    const result = await executeCommand("which", ["brew"]);
    return "brew not found" !== result;
  } catch (e) {
    return false;
  }
}

function isLinux(): boolean {
  return PLATFORM === "linux";
}

function isWin(): boolean {
  return PLATFORM.startsWith("win");
}

function isMac(): boolean {
  return PLATFORM === "darwin";
}

function isDevspaces() {
  //sudo is not available on Red Hat DevSpaces
  return process.env['DEVWORKSPACE_ID'] !== undefined;
}

class DownloadingProgressReporter implements ProgressReporter {
  private currentProgress = 0;
  name: string | undefined;
  total: number | undefined;
  constructor(private progress: (progress: ProgressData) => void) { }
  begin(name: string, total: number): void {
    this.name = name;
    this.total = total;
  }
  update(work: number, detail?: string): void {
    this.currentProgress += work;
    this.progress({
      key: this.name ?? 'Downloading',
      increment: work,
      status: detail,
      completed: this.currentProgress,
      total: this.total
    });
  }
  done(): void {
    this.update(this.total ?? 0);
  }
}