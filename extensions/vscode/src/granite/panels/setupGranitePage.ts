import * as fs from 'fs';
import { env } from 'process';

import { ConfigHandler } from 'core/config/ConfigHandler';
import { ConfiguredModels } from 'core/granite/commons/configuredModels';
import { isDevMode } from 'core/granite/commons/constants';
import { DOWNLOADABLE_MODELS } from 'core/granite/commons/modelRequirements';
import { ProgressData } from "core/granite/commons/progressData";
import { ModelStatus, ServerStatus } from 'core/granite/commons/statuses';
import {
  CancellationError,
  CancellationTokenSource,
  commands,
  Disposable,
  ExtensionContext,
  ExtensionMode,
  Uri,
  ViewColumn,
  Webview,
  WebviewPanel,
  window,
  workspace
} from "vscode";

import { MockServer } from '../ollama/mockServer';
import { OllamaServer } from "../ollama/ollamaServer";
import { Telemetry } from '../telemetry';
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { getSystemInfo } from "../utils/sysUtils";
import { EXTENSION_NAME } from 'core/control-plane/env';


/**
 * This class manages the state and behavior of HelloWorld webview panels.
 *
 * It contains all the data and methods for:
 *
 * - Creating and rendering HelloWorld webview panels
 * - Properly cleaning up and disposing of webview resources when the panel is closed
 * - Setting the HTML (and by proxy CSS/JavaScript) content of the webview panel
 * - Setting message listeners so data can be passed between the webview and extension
 */

type GraniteConfiguration = {
  tabModelId: string | null;
  chatModelId: string | null;
  embeddingsModelId: string | null;
};

const useMockServer = env['MOCK_OLLAMA'] === 'true';

