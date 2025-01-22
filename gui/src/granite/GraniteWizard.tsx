import React, { useCallback, useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { RadioGroup } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { StatusCheck, StatusValue } from './StatusCheck';
import { ServerStatus } from 'core/granite/commons/statuses';
import { VSCodeButton } from '../components/VSCodeButton';
import './GraniteWizard.css';
import { SystemInfo } from 'core/granite/commons/sysInfo';
import { vscode } from './utils/vscode';
import { current } from '@reduxjs/toolkit';

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
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [installationModes, setInstallationModes] = useState<InstallationMode[]>([]);

  return (
    <WizardContext.Provider value={{ currentStatus, setCurrentStatus, activeStep, setActiveStep, stepStatuses, setStepStatuses, serverStatus, setServerStatus, systemInfo, setSystemInfo, installationModes, setInstallationModes }}>
      {children}
    </WizardContext.Provider>
  );
};

interface ModelOption {
  name: string;
  description: string;
  recommended?: boolean;
}

interface StepProps {
  isActive: boolean;
  onClick?: () => void;
  status: StatusValue;
  title: string;
  children?: React.ReactNode;
  onComplete?: () => void;
  onStatusChange?: (status: StatusValue) => void;
  onNext?: () => void;
}

const WizardStep: React.FC<StepProps> = ({ isActive, onClick, status, title, children, onComplete, onStatusChange, onNext }) => {
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
      Started!
    </VSCodeButton>
  );
} else if (serverStatus === ServerStatus.stopped) {
  serverButton = (
    // TODO let user choose between installing manually or automatically (via homebrew/script/installer)
    <VSCodeButton onClick={handleStartOllama}>
      Start Ollama...
    </VSCodeButton>
  );
} else {
  serverButton = (
    <VSCodeButton onClick={handleDownload}>
      Download Ollama...
    </VSCodeButton>
  );
}

  return (
    <WizardStep {...props}>
      <div className="mt-4">
        <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
          Ollama is an open source tool that allows running AI models locally. To begin using Granite.Code, first follow the instructions to download and install Ollama.
        </p>
        {serverButton}
      </div>
    </WizardStep>
  );
};

const ModelSelectionStep: React.FC<StepProps> = (props) => {
  const { serverStatus } = useWizardContext();
  const [selectedModel, setSelectedModel] = useState<string>('large');
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<NodeJS.Timeout>();

  const startDownload = () => {
    setDownloadState('downloading');
    //setProgress(0);

    progressInterval.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval.current);
          setDownloadState('complete');
          if (props.onStatusChange) {
            props.onStatusChange('complete');
          }
          if (props.onComplete) {
            setTimeout(props.onComplete, 500);
          }
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  const cancelDownload = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    setDownloadState('idle');
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
      name: 'Large',
      description: 'For machines with 32GB of memory and a fast GPU',
      recommended: true,
    },
    {
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
          <RadioGroup value={selectedModel} onChange={setSelectedModel} className="mt-4" disabled={downloadState !== 'idle'}>
            <div className="space-y-4">
              {modelOptions.map((option) => (
                <RadioGroup.Option
                  key={option.name.toLowerCase()}
                  value={option.name.toLowerCase()}
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
                        {option.recommended && (
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
            <VSCodeButton
              onClick={startDownload}
              disabled={serverStatus !== ServerStatus.started && downloadState !== 'idle'}
              variant={downloadState === "complete"? "secondary": "primary"}
            >
              {downloadState === 'idle' ? 'Download' :
               downloadState === 'downloading' ? 'Downloading...' :
               'Complete!'}
            </VSCodeButton>

            {downloadState === 'downloading' && (
              <>
                <VSCodeButton
                  variant="secondary"
                  onClick={cancelDownload}
                >
                  Cancel
                </VSCodeButton>
                <span className="ml-2 text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
                  {progress}% complete
                </span>
              </>
            )}
          </div>

          {selectedModel === 'large' && (
            <div className="mt-4 flex items-start space-x-2">
              <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" style={{ color: 'var(--vscode-errorForeground, #f48771)' }} aria-hidden="true" />
              <span className="text-sm" style={{ color: 'var(--vscode-errorForeground, #f48771)' }}>
                Insufficient disk space available
              </span>
            </div>
          )}
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
  const { currentStatus, setCurrentStatus, activeStep, stepStatuses, setActiveStep, setStepStatuses, serverStatus, setServerStatus, systemInfo, setSystemInfo, installationModes, setInstallationModes } = useWizardContext();
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
          setSystemInfo(data.systemInfo);
          break;
        }
        case "status": {
          const data = payload.data;
          //console.log("received status " + JSON.stringify(data));
          //console.log("Current status " + currStatus);
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
        case "pullmodels": {

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
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-4xl font-light mb-2" style={{ color: 'var(--vscode-foreground)' }}>
          Granite.Code
        </h1>
        <h2 className="text-2xl font-light mb-2" style={{ color: 'var(--vscode-editor-foreground)' }}>
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
                onClick={() => {setActiveStep(index)}}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};