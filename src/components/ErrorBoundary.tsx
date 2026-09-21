"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { reportClientError } from "@/lib/error-reporter";

/**
 * The app's only error boundary implementation.
 *
 * React still has no hook equivalent, so this stays a class. It is deliberately
 * generic: the feed wraps each card in one, the story viewer wraps itself in one,
 * and route-level `error.tsx` files handle whatever escapes. Every catch reports
 * to `/api/v1/client-errors` with a correlation id the fallback can show.
 */

export interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  correlationId: string;
}

interface Props {
  children: ReactNode;
  /** Route or surface name, sent with the report. Never interpolate user data. */
  route: string;
  fallback: (props: ErrorFallbackProps) => ReactNode;
  /** Changing this value resets the boundary — e.g. when the route changes. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  correlationId: string;
  resetKey: string | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, correlationId: "", resetKey: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.resetKey !== props.resetKey) {
      return { error: null, correlationId: "", resetKey: props.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const correlationId = reportClientError({
      error,
      route: this.props.route,
      componentStack: info.componentStack ?? undefined,
    });
    this.setState({ correlationId });
  }

  private readonly reset = (): void => {
    this.setState({ error: null, correlationId: "" });
  };

  override render(): ReactNode {
    const { error, correlationId } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback({ error, reset: this.reset, correlationId });
  }
}
