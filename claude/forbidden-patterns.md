# Forbidden patterns

> Wrong/right examples for every rule in `CLAUDE.md`. AI: read this BEFORE writing.
> Each entry maps to a `Rxx` rule in `CLAUDE.md` so reviewer can cite the rule by number.

---

## ❌ #1 — Controller calls Repository directly (R1)

```ts
// ❌ WRONG — controller skips usecase
@Get(':id')
async getTask(@Param('id') id: string): Promise<Task> {
  return this.taskRepository.findOneActiveById(+id)  // 🚫
}

// ✅ CORRECT — controller delegates to usecase
@Get(':id')
async getTask(@Param('id') id: string): Promise<GetTaskByIdResponse> {
  return this.taskUsecase.getTaskById(...)
}
```

---

## ❌ #2 — Service injects PrismaService for direct DB calls (R3)

```ts
// ❌ WRONG
@Injectable()
export class AuthService {
  constructor(private readonly prismaService: PrismaService) {}
  async findUser(email: string) {
    return this.prismaService.users.findFirst({ where: { email } })  // 🚫
  }
}

// ✅ CORRECT — service calls repository
@Injectable()
export class AuthService {
  constructor(private readonly userRepository: UserRepository) {}
  async findUser(email: string) {
    return this.userRepository.findOneActiveByEmail(email)
  }
}
```

Exception: usecase MAY inject `PrismaService` for `$transaction()` only.

---

## ❌ #3 — Inline `BussinessException` without registering (R8)

```ts
// ❌ WRONG — anonymous error, no code, can't be tracked
throw new BussinessException('Task already cancelled')

// ✅ CORRECT — register in business-errors/index.ts with unique code
// In business-errors/index.ts:
export class TaskAlreadyCancelledError extends BussinessException {
  constructor() { super('Task is already cancelled', 1204) }
}

// In usecase:
throw new TaskAlreadyCancelledError()
```

---

## ❌ #4 — Aggregating in JS instead of SQL (R4)

```ts
// ❌ WRONG — N+1 + JS aggregation
const tasks = await this.taskReadRepository.findAllByTenant(tenantId)
const totalsByStatus = tasks.reduce((acc, t) => {
  acc[t.status] = (acc[t.status] || 0) + 1
  return acc
}, {})

// ✅ CORRECT — SQL GROUP BY in repository
async countByStatus(tenantId: number): Promise<{ status: TaskStatus; count: number }[]> {
  return this.prismaService.$queryRaw<{ status: TaskStatus; count: number }[]>(Prisma.sql`
    SELECT status, COUNT(*)::int AS count
    FROM tasks
    WHERE tenant_id = ${tenantId} AND is_active = true
    GROUP BY status
  `)
}
```

---

## ❌ #5 — Raw string comparison for role / status (R5)

```ts
// ❌ WRONG
if (req.role === 'ADMIN') { ... }
if (task.status === 'PENDING') { ... }

// ✅ CORRECT — use Domain helpers
const role = Role.try(req.role)
if (!role) throw new BadRequestException('Invalid role')
if (role.isAdmin()) { ... }

const status = TaskStatusDomain.try(task.status)
if (status?.isPending()) { ... }
```

---

## ❌ #6 — Manual response wrapping (project convention)

```ts
// ❌ WRONG — interceptor will double-wrap, breaking clients
return { data: result, message: 'success', statusCode: 200 }

// ✅ CORRECT — return plain DTO; CustomResponseInterceptor wraps globally
return result
```

---

## ❌ #7 — Using `deleted_at` for soft delete (R14)

```ts
// ❌ WRONG
data: { deleted_at: new Date() }

// ✅ CORRECT
data: {
  is_active: false,
  updated_by: actionBy,
  updated_at: new Date(),
}

// And on every read:
where: { ..., is_active: true }
```

---

## ❌ #8 — Forgetting audit fields on writes (R14)

```ts
// ❌ WRONG — missing audit fields
await transaction.tasks.create({
  data: { title, description, status: TaskStatus.PENDING }
})

// ✅ CORRECT — set all four every time
const actionBy = +getUserId() || 0
await transaction.tasks.create({
  data: {
    title,
    description,
    status: TaskStatus.PENDING,
    is_active: true,
    created_by: actionBy,
    updated_by: actionBy,
    created_at: new Date(),
    updated_at: new Date(),
  },
})
```

