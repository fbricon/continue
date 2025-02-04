import React, { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { RadioGroup } from '@headlessui/react';
import { ExclamationCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { StatusCheck, StatusValue } from './StatusCheck';
import { ServerStatus } from 'core/granite/commons/statuses';
import { VSCodeButton } from '../components/VSCodeButton';
import './GraniteWizard.css';
import { isHighEndMachine, SystemInfo } from 'core/granite/commons/sysInfo';
import { OLLAMA_STEP, MODELS_STEP, FINAL_STEP, WizardState, ModelType} from 'core/granite/commons/wizardState';
import { vscode } from './utils/vscode';
import { ProgressData } from 'core/granite/commons/progressData';
import { formatSize } from 'core/granite/commons/textUtils';
import { DEFAULT_MODEL_INFO } from 'core/granite/commons/modelInfo';
import { DEFAULT_MODEL_GRANITE_LARGE, DEFAULT_MODEL_GRANITE_SMALL } from 'core/config/default';

interface InstallationMode {
  id: string;
  label: string;
  supportsRefresh: boolean;
}

enum WizardStatus {
  idle,
  downloadingOllama,
  startingOllama,
  downloadingModel
}

interface WizardContextProps {
  currentStatus: WizardStatus;
  setCurrentStatus: React.Dispatch<React.SetStateAction<WizardStatus>>;
  activeStep: number;
  setActiveStep: React.Dispatch<React.SetStateAction<number>>;
  stepStatuses: boolean[];
  setStepStatuses: React.Dispatch<React.SetStateAction<boolean[]>>;
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
  isOffline: boolean;
  setIsOffline: React.Dispatch<React.SetStateAction<boolean>>;
  modelInstallationError: string | undefined;
  setModelInstallationError: React.Dispatch<React.SetStateAction<string | undefined>>;
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
  const [stepStatuses, setStepStatuses] = useState<boolean[]>([false, false, false]);
  const [serverStatus, setServerStatus] = useState<ServerStatus>(ServerStatus.unknown);
  const [modelStatus, setModelStatus] = useState<StatusValue>('missing');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [installationModes, setInstallationModes] = useState<InstallationMode[]>([]);
  const [recommendedModel, setRecommendedModel] = useState<ModelType>("small");
  const [selectedModel, setSelectedModel] = useState<ModelType>(recommendedModel);
  const [modelInstallationProgress, setModelInstallationProgress] = useState<number>(0);
  const [modelInstallationStatus, setModelInstallationStatus] = useState<"idle" | "downloading" | "complete">("idle");
  const [isOffline, setIsOffline] = useState(false);
  const [modelInstallationError, setModelInstallationError] = useState<string | undefined>();

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
      isOffline,
      setIsOffline,
      modelInstallationError,
      setModelInstallationError
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
  status: boolean;
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
          <StatusCheck type={status ? 'complete' : (isActive ? 'active' : 'missing')} />
          <h3 className="ml-3 wizard-step-title inline">
            {title}
          </h3>
        </div>
        {isActive && <div className="ml-7">{children}</div>}
      </div>
    </div>
  );
};

const DiagnosticMessage: React.FC<{
  type: 'warning' | 'info' | 'error';
  message: string;
}> = ({ type, message }) => {
  const color = (type === 'warning') ? 'var(--vscode-editorWarning-foreground, #f48771)' : (type === 'info') ? 'var(--vscode-editorInfo-foreground)' : 'var(--vscode-editorError-foreground)';
  const Icon = (type === 'warning') ? ExclamationTriangleIcon : (type === 'info') ? InformationCircleIcon : ExclamationCircleIcon;
  return (
    <div className="mt-4 flex items-start space-x-2">
      <Icon className="h-4 w-4 mt-0.5" style={{ color }} aria-hidden="true" />
      <span className="text-sm">
       {message}
      </span>
    </div>
  );
};

const OllamaInstallStep: React.FC<StepProps> = (props) => {
  const { serverStatus, installationModes, setCurrentStatus, isOffline } = useWizardContext();

  const handleDownload = () => {
    setCurrentStatus(WizardStatus.downloadingOllama);
    vscode.postMessage({
      command: "installOllama",
      data: {
        mode: installationModes[0].id,
      },
    });
  };

  const isDevspaces = installationModes.length > 0 && installationModes[0].id === "devspaces";

  let serverButton

  if (serverStatus === ServerStatus.started || serverStatus === ServerStatus.stopped) {
    serverButton = (
      <VSCodeButton variant='secondary' disabled>
        Complete!
      </VSCodeButton>
    );
  } else if (isDevspaces) {
    const hiddenLinkRef = useRef<HTMLAnchorElement>(null);
    const hiddenLink = // Trick to open the link directly, avoiding calling VS Code API, which would show a security warning
      <a
        ref={hiddenLinkRef}
        href="https://developers.redhat.com/articles/2024/08/12/integrate-private-ai-coding-assistant-ollama"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden"
      >
        Red Hat Dev Spaces Installation Guide
      </a>;
    serverButton = <>
      {hiddenLink}
      <VSCodeButton onClick={() => hiddenLinkRef.current?.click()}>
        Installation Guide
      </VSCodeButton>
    </>
  } else if (installationModes.length > 0) {
    serverButton = (
      <VSCodeButton onClick={handleDownload} disabled={isOffline}>
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
        {isDevspaces && (
          <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
            Follow the guide to install Ollama on Red Hat Dev Spaces.
          </p>
        )}
        {serverButton}
        {!isDevspaces && installationModes.length > 0 && (
          <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
            If you prefer, you can also <a href='https://ollama.com/download'>install Ollama manually</a>.
          </p>
        )}
        {!isDevspaces && isOffline && (
          <DiagnosticMessage
            type="info"
            message="Network connection required"
          />
        )}
      </div>
    </WizardStep>
  );
};

const ModelSelectionStep: React.FC<StepProps> = (props) => {
  const { serverStatus, recommendedModel, selectedModel, setSelectedModel, modelInstallationProgress, setModelInstallationProgress, modelInstallationStatus, setModelInstallationStatus, isOffline, modelInstallationError, setModelInstallationError, systemInfo } = useWizardContext();
  const progressInterval = useRef<NodeJS.Timeout>();
  const [systemError, setSystemError] = useState<string | undefined>();

  const startDownload = () => {
    setModelInstallationError(undefined);
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

  const handleModelChange = (value: ModelType) => {
    setSelectedModel(value);
    vscode.postMessage({
      command: "selectModels",
      data: {
        model: value,
      },
    });
  };

  useEffect(() => {//cancel download on error
    if (modelInstallationError || isOffline) {
      cancelDownload();
    }
  }, [modelInstallationError, isOffline]);

  useEffect(() => {
    if (systemInfo && systemInfo.diskSpace) {
      const { freeDiskSpace } = systemInfo.diskSpace;
      const requiredDiskSpace = getRequiredSpace(selectedModel);
      if (freeDiskSpace < requiredDiskSpace) {
        setSystemError(`Insufficient disk space available: ${ formatSize(freeDiskSpace)} free, ${formatSize(requiredDiskSpace)} required.`);
      } else {
        setSystemError(undefined);
      }
    }
  }, [systemInfo, selectedModel]);

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
          <RadioGroup value={selectedModel} onChange={handleModelChange} className="mt-4" disabled={modelInstallationStatus !== 'idle'}>
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
              disabled={isOffline || systemError !== undefined || (serverStatus !== ServerStatus.started && serverStatus !== ServerStatus.stopped)}
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

          {systemError && (
            <DiagnosticMessage message={systemError} type='error' />
          )}
          {modelInstallationError && (
            <DiagnosticMessage message={modelInstallationError} type='error' />
          )}
          {serverStatus !== ServerStatus.started && serverStatus !== ServerStatus.stopped && (
            <DiagnosticMessage
              type="warning"
              message="Ollama must be installed"
            />
          )}
          {serverStatus === ServerStatus.stopped && (
            <DiagnosticMessage
              type="info"
              message="Ollama will be started automatically"
            />
          )}
          {isOffline && (
            <DiagnosticMessage
              type="info"
              message="Network connection required"
            />
          )}
        </div>
      )}
    </WizardStep>
  );
};

