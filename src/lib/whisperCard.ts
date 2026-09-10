import { captureRef } from 'react-native-view-shot';

/**
 * Capture a React ref (ViewShot-style) to a PNG file on disk.
 * Returns a file:// URI that can be uploaded via FormData.
 */
export async function generateWhisperCard(viewRef: any): Promise<string> {
  if (!viewRef?.current) throw new Error('Card view is not mounted yet.');
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 0.95,
    result: 'tmpfile',
  });
  return uri;
}