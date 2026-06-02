export class Constants {
  static readonly HEADER_LANGUAGE = 'x-language'
  static readonly HEADER_API_KEY = 'x-api-key'
  static readonly HEADER_USER_ID = 'x-user-id'
  static readonly HEADER_AUTHORIZATION = 'authorization'
  static readonly SQS_QUEUE_RECIPIENT_NAME = 'job-recipient-queue'
  static readonly SQS_QUEUE_JOB_MATCH_NAME = 'job-match-queue'
  static readonly SQS_QUEUE_USER_REMATCH_NAME = 'job-user-rematch-queue'
  static readonly SQS_QUEUE_FIT_SCORE_RECALC_NAME = 'job-fit-score-recalc-queue'
  static readonly MAX_RECIPIENT_GENERATOR_RETRIES = 3
  static readonly MAX_JOB_MATCH_RETRIES = 1
  static readonly MAX_USER_REMATCH_RETRIES = 3
  static readonly MAX_FIT_SCORE_RECALC_RETRIES = 3
  static readonly JOB_MATCH_USER_BATCH_LIMIT = 400
  static readonly JOB_MAX_APPLY_LIMIT = 500
}
