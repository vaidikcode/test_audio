export type JobRequestParams = {
  prompt?: string;
  duration_ms?: number;
  num_samples?: number;
};

export type SyncSuccessResponse = {
  result_urls: string[];
};

export type AsyncJobCreatedResponse = {
  job_id: string;
  job_url: string;
  estimated_ms: number;
  estimated_completion_at: string;
};

export type PreflightResponse = {
  credits: number;
  estimated_ms: number;
};

export type JobPollProcessing = {
  job_id: string;
  status: "processing";
  created_at: string;
  estimated_completion_at: string;
  estimated_ms: number;
  progress_percent: number;
  request: JobRequestParams;
};

export type JobPollSucceeded = {
  job_id: string;
  status: "succeeded";
  created_at: string;
  completed_at: string;
  result: SyncSuccessResponse;
  request: JobRequestParams;
};

export type JobPollErrored = {
  job_id: string;
  status: "errored";
  created_at: string;
  completed_at: string | null;
  error: { code: string; message: string; http_status?: number };
  request: JobRequestParams;
};

export type JobPollResponse = JobPollProcessing | JobPollSucceeded | JobPollErrored;