---

## ❌ #9 — Two tables in one repository file (R12)

```ts
// ❌ WRONG — task.repository.ts mixes two tables
export class TaskRepository { ... }
export class TaskCategoryRepository { ... }   // 🚫 different table

// ✅ CORRECT — separate files
// task.repository.ts:        TaskRepository + TaskReadRepository
// task-category.repository.ts: TaskCategoryRepository + TaskCategoryReadRepository
```

---

## ❌ #10 — `attemptDelivery` inside `$transaction` (outbox antipattern)

```ts
// ❌ WRONG — SQS publish before commit; race conditions, inconsistent state
await this.prismaService.$transaction(async (t) => {
  await this.taskRepository.create(..., t)
  const event = await this.taskEventPublisher.recordEvent(..., t)
  await this.taskEventPublisher.attemptDelivery(event.id)  // 🚫 row not committed yet!
})

// ✅ CORRECT — record inside, deliver after
let eventId: bigint
await this.prismaService.$transaction(async (t) => {
  await this.taskRepository.create(..., t)
  const event = await this.taskEventPublisher.recordEvent(..., t)
  eventId = event.id
})
await this.taskEventPublisher.attemptDelivery(eventId)
```

---

## ❌ #11 — Reading from replica when stale = bug

```ts
// ❌ WRONG — login uses replica; just-registered user might not be visible yet
const user = await this.userReadRepository.findOneByEmail(email)  // 🚫 replica lag

// ✅ CORRECT — login lookup uses master
const user = await this.userRepository.findOneActiveByEmail(email)
```

Decision rule: if stale data = bug, use master (`XxxRepository`).

---

## ❌ #12 — Switching ValidationPipe to `transform: true`

```ts
// ❌ WRONG — deviates from project convention
app.useGlobalPipes(new ValidationPipe({ transform: true }))

// ✅ CORRECT — keep convention
app.useGlobalPipes(new ValidationPipe({ stopAtFirstError: true, transform: false }))
```

Trade-off: query params arrive as strings; coerce in usecase via `Number(query.page ?? 1)`.

---

## ❌ #13 — Absolute imports `src/...`

```ts
// ❌ WRONG — ESLint rule blocks this
import { Constants } from 'src/app-configs/configs/constant.config'

// ✅ CORRECT
import { Constants } from '../../app-configs/configs/constant.config'
```

---

## ❌ #14 — Magic strings instead of Constants

```ts
// ❌ WRONG
const tenantId = req.headers['x-tenant-id']
@SqsMessageHandler('task-event-queue')

// ✅ CORRECT
const tenantId = req.headers[Constants.HEADER_TENANT_ID]
@SqsMessageHandler(Constants.SQS_QUEUE_TASK_EVENT)
```

---

## ❌ #15 — Raw `Date` arithmetic

```ts
// ❌ WRONG — error-prone, ignores timezone
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)

// ✅ CORRECT — use dayjs through DateUtility
import { DateUtility } from '../../utilities/date.utility'
const tomorrow = DateUtility.addDays(new Date(), 1)
```

(If `DateUtility` doesn't have what you need, ADD a method there — don't do raw arithmetic in usecase.)

---

## ❌ #16 — Skipping ownership check in mutations

```ts
// ❌ WRONG — any authenticated user could mutate any task in their tenant
async updateTask(tenantId, taskId, input) {
  const task = await this.taskRepository.findOneActiveByIdAndTenant(taskId, tenantId)
  if (!task) throw new TaskNotFoundError()
  // missing: ownership check
  await this.taskRepository.save({ ...task, ...input })
}

// ✅ CORRECT — admin OR owner only
async updateTask(tenantId, taskId, requesterUserId, requesterRole, input) {
  const task = await this.taskRepository.findOneActiveByIdAndTenant(taskId, tenantId)
  if (!task) throw new TaskNotFoundError()
  this.assertOwnershipOrAdmin(task, requesterUserId, requesterRole)
  // ...
}
```

---

## ❌ #17 — Different errors for "not found" vs "wrong password"

```ts
// ❌ WRONG — leaks user existence
if (!user) throw new UserNotFoundError()
if (!isValidPassword) throw new InvalidCredentialsError()

// ✅ CORRECT — same error, no enumeration
if (!user) throw new InvalidCredentialsError()
if (!isValidPassword) throw new InvalidCredentialsError()
```
