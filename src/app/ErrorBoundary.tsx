import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Short section name used in the console log. */
  label: string;
}

interface State {
  failed: boolean;
}

/**
 * Keeps one broken section from taking the whole app down. The fallback is
 * deliberately quiet: a paper card, a retry and a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[fapp] ${this.props.label} crashed`, error, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="app-crash" role="alert">
        <div className="app-crash__card">
          <p className="app-crash__eyebrow">Something interrupted</p>
          <h1>This part could not open.</h1>
          <p>
            Your account and messages are safe. Try again, or reload the app if the problem
            continues.
          </p>
          <div className="app-crash__actions">
            <button type="button" className="app-crash__primary" onClick={this.retry}>
              Try again
            </button>
            <button
              type="button"
              className="app-crash__ghost"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
