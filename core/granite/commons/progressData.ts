export interface ProgressData {
  key: string;
  increment: number,
  status: string;
  completed?: number; // number of bytes already completed
  total?: number; // total number of bytes
}

export interface ProgressReporter {
  update(name: string, work: number): void;
}