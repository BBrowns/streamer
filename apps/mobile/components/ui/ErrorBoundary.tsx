import { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  colors?: any; // Injected by wrapper
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary for catching runtime errors in component trees.
 *
 * Renders a recoverable fallback UI instead of crashing the app.
 * Logs errors and optionally calls an onError callback (e.g. for Sentry).
 */
class ErrorBoundaryInner extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);

    // Report to Sentry or custom error handler
    this.props.onError?.(error, errorInfo);

    try {
      // Lazy Sentry import — only if available
      const Sentry = require("@sentry/react-native");
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Sentry not available — that's fine
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { colors } = this.props;
      const bg = colors?.background || "#0a0a1a";
      const text = colors?.text || "#e0e0ff";
      const textSecondary = colors?.textSecondary || "#9ca3af";
      const tint = colors?.tint || "#818cf8";

      return (
        <View
          style={[styles.container, { backgroundColor: bg }]}
          accessibilityRole="alert"
          accessibilityLabel="An error occurred"
        >
          <View style={styles.iconContainer}>
            <Text style={styles.emoji}>⚠️</Text>
          </View>
          <Text style={[styles.title, { color: text }]}>
            Something went wrong
          </Text>
          <Text style={[styles.description, { color: textSecondary }]}>
            {this.state.error?.message || "An unexpected error occurred."}
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: tint }]}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityHint="Attempts to reload this section"
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: Omit<Props, "colors">) {
  const { colors } = useTheme();
  return <ErrorBoundaryInner {...props} colors={colors} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 300,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});
