export const OLLAMA_STEP = 0;
export const MODELS_STEP = 1;
export const FINAL_STEP = 2;

export type ModelType = "large" | "small";

export interface WizardState {
    stepStatuses: boolean[],
    selectedModelSize: ModelType | undefined
  }