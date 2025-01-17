import React, { useCallback, useState, useEffect, useRef } from 'react';
import { RadioGroup } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { StatusCheck, StatusValue } from './StatusCheck';
import { ServerStatus } from 'core/granite/commons/statuses';
import { VSCodeButton } from '../components/VSCodeButton';
import './GraniteWizard.css';

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
  const [downloadComplete, setDownloadComplete] = useState(false);

  const handleDownload = async () => {
    try {
      if (props.onStatusChange) {
        props.onStatusChange('partial');
      }
      setDownloadComplete(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartOllama = () => {
    if (props.onStatusChange) {
      props.onStatusChange('complete');
    }
    if (props.onComplete) {
      props.onComplete();
    }
    if (props.onNext) {
      setTimeout(props.onNext, 100);
    }
  };

  return (
    <WizardStep {...props}>
      <div className="mt-4">
        <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
          Ollama is an open source tool that allows running AI models locally. To
          begin using Granite.Code, first follow the instructions to download and
          install Ollama.
        </p>
        {!downloadComplete && (
          <VSCodeButton
            onClick={handleDownload}
          >
            Download Ollama...
          </VSCodeButton>
        )}
        {downloadComplete && (
          <VSCodeButton
            onClick={handleStartOllama}
          >
            Start Ollama...
          </VSCodeButton>
        )}
      </div>
    </WizardStep>
  );
};

const ModelSelectionStep: React.FC<StepProps> = (props) => {
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
              disabled={downloadState !== 'idle'}
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
        </div>
      )}
    </WizardStep>
  );
};

const StartLocalAIStep: React.FC<StepProps> = (props) => {
  return (
    <WizardStep {...props}>
      {props.isActive && (
        <div className="mt-4">
          <p className="text-sm" style={{ color: 'var(--vscode-editor-foreground)' }}>
            Granite.Code is ready to be used
          </p>
          <VSCodeButton
            className="mt-4"
          >
            Open Tutorial
          </VSCodeButton>
        </div>
      )}
    </WizardStep>
  );
};

export const GraniteWizard: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [serverStatus, setServerStatus] = useState<ServerStatus>(ServerStatus.unknown);
  const [stepStatuses, setStepStatuses] = useState<StatusValue[]>(['missing', 'missing', 'missing']);

  const handleStepComplete = (stepIndex: number) => {
    setActiveStep(stepIndex + 1);
  };

  const handleStepStatusChange = (stepIndex: number, status: StatusValue) => {
    setStepStatuses(prevStatuses => {
      const newStatuses = [...prevStatuses];
      newStatuses[stepIndex] = status;
      // When model download completes (step 1), also mark the final step as complete
      if (stepIndex === 1 && status === 'complete') {
        newStatuses[2] = 'complete';
      }
      return newStatuses;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveStep(prev => Math.min(prev + 1, 2));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveStep(prev => Math.max(prev - 1, 0));
    }
  };

  const steps = [
    {
      component: OllamaInstallStep,
      title: "Download and install Ollama",
    },
    {
      component: ModelSelectionStep,
      title: "Download a Granite model",
    },
    {
      component: StartLocalAIStep,
      title: "Start using local AI",
    }
  ];

  return (
    <div 
      className="h-full w-full"
      onKeyDown={handleKeyDown}
      role="tablist"
    >
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-4xl font-light mb-2" style={{ color: 'var(--vscode-foreground)' }}>Granite.Code</h1>
        <h2 className="text-2xl font-light mb-2" style={{ color: 'var(--vscode-editor-foreground)' }}>Local AI setup</h2>
        <p className="mb-8" style={{ color: 'var(--vscode-descriptionForeground)' }}>
          Follow these simple steps to start using local AI.
        </p>

        <div className="space-y-0.5[1px]">
          {steps.map((step, index) => {
            const StepComponent = step.component;
            return (
              <StepComponent
                key={step.title}
                isActive={activeStep === index}
                onClick={() => setActiveStep(index)}
                status={stepStatuses[index]}
                title={step.title}
                onComplete={() => handleStepComplete(index)}
                onStatusChange={(status) => handleStepStatusChange(index, status)}
                onNext={() => setActiveStep(index + 1)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};