export type WorkflowInput = {
  name: string;
  description: string;
  default: string;
  type?: string;
  required?: boolean;
  options: string[];
};

export type PullRequestRef = {
  number: number;
  title: string;
  branch: string;
  fromFork: boolean;
  draft: boolean;
  url: string;
  updatedAt: string;
  source: 'id' | 'title' | 'link' | 'branch' | 'list';
};

export type WorkflowRun = {
  id: number;
  url: string;
  status: string;
  conclusion: string | null;
  branch: string;
  createdAt: number;
  actor: string | null;
  inputs: Record<string, string> | null;
  inputsInferred: boolean;
  tracked: boolean;
  runNumber: number;
  buildNumber: number;
  version: string | null;
  durationMs: number | null;
};

export type CiBuildConfig = {
  token: string;
  owner: string;
  repo: string;
  workflow: string;
  workflowRef: string;
  buildNumberOffset: number;
  lastEnvironment: string;
  lastPlatform: string;
};

export type CiBuildAction =
  | {
      action: 'findPullRequests';
      payload: {
        taskId: string | null;
        title: string;
        prNumber?: number | null;
        prOwner?: string | null;
        prRepo?: string | null;
        branchHints?: string[];
      };
    }
  | { action: 'listBranches' }
  | { action: 'listOpenPullRequests' }
  | { action: 'checkBranch'; payload: { branch: string } }
  | { action: 'getWorkflowInputs' }
  | {
      action: 'dispatch';
      payload: {
        branch: string;
        inputs: Record<string, string>;
        taskKey: string | null;
      };
    }
  | {
      action: 'getRun';
      payload: { id: number; inputs?: Record<string, string> | null };
    }
  | {
      action: 'getTaskRuns';
      payload: { taskKey: string | null; branches: string[] };
    }
  | {
      action: 'cancelRun';
      payload: { id: number; inputs?: Record<string, string> | null };
    }
  | { action: 'testConnection' }
  | { action: 'openOptions' };
