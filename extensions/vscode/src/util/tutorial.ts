import { IDE } from "core";
import * as vscode from "vscode";

import { getExtensionUri } from "./vscode";

const TUTORIAL_FILE_NAME = "continue_tutorial.py";
export function getTutorialUri(): vscode.Uri {
  return vscode.Uri.joinPath(getExtensionUri(), TUTORIAL_FILE_NAME);
}

export function isTutorialFile(uri: vscode.Uri) {
  return uri.path.endsWith(TUTORIAL_FILE_NAME);
}

export async function showTutorial(ide: IDE, tutorialUri = getTutorialUri()) {
  // Ensure keyboard shortcuts match OS
  if (process.platform !== "darwin") {
    let tutorialContent = await ide.readFile(tutorialUri.toString());
    const newTutorialContent = tutorialContent.replace("⌘", "^").replace("Cmd", "Ctrl");
    if (tutorialContent !== newTutorialContent) {
      await ide.writeFile(tutorialUri.toString(), newTutorialContent);
    }
  }

  const doc = await vscode.workspace.openTextDocument(tutorialUri);
  await vscode.window.showTextDocument(doc, {
    preview: false,
  });
}
