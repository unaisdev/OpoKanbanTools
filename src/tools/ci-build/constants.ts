export const TOOL_ID = 'ci-build';

export const DEFAULT_OWNER = 'opositatest';
export const DEFAULT_REPO = 'react-web-app';
export const DEFAULT_WORKFLOW = 'app-testing-environments.yml';
export const DEFAULT_WORKFLOW_REF = 'main';
export const DEFAULT_BUILD_NUMBER_OFFSET = 109;
export const DEFAULT_REQUIRED_LABEL = 'pr:app';

/** Used when the workflow YAML cannot be read from GitHub. */
export const FALLBACK_INPUTS = [
  {
    name: 'environment',
    description: 'Select the environment',
    default: 'pre-production',
    options: ['production', 'pre-production', 'pro-internal'],
  },
  {
    name: 'platform',
    description: 'Select the platform',
    default: 'firebase',
    options: ['firebase', 'testflight'],
  },
] as const;

/**
 * Infer inputs from the only non-skipped job
 * (each job covers an environment/platform combo).
 * production and pro-internal share a job, so they cannot be distinguished.
 */
export function inferInputsFromJob(jobName: string): {
  environment: string;
  platform: string;
} | null {
  const m = jobName.match(/^build-(ios|android)-(pre-production|production)$/);
  if (!m) return null;
  return {
    environment: m[2] === 'pre-production' ? 'pre-production' : 'production / pro-internal',
    platform: m[1] === 'ios' ? 'testflight' : 'firebase',
  };
}

/** Where to read versionName / MARKETING_VERSION for a successful run. */
export const VERSION_SOURCES = {
  firebase: {
    path: 'packages/app/android/app/build.gradle',
    regex: /versionName\s+"([^"]+)"/,
  },
  testflight: {
    path: 'packages/app/ios/OpositaTestRN.xcodeproj/project.pbxproj',
    regex: /MARKETING_VERSION = ([^;]+);/,
  },
} as const;
