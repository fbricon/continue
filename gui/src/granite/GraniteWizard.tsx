import React, { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { RadioGroup } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { StatusCheck, StatusValue } from './StatusCheck';
import { ServerStatus } from 'core/granite/commons/statuses';
import { VSCodeButton } from '../components/VSCodeButton';
import './GraniteWizard.css';
import { isHighEndMachine, SystemInfo } from 'core/granite/commons/sysInfo';
import { vscode } from './utils/vscode';
import { ProgressData } from 'core/granite/commons/progressData';

interface InstallationMode {
  id: string;
  label: string;
  supportsRefresh: boolean;
}

const OLLAMA_STEP = 0;
const MODELS_STEP = 1;
const FINAL_STEP = 2

enum WizardStatus {
  idle,
  downloadingOllama,
  startingOllama,
  downloadingModel
}

type ModelType = "large" | "small";


interface WizardContextProps {
  currentStatus: WizardStatus;
  setCurrentStatus: React.Dispatch<React.SetStateAction<WizardStatus>>;
  activeStep: number;
  setActiveStep: React.Dispatch<React.SetStateAction<number>>;
  stepStatuses: StatusValue[];
  setStepStatuses: React.Dispatch<React.SetStateAction<StatusValue[]>>;
  serverStatus: ServerStatus;
  setServerStatus: React.Dispatch<React.SetStateAction<ServerStatus>>;
  systemInfo: SystemInfo | null;
  setSystemInfo: React.Dispatch<React.SetStateAction<SystemInfo | null>>;
  installationModes: InstallationMode[];
  setInstallationModes: React.Dispatch<React.SetStateAction<InstallationMode[]>>;
  recommendedModel: ModelType;
  setRecommendedModel: React.Dispatch<React.SetStateAction<ModelType>>;
  selectedModel: ModelType;
  setSelectedModel: React.Dispatch<React.SetStateAction<ModelType>>;
  modelStatus: StatusValue;
  setModelStatus: React.Dispatch<React.SetStateAction<StatusValue>>;
  modelInstallationProgress: number;
  setModelInstallationProgress: React.Dispatch<React.SetStateAction<number>>;
  modelInstallationStatus: "idle" | "downloading" | "complete";
  setModelInstallationStatus: React.Dispatch<React.SetStateAction<"idle" | "downloading" | "complete">>;
}

const WizardContext = createContext<WizardContextProps | undefined>(undefined);

export const useWizardContext = (): WizardContextProps => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizardContext must be used within a WizardProvider');
  }
  return context;
};

interface WizardProviderProps {
  children: ReactNode;
}

export const WizardProvider: React.FC<WizardProviderProps> = ({ children }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<WizardStatus>(WizardStatus.idle);
  const [stepStatuses, setStepStatuses] = useState<StatusValue[]>(['missing', 'missing', 'missing']);
  const [serverStatus, setServerStatus] = useState<ServerStatus>(ServerStatus.unknown);
  const [modelStatus, setModelStatus] = useState<StatusValue>('missing');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [installationModes, setInstallationModes] = useState<InstallationMode[]>([]);
  const [recommendedModel, setRecommendedModel] = useState<ModelType>("small");
  const [selectedModel, setSelectedModel] = useState<ModelType>(recommendedModel);
  const [modelInstallationProgress, setModelInstallationProgress] = useState<number>(0);
  const [modelInstallationStatus, setModelInstallationStatus] = useState<"idle" | "downloading" | "complete">("idle");

  return (
    <WizardContext.Provider value={{
      currentStatus, setCurrentStatus,
      activeStep, setActiveStep,
      stepStatuses, setStepStatuses,
      serverStatus, setServerStatus,
      systemInfo, setSystemInfo,
      installationModes, setInstallationModes,
      recommendedModel, setRecommendedModel,
      selectedModel, setSelectedModel,
      modelStatus, setModelStatus,
      modelInstallationProgress, setModelInstallationProgress,
      modelInstallationStatus, setModelInstallationStatus,
    }}>
      {children}
    </WizardContext.Provider>
  );
};

interface ModelOption {
  key: ModelType;
  name: string;
  description: string;
}

interface StepProps {
  isActive: boolean;
  onClick?: () => void;
  status: StatusValue;
  title: string;
  children?: React.ReactNode;
}

