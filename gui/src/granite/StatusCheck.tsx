import { VscArrowCircleDown, VscCircleLarge, VscCircleLargeFilled, VscPass, VscPassFilled } from "react-icons/vsc";

/**
 * StatusValue represents the different states that a status check can be in.
 */
export type StatusValue = 'complete' | 'installing' | 'partial' | 'missing';

/**
 * StatusCheckProps represents the props that are passed to the StatusCheck component.
 */
export interface StatusCheckProps {
  type: StatusValue | null;
  title?: string;
}

const DEFAULT_COLOR = "var(--vscode-textLink-foreground)";
const ICON_STYLE = { fontSize: '16px' };

/**
 * StatusCheck is a React component that displays a status check icon based on the provided type.
 */
export const StatusCheck: React.FC<StatusCheckProps> = ({ type, title }: StatusCheckProps) => {
  switch (type) {
    case null:
      return <VscCircleLargeFilled color={DEFAULT_COLOR} style={ICON_STYLE} />;
    case "complete":
      return <VscPassFilled color={DEFAULT_COLOR} title={title} style={ICON_STYLE} />;
    case "installing":
      return <VscArrowCircleDown color={DEFAULT_COLOR} title={title} style={ICON_STYLE} />;
    case "partial":
      return <VscCircleLarge color={DEFAULT_COLOR} title={title} style={ICON_STYLE} />;
    default: //"missing"
      return <VscCircleLarge title={title} style={ICON_STYLE} />;
  }
};