import { useContext } from "react";
import { Button } from "../components";
import { IdeMessengerContext } from "../context/IdeMessenger";
import GraniteLogo from "./GraniteLogo";

const GraniteOnboardingCard: React.FC = () => {
    const ideMessenger = useContext(IdeMessengerContext);

    const openGraniteSetup = () => {
        ideMessenger.post("showSetupWizard", undefined);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--vscode-sideBar-background)] text-[var(--vscode-foreground)]" >
          <GraniteLogo
            alt="Granite.Code Logo"
            className="w-24 h-24 mb-2"
          />
          <h1 className="text-xl font-bold mb-4">Welcome to Granite.Code</h1>
          <p className="mb-6 text-center">
            Local coding assistant for those who want to be in control
          </p>
          <p className="mb-6 font-medium">Follow setup to get started</p>
          <Button onClick={openGraniteSetup}>Open Setup</Button>
        </div>
      );
};

export default GraniteOnboardingCard;