const WizardStep: React.FC<StepProps> = ({ isActive, onClick, status, title, children }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick?.();
    }
  };

  return (
    <div
      className={`wizard-step ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
    >
      <div>
        <div className="flex items-center cursor-pointer">
          <StatusCheck type={isActive && status === 'missing'? 'partial': status} />
          <h3 className="ml-3 wizard-step-title inline">
            {title}
          </h3>
        </div>
        {isActive && <div className="ml-7">{children}</div>}
      </div>
    </div>
  );
};

const OllamaInstallStep: React.FC<StepProps> = (props) => {
  const { serverStatus, installationModes, setCurrentStatus } = useWizardContext();

  const handleDownload = () => {
    setCurrentStatus(WizardStatus.downloadingOllama);
    vscode.postMessage({
      command: "installOllama",
      data: {
        mode: installationModes[0].id,
      },
    });
  };

  const handleStartOllama = () => {
    setCurrentStatus(WizardStatus.startingOllama);
    vscode.postMessage({
      command: "startOllama",
    });

  };

  let serverButton: React.ReactNode;

if (serverStatus === ServerStatus.started) {
  serverButton = (
    <VSCodeButton variant='secondary' disabled>
      Complete!
    </VSCodeButton>
  );
} else if (serverStatus === ServerStatus.stopped) {
  serverButton = (
    // TODO let user choose between installing manually or automatically (via homebrew/script/installer)?
    <VSCodeButton onClick={handleStartOllama}>
      Start Ollama
    </VSCodeButton>
  );
} else {
  serverButton = (
    <VSCodeButton onClick={handleDownload}>
      Download and Install Ollama
    </VSCodeButton>
  );
}

  return (
    <WizardStep {...props}>
      <div className="mt-4">
        <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
          Ollama is an open source tool that allows running AI models locally. It is required by Granite.Code.
        </p>
        {serverButton}
        <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
          If you prefer, you can also <a href='https://ollama.com/download'>install Ollama manually</a>.
        </p>
      </div>
    </WizardStep>
  );
};

const ModelSelectionStep: React.FC<StepProps> = (props) => {
  const { serverStatus, recommendedModel, selectedModel, setSelectedModel, modelInstallationProgress, setModelInstallationProgress, modelInstallationStatus, setModelInstallationStatus } = useWizardContext();
  const progressInterval = useRef<NodeJS.Timeout>();

  const startDownload = () => {
    setModelInstallationStatus('downloading');
    vscode.postMessage({
      command: "installModels",
      data: {
        model: selectedModel,
      },
    });
  };

  const cancelDownload = () => {
    vscode.postMessage({
      command: "cancelModelInstallation",
    });
    setModelInstallationStatus('idle');
    setModelInstallationProgress(0);
  };

  useEffect(() => { //Clear progress interval on unmount
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const modelOptions: ModelOption[] = [
    {
      key: 'large',
      name: 'Large',
      description: 'For machines with 32GB of memory and a fast GPU',
    },
    {
      key: 'small',
      name: 'Small',
      description: 'For machines with less than 32GB of memory and slow graphics',
    },
  ];

  return (
    <WizardStep {...props}>
      {props.isActive && (
        <div className="mt-4">
          <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
            Select which model you want to use. You can change this preference in the settings.
          </p>
          <RadioGroup value={selectedModel} onChange={setSelectedModel} className="mt-4" disabled={modelInstallationStatus !== 'idle'}>
            <div className="space-y-4">
              {modelOptions.map((option) => (
                <RadioGroup.Option
                  key={option.key}
                  value={option.key}
                  className="relative flex cursor-pointer rounded focus:outline-none"
                >
                  {({ checked }) => (
                    <div className="flex w-full items-start mt-1">
                      <input
                        type="radio"
                        checked={checked}
                        readOnly
                        className="h-4 w-4 mt-2 border bg-transparent focus:ring-0 focus:ring-offset-0"
                        style={{ borderColor: 'var(--vscode-editor-foreground)' }}
                      />
                      <div className="ml-3 space-y-1">
                        <RadioGroup.Label style={{ color: 'var(--vscode-editor-foreground)', fontWeight: 'bold' }}>
                          {option.name}
                        </RadioGroup.Label>
                        <RadioGroup.Description className="text-sm leading-normal" style={{ color: 'var(--vscode-editor-foreground)', opacity: 0.8 }}>
                          {option.description}
                        </RadioGroup.Description>
                        {option.key === recommendedModel && (
                          <p className="text-sm leading-normal" style={{ color: 'var(--vscode-editorWarning-foreground, #ddb100)' }}>
                            Recommended for your machine
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </RadioGroup.Option>
              ))}
            </div>
          </RadioGroup>

          <div className="mt-4 flex items-center gap-2">
            {modelInstallationStatus === 'idle' && (
            <VSCodeButton
              onClick={startDownload}
              disabled={serverStatus !== ServerStatus.started}
              variant="primary"
            >
             Download
            </VSCodeButton>
            )}
            {modelInstallationStatus === 'complete' && (
            <VSCodeButton
              disabled={true}
              variant="secondary"
            >
               Complete!
            </VSCodeButton>
            )}
            {modelInstallationStatus === 'downloading' && (
              <>
                <VSCodeButton
                  variant="secondary"
                  onClick={cancelDownload}
                >
                  Cancel
                </VSCodeButton>

                <div //following code soup is to minimize text wiggling during progress updates
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    opacity: 0.8
                  }}
                >
                  <span className="inline-block text-right w-[55px] [font-variant-numeric:tabular-nums]">
                    {modelInstallationProgress.toFixed(2)}%
                  </span>
                  <span className="ml-1">complete</span>
                </div>
              </>
            )}
          </div>

          {/* {selectedModel === 'large' && (
            <div className="mt-4 flex items-start space-x-2">
              <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" style={{ color: 'var(--vscode-errorForeground, #f48771)' }} aria-hidden="true" />
              <span className="text-sm" style={{ color: 'var(--vscode-errorForeground, #f48771)' }}>
                Insufficient disk space available
              </span>
            </div>
          )} */}
          {serverStatus !== ServerStatus.started && (
            <div className="mt-4 flex items-start space-x-2">
              <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" style={{ color: 'var(--vscode-errorForeground, #f48771)' }} aria-hidden="true" />
              <span className="text-sm" style={{ color: 'var(--vscode-errorForeground, #f48771)' }}>
                Ollama must be started
              </span>
            </div>
          )}
        </div>
      )}
    </WizardStep>
  );
};

const StartLocalAIStep: React.FC<StepProps> = (props) => {
  const { setStepStatuses } = useWizardContext();
  const handleShowTutorial = async () => {
    console.log("show tutorial");
    setStepStatuses(prevStatuses => {
      const newStatuses = [...prevStatuses];
      newStatuses[FINAL_STEP] = 'complete';
      return newStatuses;
    });
    vscode.postMessage({
      command: "showTutorial",
    });
  };
  return (
    <WizardStep {...props}>
      {props.isActive && (
        <div className="mt-4">
          <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
            Granite.Code is ready to be used
          </p>
          <VSCodeButton
            className="mt-4"
            onClick={handleShowTutorial}
          >
            Open Tutorial
          </VSCodeButton>
        </div>
      )}
    </WizardStep>
  );
};

export const GraniteWizard: React.FC = () => {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  );
};

function requestStatus(): void {
  console.log("requestStatus");
  vscode.postMessage({
    command: "fetchStatus",
  });
}

function init(): void {
  vscode.postMessage({
    command: "init",
  });
}

const WizardContent: React.FC = () => {
  const { currentStatus, setCurrentStatus, activeStep, stepStatuses, setActiveStep, setStepStatuses, setServerStatus, setSystemInfo, setInstallationModes, setRecommendedModel, setSelectedModel, modelInstallationProgress ,setModelInstallationProgress, setModelInstallationStatus } = useWizardContext();
  const stepStatusesRef = useRef(stepStatuses);
  const currentStatusRef = useRef(currentStatus);
  // Update ref when stepStatuses changes
  useEffect(() => {
    stepStatusesRef.current = stepStatuses;
  }, [stepStatuses]);
  // Update ref when currentStatus changes
  useEffect(() => {
    currentStatusRef.current = currentStatus;
  }, [currentStatus]);

  const REFETCH_MODELS_INTERVAL_MS = 1500;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      const command: string | undefined = payload.command;
      if (!command) {
        return;
      }
      const currStepStatuses = stepStatusesRef.current;
      const currStatus = currentStatusRef.current;
      switch (command) {
        case "init": {
          const data = payload.data;
          setInstallationModes(data.installModes);
          const sysinfo = data.systemInfo as SystemInfo;
          setSystemInfo(sysinfo);
          const recommendedModel = isHighEndMachine(sysinfo) ? "large" : "small";
          setRecommendedModel(recommendedModel);
          setSelectedModel(recommendedModel);
          break;
        }
        case "status": {
          const data = payload.data;
          setServerStatus(data.serverStatus);
          const newStepStatuses = [...currStepStatuses];
          if (data.serverStatus !== ServerStatus.started) {
            //(re)set all step statuses if ollama is not started
            newStepStatuses.fill('missing');
          } else {
            //Ollama finished starting
            if (newStepStatuses[OLLAMA_STEP] !== 'complete') {
              //Set Ollama step as complete
              newStepStatuses[OLLAMA_STEP] = 'complete';
              //Activate Models step if it's not complete
              if (newStepStatuses[MODELS_STEP] !== 'complete') {
                setActiveStep(MODELS_STEP);
              }
            }
            if (currStatus === WizardStatus.downloadingOllama || currStatus === WizardStatus.startingOllama) {
              setCurrentStatus(WizardStatus.idle);
            }
          }
          setStepStatuses(newStepStatuses);
          break;
        }
        case "modelInstallationProgress": {
          const progress = payload.data?.progress as ProgressData | undefined;
          if (progress) {
            const progressPercentage = (progress.completed! / progress.total!) * 100;
            setModelInstallationProgress(progressPercentage);
            console.log("Model installation progress: " + progressPercentage);
            if (Number(progressPercentage.toFixed(4)) >= 100) {//FIXME: don't rely on percentage
              setStepStatuses(prevStatuses => {
                const newStatuses = [...prevStatuses];
                newStatuses[MODELS_STEP] = 'complete';
                return newStatuses;
              });
              setTimeout(() => {//Wait a bit before setting status to complete
                setModelInstallationStatus('complete');
                setTimeout(() => setActiveStep(FINAL_STEP), 250);
              }, 250);
            }
          }
          const error = payload.data?.error as string | undefined;
          if (error) {
            console.error("Model installation error: " + error);
            setModelInstallationProgress(0);
            //TODO: show error message
            //TODO Cancel download
          }

        }
      }
    };

    window.addEventListener('message', handleMessage);
    init(); // fetch system info once //FIXME diskspace can vary over time, might be moved to requestStatus()
    requestStatus(); // check ollama and models statuses
    const intervalId = setInterval(//Poll for ollama and models status updates
      requestStatus,
      REFETCH_MODELS_INTERVAL_MS
    );
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('message', handleMessage);
    };
  }, []);


  const steps = [
    { component: OllamaInstallStep, title: 'Download and install Ollama' },
    { component: ModelSelectionStep, title: 'Download a Granite model' },
    { component: StartLocalAIStep, title: 'Start using local AI' },
  ];

  return (
    <div className="h-full w-full" role="tablist">
      {/* Main container with responsive layout */}
      <div className="px-10 pt-1 max-w-[1400px] mx-10 [&:global]:min-w-[800px]:px-16 [&:global]:min-w-[800px]:pt-6">
        <div className="flex flex-col [&>*]:w-full" style={{ gap: '2rem' }}>
          {/* Left panel with text and steps */}
          <div className="max-w-[600px]" style={{ flex: '1 1 auto' }}>
            <h2 className="text-3xl font-normal mb-2" style={{ color: 'var(--vscode-foreground)' }}>
              Granite.Code
            </h2>
            <h2 className="text-2xl font-light mb-1" style={{ color: 'var(--vscode-foreground)' }}>
              Local AI setup
            </h2>
            <p className="mb-8" style={{ color: 'var(--vscode-descriptionForeground)' }}>
              Follow these simple steps to start using local AI.
            </p>

            <div className="space-y-0.5[1px]">
              {steps.map((step, index) => {
                const StepComponent = step.component;
                return (
                  <StepComponent
                    key={step.title}
                    status={stepStatuses[index]}
                    isActive={activeStep === index}
                    title={step.title}
                    onClick={() => setActiveStep(index)}
                  />
                );
              })}
            </div>
          </div>

          {/* Right panel with image */}
          <div className="flex justify-center" style={{ flex: '1 1 auto' }}>
            <img
              src={`${window.vscMediaUrl}/granite/step_${activeStep + 1}.png`}
              alt={`Step ${activeStep + 1} illustration`}
              className="max-w-full h-auto object-contain"
              style={{
                opacity: 0.9,
                maxHeight: '400px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Add custom media query for layout change at 800px */}
      <style>
        {`
          @media (min-width: 800px) {
            .flex-col {
              flex-direction: row !important;
            }
            .flex-col > * {
              width: 50% !important;
            }
          }
        `}
      </style>
    </div>
  );
};