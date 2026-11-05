import type {
  PullRequestRef,
  WorkflowInput,
  WorkflowRun,
} from './types';

type CiBuildResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number };

async function call<T>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = (await browser.runtime.sendMessage({
    type: 'CI_BUILD',
    action,
    payload: payload ?? {},
  })) as CiBuildResponse;

  if (!response?.ok) {
    throw new Error(response?.error || 'Error desconocido');
  }
  return response.data as T;
}

export const ciBuildApi = {
  findPullRequests: (payload: {
    taskId: string | null;
    title: string;
    prNumber?: number | null;
    prOwner?: string | null;
    prRepo?: string | null;
    branchHints?: string[];
  }) => call<PullRequestRef[]>('findPullRequests', payload),

  listBranches: () => call<string[]>('listBranches'),

  listOpenPullRequests: () => call<PullRequestRef[]>('listOpenPullRequests'),

  checkBranch: (payload: { branch: string }) =>
    call<{ exists: boolean }>('checkBranch', payload),

  getWorkflowInputs: () =>
    call<{ inputs: WorkflowInput[]; source: 'github' | 'fallback' }>(
      'getWorkflowInputs',
    ),

  dispatch: (payload: {
    branch: string;
    inputs: Record<string, string>;
    taskKey: string | null;
  }) =>
    call<{ run: WorkflowRun | null; actionsUrl: string }>('dispatch', payload),

  getRun: (payload: {
    id: number;
    inputs?: Record<string, string> | null;
  }) => call<WorkflowRun>('getRun', payload),

  getTaskRuns: (payload: {
    taskKey: string | null;
    branches: string[];
  }) => call<WorkflowRun[]>('getTaskRuns', payload),

  cancelRun: (payload: {
    id: number;
    inputs?: Record<string, string> | null;
  }) => call<WorkflowRun>('cancelRun', payload),

  testConnection: () => call<{ login: string }>('testConnection'),

  openOptions: () => call<null>('openOptions'),
};