export class SetupGranitePage {
  public static currentPanel: SetupGranitePage | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private _fileWatcher: fs.FSWatcher | undefined;
  private server: OllamaServer;
  /**
   * The HelloWorldPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, context: ExtensionContext, private configHandler: ConfigHandler) {
    this._panel = panel;
    this.server = useMockServer ?
      new MockServer(300) :
      new OllamaServer(context);
    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content for the webview panel
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      context
    );

    // Set an event listener to listen for messages passed from the webview context
    this._setWebviewMessageListener(this._panel.webview);

    // Send a new status on configuration changes
    const cleanupConfigUpdate = configHandler.onConfigUpdate(({config}) => {
      this.publishStatus(this._panel.webview);
    });
    this._disposables.push(new Disposable(cleanupConfigUpdate));

    if (isDevMode) {
      this._setupFileWatcher(context);
    }
  }

  private _setupFileWatcher(context: ExtensionContext) {
    const webviewsBuildPath = Uri.joinPath(context.extensionUri, "gui", "assets");
    const webviewsBuildFsPath = webviewsBuildPath.fsPath;
    console.log("Watching " + webviewsBuildFsPath);

    let debounceTimer: NodeJS.Timeout | null = null;
    const debounceDelay = 100; //100 ms

    this._fileWatcher = fs.watch(webviewsBuildFsPath, (_event, filename) => {
      if (filename) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          console.log("File changed: " + filename + ", reloading webview");
          this.debounceStatus = 0;
          this._panel.webview.html = this._getWebviewContent(this._panel.webview, context);
          debounceTimer = null;
        }, debounceDelay);
      }
    });

    // Add the file watcher to disposables
    this._disposables.push(new Disposable(() => {
      if (this._fileWatcher) {
        this._fileWatcher.close();
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    }));
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(context: ExtensionContext, configHandler: ConfigHandler) {
    if (SetupGranitePage.currentPanel) {
      // If the webview panel already exists reveal it
      SetupGranitePage.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      // If a webview panel does not already exist create and show a new one
      const extensionUri = context.extensionUri;
      const panel = window.createWebviewPanel(
        // Panel view type
        "modelSetup",
        // Panel title
        "Setup Granite.Code",
        // The editor column the panel should be displayed in
        ViewColumn.One,
        // Extra panel configurations
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          retainContextWhenHidden: true,
          // Restrict the webview to only load resources from the `gui/assets` directory
          localResourceRoots: [
            Uri.joinPath(extensionUri, "gui"),
          ],
        }
      );

      SetupGranitePage.currentPanel = new SetupGranitePage(panel, context, configHandler);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    SetupGranitePage.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();
    this.modelInstallCanceller?.dispose();
    // Dispose of all disposables (including the file watcher)
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the React webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private _getWebviewContent(webview: Webview, context: ExtensionContext) {

    let stylesUri, scriptUri;
    const extensionUri = context.extensionUri;
    const vscMediaUrl = getUri(webview, extensionUri, ["gui"]).toString();

    if (context.extensionMode === ExtensionMode.Development) {
      scriptUri = "http://localhost:5173/src/granite/indexSetupGranite.tsx";
      stylesUri = "http://localhost:5173/src/granite/indexSetupGranite.css";
    } else {
      // The CSS file from the React build output
      stylesUri = getUri(webview, extensionUri, [
        "gui",
        "assets",
        "indexSetupGranite.css",
      ]);
      // The JS file from the React build output
      scriptUri = getUri(webview, extensionUri, [
        "gui",
        "assets",
        "indexSetupGranite.js",
      ]);
    }

    const inDevelopmentMode = context?.extensionMode === ExtensionMode.Development;

    const devStyleSrc = inDevelopmentMode ?  "http://localhost:5173" : "";
    const devConnectSrc = inDevelopmentMode ?  "ws://localhost:5173" : "";

    const nonce = getNonce();
    // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src ${webview.cspSource} ${devStyleSrc} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${devConnectSrc} 'self'; img-src https: ${webview.cspSource} data:">
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <title>Granite Models</title>
          </head>
          <body>
          <div id="root"></div>
          ${
            inDevelopmentMode
            ? `<script type="module" nonce="${nonce}">
            import RefreshRuntime from "http://localhost:5173/@react-refresh"
            RefreshRuntime.injectIntoGlobalHook(window)
            window.$RefreshReg$ = () => {}
            window.$RefreshSig$ = () => (type) => type
            window.__vite_plugin_react_preamble_installed__ = true
            </script>`
            : ""
          }
          <script type="module" nonce="${nonce}">
            window.graniteMediaUrl="${vscMediaUrl}";
            window.vscMediaUrl="${vscMediaUrl}";
          </script>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is recieved.
   *
   * @param webview A reference to the extension webview
   * @param context A reference to the extension context
   */
  private debounceStatus = 0;
  private modelInstallCanceller: CancellationTokenSource | undefined;
  private _setWebviewMessageListener(webview: Webview) {

    webview.onDidReceiveMessage(
      async (message: any) => {
        const command = message.command;
        const data = message.data;

        switch (command) {
          case "init":
            webview.postMessage({
              command: "init",
              data: {
                installModes: await this.server.supportedInstallModes(),
                systemInfo: await getSystemInfo()
              },
            });
            break;
          case "installOllama":
            await this.server.installServer(data.mode);
            break;
          case "showTutorial":
            await this.showTutorial();
            break;
          case "cancelModelInstallation":
            console.log("Cancelling model installation");
            this.modelInstallCanceller?.cancel();
            break;
          case "fetchStatus":
            const now = new Date().getTime();
            // Careful here, we're receiving 2 messages in Dev mode on useEffect, because <App> is wrapped with <React.StrictMode>
            // see https://stackoverflow.com/questions/60618844/react-hooks-useeffect-is-called-twice-even-if-an-empty-array-is-used-as-an-ar

            if (this.debounceStatus > 0) {
              const elapsed = now - this.debounceStatus;
              if (elapsed < 50) {
                console.log("Debouncing fetchStatus :" + elapsed);
                break;
              }
            }
            this.debounceStatus = now;

            this.publishStatus(webview);
            break;
          case "installModels":
            // Check if the server is running, if not, start it and wait for it to be ready until timeout is reached
            var { serverStatus, timeout } = await this.waitUntilOllamaStarts();

            if (serverStatus !== ServerStatus.started) {
              const errorMessage = `Ollama server failed to start in ${timeout / 1000} seconds`;
              console.error(errorMessage);
              webview.postMessage({
                command: "modelInstallationProgress",
                data: {
                  error: errorMessage,
                },
              });
              break;
            }
            console.log("Installing models");

            async function reportProgress(progress: ProgressData) {
              webview.postMessage({
                command: "modelInstallationProgress",
                data: {
                  progress,
                },
              });
            }
            this.modelInstallCanceller?.dispose();
            this.modelInstallCanceller = new CancellationTokenSource();
            try {
              const selectedModelSize = data.model as string;
              const result = await this.server.pullModels(selectedModelSize, this.modelInstallCanceller.token, reportProgress);
              if (result) {
                await this.saveSettings(selectedModelSize);
              }

            } catch (error: any) {
              console.error("Error during model installation", error);
              webview.postMessage({
                command: "modelInstallationProgress",
                data: {
                  error: error.message,
                },
              });
            }
        }
      },
      undefined,
      this._disposables
    );
  }