const StartLocalAIStep: React.FC<StepProps> = (props) => {
  const handleShowTutorial = async () => {
    console.log("show tutorial");
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
  const { currentStatus, setCurrentStatus, activeStep, stepStatuses, setActiveStep, setStepStatuses, setServerStatus, setSystemInfo, setInstallationModes, setRecommendedModel, setSelectedModel, modelInstallationProgress ,setModelInstallationProgress, setModelInstallationStatus, setIsOffline, setModelInstallationError } = useWizardContext();
  const stepStatusesRef = useRef(stepStatuses);
  const currentStatusRef = useRef(currentStatus);
  // Update ref when stepStatuses changes
  useEffect(() => {
    //TODO do we still need this?
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
          const wizardState = data.wizardState as WizardState | undefined;
          if (wizardState) {
            if (wizardState?.selectedModelSize) {
              setSelectedModel(wizardState.selectedModelSize);
            } else {
              console.log("Selecting recommended model as there's nothing prior " + recommendedModel);
              setSelectedModel(recommendedModel);
            }
            if (wizardState?.stepStatuses) {
              setStepStatuses(wizardState.stepStatuses);
            }
          } else {
            console.log("Selecting recommended model " + recommendedModel);
            setSelectedModel(recommendedModel);
          }

          break;
        }
        case "status": {
          const data = payload.data;
          setServerStatus(data.serverStatus);
          const newStepStatuses = data.wizardState.stepStatuses as boolean[];
          setStepStatuses(prevStatuses => {
            if (newStepStatuses[OLLAMA_STEP] && !newStepStatuses[MODELS_STEP] && prevStatuses[OLLAMA_STEP] != newStepStatuses[OLLAMA_STEP]) {
              setActiveStep(MODELS_STEP);
            }
            if (newStepStatuses[MODELS_STEP]) {
              setModelInstallationProgress(100);
              setModelInstallationStatus("complete");
              if (!newStepStatuses[FINAL_STEP] && prevStatuses[MODELS_STEP] != newStepStatuses[MODELS_STEP]) {
                setActiveStep(FINAL_STEP);
              }
            }
            return newStepStatuses;
          });
          if (newStepStatuses[OLLAMA_STEP] && currStatus === WizardStatus.downloadingOllama || currStatus === WizardStatus.startingOllama) {
            setCurrentStatus(WizardStatus.idle);
          }
          break;
        }
        case "modelInstallationProgress": {
          const progress = payload.data?.progress as ProgressData | undefined;
          if (progress && progress.total) {
            const progressPercentage = ((progress.completed ?? 0) / progress.total) * 100;
            console.log("Model installation progress: " + progressPercentage);
            setModelInstallationProgress(Math.min(progressPercentage, 99.99));// Don't show 100% completion until it's actually done
          }
          const error = payload.data?.error as string | undefined;
          if (error) {
            console.error("Model installation error: " + error);
            setModelInstallationProgress(0);
            setModelInstallationError("Unable to install the Granite Model: " + error);
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

  useEffect(() => {
    const checkOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    checkOnlineStatus(); // Initial check

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
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
              src={`${window.vscMediaUrl}/granite/step_${activeStep + 1}.svg`}
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

function getRequiredSpace(selectedModel: string): number {
  //FIXME check if model is already downloaded
  const graniteModel = (selectedModel === 'large') ? DEFAULT_MODEL_GRANITE_LARGE : DEFAULT_MODEL_GRANITE_SMALL;
  const models: string[] = [graniteModel.model, 'nomic-embed-text:latest'];
  return models.reduce((sum, model) => {
    const modelInfo = DEFAULT_MODEL_INFO.get(model);//FIXME get from registry
    return sum + (modelInfo ? modelInfo.size : 0);
  }, 0);
}
