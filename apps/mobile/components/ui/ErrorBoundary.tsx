import { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import {
  createRedactedError,
  redactSensitiveText,
} from "../../services/redaction";
import { getWebFocusStyle } from "./designSystem";
import i18n from "../../lib/i18n";

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
    const redactedError = createRedactedError(error);
    const redactedStack = redactSensitiveText(errorInfo.componentStack ?? "");

    console.error("[ErrorBoundary]", redactedError.message, redactedStack);

    // Report to Sentry or custom error handler
    this.props.onError?.(redactedError, {
      ...errorInfo,
      componentStack: redactedStack,
    });

    try {
      // Lazy Sentry import — only if available
      const Sentry = require("@sentry/react-native");
      Sentry.captureException(redactedError, {
        extra: { componentStack: redactedStack },
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
      const bg = colors?.background || "#08090C";
      const text = colors?.text || "#F4F5F7";
      const textSecondary = colors?.textSecondary || "#9DA3AE";
      const primary = colors?.primary || "#F4F5F7";
      const onPrimary = colors?.onPrimary || "#08090C";
      const focus = colors?.focus || "#8792FF";

      return (
        <View
          style={[styles.container, { backgroundColor: bg }]}
          accessibilityRole="alert"
          accessibilityLabel={i18n.t("common.unexpectedError.title")}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.emoji}>⚠️</Text>
          </View>
          <Text style={[styles.title, { color: text }]}>
            {i18n.t("common.unexpectedError.title")}
          </Text>
          <Text style={[styles.description, { color: textSecondary }]}>
            {i18n.t("common.unexpectedError.description")}
          </Text>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.retryButton,
              { backgroundColor: primary },
              pressed && { opacity: 0.72 },
              Platform.OS === "web" && focused && getWebFocusStyle(focus),
            ]}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.retry")}
          >
            <Text style={[styles.retryText, { color: onPrimary }]}>
              {i18n.t("common.retry")}
            </Text>
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
    fontWeight: "700",
    fontSize: 15,
  },
});