  private async waitUntilOllamaStarts() {
    let serverStatus = await this.server.getStatus();
    const timeout = 30000;
    const interval = 500;
    if (serverStatus !== ServerStatus.started) {
      console.log("Starting ollama server");
      await this.server.startServer();
      // Check if the server is running until timeout is reached
      for (let i = 0; i < timeout / interval; i++) {
        serverStatus = await this.server.getStatus();
        if (serverStatus === ServerStatus.started) {
          break;
        }
        console.log("Waiting for ollama server to start " + i);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    return { serverStatus, timeout };
  }

  async getConfiguredModels(): Promise<ConfiguredModels> {
    let { config } = await this.configHandler.loadConfig();
    if (!config) {
      throw new Error("Config not loaded");
    }

    let chatModel = null;
    let embeddingsModel = null;
    let tabAutocompleteModel = null;

    for (const model of config.models) {
      if (model.providerName === "ollama") {
        chatModel = model.model;
        break;
      }
    }

    for (const model of config.tabAutocompleteModels ?? []) {
      if (model.providerName === "ollama") {
        tabAutocompleteModel = model.model;
        break;
      }
    }

    if (config.embeddingsProvider.providerName === "ollama") {
      embeddingsModel = config.embeddingsProvider.model;
    }

    return {
      chat: chatModel,
      tabAutocomplete: tabAutocompleteModel,
      embeddings: embeddingsModel,
    };
  }

  async getModelStatuses(): Promise<Map<string, ModelStatus>> {
    const modelStatuses: Map<string, ModelStatus> = new Map();
    await Promise.all(DOWNLOADABLE_MODELS.map(async (id) => {
      const status = await this.server.getModelStatus(id);
      modelStatuses.set(id, status);
    }));
    return modelStatuses;
  }

  async publishStatus(webview: Webview) {
    // console.log("Received fetchStatus msg " + debounceStatus);
    const serverStatus = await this.server.getStatus();
    if (serverStatus === ServerStatus.stopped) {
      // TODO Try starting the server automatically or let the user start it manually?
      // await this.server.startServer();
      // serverStatus = await this.server.getStatus();
    }
    const modelStatuses = await this.getModelStatuses();
    const modelStatusesObject = Object.fromEntries(modelStatuses); // Convert Map to Object
    const configuredModels = await this.getConfiguredModels();
    webview.postMessage({
      command: "status",
      data: {
        serverStatus,
        configuredModels: configuredModels,
        modelStatuses: modelStatusesObject
      },
    });
  }

  async showTutorial() {
    await commands.executeCommand("granite.showTutorial");
  }

  async saveSettings(modelSize: string): Promise<void> {
    console.log("Saving settings for model size: " + modelSize);
    const config = workspace.getConfiguration(EXTENSION_NAME);
    await config.update('localModelSize', modelSize, true);
  }
}
