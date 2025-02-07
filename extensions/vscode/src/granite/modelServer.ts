import { ProgressData } from "core/granite/commons/progressData";
import { ModelStatus, ServerStatus } from "core/granite/commons/statuses";
import { CancellationToken } from "vscode";

export interface IModelServer {
  getName(): string;
  getStatus(): Promise<ServerStatus>;
  startServer(): Promise<boolean>;
  installServer(mode: string, token: CancellationToken, reportProgress: (progress: ProgressData) => void): Promise<boolean>;
  getModelStatus(modelName?: string): Promise<ModelStatus>
  supportedInstallModes(): Promise<{ id: string; label: string, supportsRefresh: boolean }[]>; //manual, script, homebrew
  listModels(): Promise<string[]>;
  //getModelInfo(modelName: string): Promise<ModelInfo | undefined>;
}
