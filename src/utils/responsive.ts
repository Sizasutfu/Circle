import { Dimensions, Platform, ScaledSize } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ── Breakpoints ──
export const BREAKPOINTS = {
  xs: 320,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
};

// ── Check if current screen is web ──
export const isWeb = Platform.OS === 'web';

// ── Get current breakpoint ──
export function getBreakpoint(width: number = screenWidth): keyof typeof BREAKPOINTS {
  if (width < BREAKPOINTS.sm) return 'xs';
  if (width < BREAKPOINTS.md) return 'sm';
  if (width < BREAKPOINTS.lg) return 'md';
  if (width < BREAKPOINTS.xl) return 'lg';
  if (width < BREAKPOINTS.xxl) return 'xl';
  return 'xxl';
}

// ── Responsive width ──
export function responsiveWidth(
  mobile: number | string,
  tablet?: number | string,
  desktop?: number | string
): number | string {
  const breakpoint = getBreakpoint();
  
  if (breakpoint === 'xs' || breakpoint === 'sm') return mobile;
  if ((breakpoint === 'md' || breakpoint === 'lg') && tablet) return tablet;
  if (desktop) return desktop;
  if (tablet) return tablet;
  return mobile;
}

// ── Responsive font size ──
export function responsiveFontSize(
  mobile: number,
  tablet?: number,
  desktop?: number
): number {
  const breakpoint = getBreakpoint();
  
  if (breakpoint === 'xs' || breakpoint === 'sm') return mobile;
  if ((breakpoint === 'md' || breakpoint === 'lg') && tablet) return tablet;
  if (desktop) return desktop || tablet || mobile;
  if (tablet) return tablet;
  return mobile;
}

// ── Check if screen is mobile ──
export function isMobile(): boolean {
  const breakpoint = getBreakpoint();
  return breakpoint === 'xs' || breakpoint === 'sm';
}

// ── Check if screen is tablet ──
export function isTablet(): boolean {
  const breakpoint = getBreakpoint();
  return breakpoint === 'md' || breakpoint === 'lg';
}

// ── Check if screen is desktop ──
export function isDesktop(): boolean {
  const breakpoint = getBreakpoint();
  return breakpoint === 'xl' || breakpoint === 'xxl';
}

// ── Get max width for content ──
export function getMaxWidth(): number {
  if (isDesktop()) return BREAKPOINTS.xl;
  if (isTablet()) return BREAKPOINTS.lg;
  return screenWidth;
}