import { KernText } from "@kern-ux-annex/kern-react-kit";

/**
 * The app's one waiting indicator. A polite live region, so a screen reader
 * announces the wait without interrupting whatever is being read.
 */
export function LoadingStatus({ message }: { message: string }) {
  return (
    <div className="app-status" role="status" aria-live="polite">
      <span className="app-status__spinner" aria-hidden="true" />
      <KernText>{message}</KernText>
    </div>
  );
}
