import { getVirtualConfigYamlContent } from "core/config/yaml/VirtualConfigYamlSupport";
import * as vscode from "vscode";

import { getExtensionVersion } from "../util/util";

import { GRANITE_CODE_CONFIG_SCHEME } from "./VirtualConfigUris";

export function registerVirtualConfigDocumentProvider(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(
    GRANITE_CODE_CONFIG_SCHEME,
    new VirtualConfigYamlDocumentProvider(),
  );
}

class VirtualConfigYamlDocumentProvider
  implements vscode.TextDocumentContentProvider
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    let slug = uri.path;
    if (slug.endsWith(".yaml")) {
      slug = slug.slice(0, -5); // Remove the .yaml extension
    }
    const content = await getVirtualConfigYamlContent(
      slug,
      getExtensionVersion(),
    );
    if (content) {
      return content;
    }
    return "";
  }

  update(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }
}
