export class AutoCloseResponse {
  closedCount: number
}

export class ScheduleStart {
  startedCount: number
  failedIds: number[]
}

export class AutoSwitchAudience {
  switchedCount: number
  failedIds: number[]
}

export class TriggerRematchResponse {
  userId: number
}

export class SwitchToFormerWorker {
  switchedCount: number
  failedIds: number[]
}

