/**
 * Shared layout constants for the bottom tab bar.
 *
 * Keeping this in one place is what actually fixes the overlap bug:
 * before, AppNavigator hardcoded `height: 60` for the tab bar (ignoring
 * the device's bottom safe-area inset), while each screen separately
 * guessed at its own "60 + insets.bottom" padding. Any drift between
 * those numbers is exactly what causes content to peek out from behind
 * the tab bar (or the tab bar's icons to sit under the home indicator /
 * gesture bar). Now every file imports the same numbers.
 */

// Height of the tab bar's visible content (icons + labels),
// NOT including the bottom safe-area inset. This is the number
// designers usually mean when they say "the tab bar is 60pt tall".
export const TAB_BAR_CONTENT_HEIGHT = 60;

// Extra breathing room below the tab bar for scrollable content
// and floating action buttons, so the last item / FAB isn't flush
// against the tab bar's top edge.
export const BOTTOM_SPACING = 16;