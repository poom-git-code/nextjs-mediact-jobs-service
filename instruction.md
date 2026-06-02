---
trigger: always_on
---

# NestJS Implementation Guide

## Project Stack
- **Runtime:** Bun
- **Framework:** NestJS with Fastify
- **Database:** Prisma ORM
- **Validation:** class-validator + class-transformer
- **Documentation:** Swagger (@nestjs/swagger)

---

## Layer Architecture

```
Controller → Usecase → Service → Repository → Database
                  ↘            ↘ External Service → Third-party API
```

Each layer has a strict responsibility. **Never skip or merge layers.**

---

## Core Rules — Must Follow Before Writing Any Code

These rules apply across all layers. Violation of any rule is a code review blocker.

### R1 — Layer Separation is Absolute
Controller → Usecase → Service → Repository only. Never skip a layer (e.g. Controller calling Repository directly) or merge two layers into one class.

### R2 — Read/Write Repository Split
Every repository file contains two classes: `XxxRepository` (write — create, update, delete) and `XxxReadRepository` (read — especially joins, aggregations, complex queries). Both classes live in the **same file**.

### R3 — Service Never Touches Prisma
Services call Repositories and External Services only. `PrismaService` must never appear in a Service's constructor — if you need DB access, call a Repository method.

### R4 — Aggregation Belongs at DB Level
`GROUP BY`, `SUM`, `COUNT`, `AVG` and similar aggregations must be done in the Repository via SQL — never loop through results in Service/Usecase to calculate totals in JavaScript.

```typescript
// ✅ CORRECT — aggregate in repository
async getTotalSalesByCategory(
  facilityId: number,
  transaction: Transaction = this.prismaService,
): Promise<CategorySalesTotal[]> {
  const query = Prisma.sql`
    SELECT category_id, SUM(amount) as total_amount, COUNT(*) as order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.facility_id = ${facilityId} AND o.is_active = true
    GROUP BY category_id
  `
  return plainToInstance(CategorySalesTotal, await transaction.$queryRaw<unknown[]>(query), {
    excludeExtraneousValues: true,
  })
}

// ❌ WRONG — aggregating in JS
const items = await this.orderItemReadRepository.findAll(facilityId)
const totals = items.reduce((acc, item) => { ... }, {})  // Don't do this
```

### R5 — Domain Enums for Constants
Status values, type codes, and any fixed set of values must be defined as enums in `domains/*.domain.ts` — never use magic numbers or raw strings.

```typescript
// ✅ CORRECT
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
}

if (order.status !== OrderStatus.PENDING) throw new BussinessException('...')

// ❌ WRONG
if (order.status !== 'PENDING') throw new BussinessException('...')
if (order.type !== 1) throw new BussinessException('...')
```

### R6 — DRY — Check Before You Create
Before creating any new method (repository, service, usecase), **search the codebase** for an existing method that already does the same thing. Duplicate logic is a code review blocker.

### R7 — DTO Decorator Order
Validator decorators (`@IsNotEmpty`, `@IsInt`, etc.) always come **before** `@ApiProperty`. No exceptions.

### R8 — Error Handling
Use `BussinessException` (with error code) for business rule violations. Use `NotFoundException` / `BadRequestException` for HTTP-semantic errors. Never throw generic `Error`. All named errors must be registered in `services/business-errors/index.ts`.

### R9 — No Hardcoded Config
URLs, API keys, credentials, and environment-specific values must come from `ConfigService`. Fixed domain values (statuses, types) must come from Domain Enums (R5).

### R10 — One Controller Per Route Prefix
When a new feature shares the same route prefix as an existing controller, **add methods to the existing controller** — do not create a new controller file. One prefix = one controller file.

```typescript
// ✅ CORRECT — add to existing controller
// file: api.order.controller.ts (prefix = 'api/v1/orders')
@Get(':id/history')     // new endpoint added to existing controller
async getOrderHistory(...) { ... }

// ❌ WRONG — creating a new controller for the same prefix
// file: api.order-history.controller.ts (prefix = 'api/v1/orders')  ← DON'T
```

### R11 — Service Only When Shared
Create a Service class only when the logic is called from **2 or more usecases**. If the logic is specific to a single API route, keep it in the Usecase as a private method.

### R12 — One Repository File = One Table
Each database table gets exactly one repository file containing its `XxxRepository` (write) + `XxxReadRepository` (read). Never put two tables' repository classes in the same file.

```
// ✅ CORRECT
repositories/order.repository.ts          → OrderRepository + OrderReadRepository
repositories/order-item.repository.ts     → OrderItemRepository + OrderItemReadRepository

// ❌ WRONG
repositories/order.repository.ts          → OrderRepository + OrderItemRepository  ← DON'T
```

### R13 — Join/Shaped Queries Belong in ReadRepository
Any query that returns a result different from the table's entity (joins, nested shapes, computed columns) must live in `XxxReadRepository` within the same file as `XxxRepository`.

### R14 — ReadRepository Results Must Be Typed Models
Results from `XxxReadRepository` that are not the plain table entity must be a class with `@Expose()` decorators, placed in `models/*.read.model.ts`. Never use raw `type` aliases or inline `as` casting.

```typescript
// ✅ CORRECT — typed read model in models/order.read.model.ts
export class OrderWithCustomerSummary {
  @Expose() order_id: number
  @Expose() order_code: string
  @Expose() customer_name: string
  @Expose() total_amount: number
  @Expose() item_count: number
}

// In ReadRepository:
return plainToInstance(OrderWithCustomerSummary, results, { excludeExtraneousValues: true })

// ❌ WRONG — raw type or inline cast
type OrderSummary = { order_id: number; customer_name: string }  // Don't use type
return results as OrderSummary[]  // Don't cast directly
```

---

## Global Conventions — Patterns That Apply Everywhere

### Soft-Delete — `is_active` Boolean

This project uses `is_active: boolean` for soft deletes — **not** `deleted_at: Date | null`.

```typescript
// ✅ CORRECT — soft delete
async inactivateById(id: number, transaction: Transaction = this.prismaService) {
  const actionBy = +getUserId()
  return transaction.orders.update({
    where: { id },
    data: {
      is_active: false,
      updated_by: actionBy,
      updated_at: new Date(),
    },
  })
}

// ✅ CORRECT — all read queries must filter active records
WHERE o.is_active = 1    -- raw SQL
{ where: { is_active: true } }  -- Prisma client

// ❌ WRONG — never use deleted_at
data: { deleted_at: new Date() }
```

### Audit Fields — Every Create/Update Must Set Them

All tables have `created_by`, `updated_by`, `created_at`, `updated_at`. These must be set explicitly in every repository write method.

```typescript
// ✅ CREATE — set all 4 fields
const actionBy = +getUserId()
await transaction.orders.create({
  data: {
    ...payload,
    created_by: actionBy,
    updated_by: actionBy,
    created_at: new Date(),
    updated_at: new Date(),
  },
})

// ✅ UPDATE — set updated_by + updated_at
const actionBy = +getUserId()
await transaction.orders.update({
  where: { id },
  data: {
    ...payload,
    updated_by: actionBy,
    updated_at: new Date(),
  },
})
```

### Global Response Interceptor — Do Not Wrap Responses Manually

`CustomResponseInterceptor` (registered in `main.ts`) wraps all responses automatically. Usecases return **plain DTOs** — never wrap them in `{ data, message, statusCode }`.

```typescript
// ✅ CORRECT — return plain DTO
return output  // interceptor wraps it → { data: output, statusCode: 200 }

// ❌ WRONG — manual wrapping (will double-wrap)
return { data: output, message: 'success', statusCode: 200 }
```

### Date/Time — Use `DateUtility` (dayjs-based)

Never use raw `Date` manipulation or `moment`. Use the project's `DateUtility` class which wraps `dayjs` with UTC and timezone support.

```typescript
import { DateUtility } from 'src/utilities/dateUtility'

// Formatting
DateUtility.formattedYYYYMMDD(date)        // '2026-04-10'
DateUtility.parseDateYYYYMMDD('2026-04-10') // Date object (UTC)

// Time
DateUtility.parseTimeHHmmss('08:30:00')    // Date (UTC)
DateUtility.getDifferenceMinutes(start, end)

// Day boundaries
DateUtility.getDateStartOfDay(date)
DateUtility.getDateEndOfDay(date)

// Timezone
DateUtility.todayInTimezone('Asia/Bangkok')
DateUtility.validateTimezone('Asia/Bangkok')  // boolean
DateUtility.ianaToOffset('Asia/Bangkok')      // '+07:00'
```

### Dynamic WHERE — Prisma.sql Conditional Fragments

For optional filter conditions in raw queries, use `Prisma.sql` / `Prisma.empty` ternary pattern — never use string concatenation.

```typescript
// ✅ CORRECT — conditional fragment
const query = Prisma.sql`
  SELECT o.id, o.status
  FROM orders o
  WHERE o.is_active = 1
    ${status ? Prisma.sql`AND o.status = ${status}` : Prisma.empty}
    ${userId ? Prisma.sql`AND o.user_id = ${userId}` : Prisma.empty}
`

// For IN clauses — use Prisma.join()
${ids.length > 0 ? Prisma.sql`AND o.id IN (${Prisma.join(ids)})` : Prisma.empty}

// ❌ WRONG — string concatenation (SQL injection risk)
const where = `WHERE 1=1 ${status ? `AND status = '${status}'` : ''}`
```

### Domain Enum Class — Wrap Enums with Helper Methods

Enums must be string-valued and wrapped in a class that provides validation and helper methods.

```typescript
// ✅ CORRECT — enum + wrapper class
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
}

export class OrderStatusDomain {
  private status: OrderStatus

  constructor(status: OrderStatus) { this.status = status }

  static try(value: string): OrderStatusDomain | null {
    if (Object.values(OrderStatus).includes(value as OrderStatus)) {
      return new OrderStatusDomain(value as OrderStatus)
    }
    return null
  }

  isCancellable(): boolean {
    return [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(this.status)
  }

  isTerminal(): boolean {
    return [OrderStatus.SHIPPED, OrderStatus.CANCELLED].includes(this.status)
  }

  getValue(): OrderStatus { return this.status }
}

// ❌ WRONG — bare enum without class wrapper
if (status === 'PENDING' || status === 'CONFIRMED') { ... }
```

### Module Exports — Export Service Only

When a module needs to share logic with other modules, export only the **Service layer** — never export Repositories directly.

```typescript
// ✅ CORRECT
@Module({
  imports: [PrismaModule],
  providers: [OrderUsecase, OrdersService, OrderRepository, OrderReadRepository],
  exports: [OrdersService],  // only service
})
export class OrdersModule {}

// ❌ WRONG
exports: [OrderRepository, OrderReadRepository]  // never export repositories
```

### Global App Config (for reference)

These are set globally in `main.ts` / `app.module.ts` — do not override or duplicate:

- **Global prefix:** `v2` → all routes are `/v2/{controller-prefix}/{path}`
- **Validation pipe:** `stopAtFirstError: true, transform: false`
- **Response interceptor:** `CustomResponseInterceptor` wraps all responses
- **Exception filter:** `AllExceptionsFilter` handles all unhandled errors
- **Rate limiting:** ThrottlerGuard — 30 requests per 10 seconds
- **File upload:** multipart with 10MB file size limit

---

## Step-by-Step: How to Implement a New Feature

### Step 1 — Define DTOs (`controllers/dto/{client}.{feature}.dto.ts`)

Start here. DTOs define the API contract.

**Request DTO** (query params / body):
```typescript
// Validators FIRST, @ApiProperty LAST — always
export class CreateOrderRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'ORD-001' })
  orderCode: string

  @IsNotEmpty()
  @IsInt()
  @Type(() => Number)
  @ApiProperty({ example: 5 })
  quantity: number

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Express delivery', required: false })
  note?: string
}
```

**Response DTO** (plain classes, no validators needed):
```typescript
export class GetOrderResponse {
  @ApiProperty({ example: 1 })
  id: number

  @ApiProperty({ example: 'ORD-001' })
  orderCode: string

  @ApiProperty({ type: [GetOrderItemResponse] })
  items: GetOrderItemResponse[]
}
```

**Rules:**
- Validator decorators (`@IsNotEmpty`, `@IsInt`, etc.) always come **before** `@ApiProperty`
- Use `@Type(() => Number)` for query params that need type coercion
- Response DTOs only need `@ApiProperty`

---

### Step 2 — Create/Update Repository (`repositories/{feature}.repository.ts`)

Repositories handle **all database access**. Split into read/write classes.

```typescript
// Write operations
@Injectable()
export class OrderRepository {
  constructor(private prismaService: PrismaService) {}

  async create(data: ..., transaction: Transaction = this.prismaService) {
    return transaction.orders.create({ data })
  }

  async updateStatus(id: number, status: string, transaction: Transaction = this.prismaService) {
    return transaction.orders.update({ where: { id }, data: { status } })
  }
}

// Read operations (complex queries, raw SQL)
@Injectable()
export class OrderReadRepository {
  constructor(private prismaService: PrismaService) {}

  async findByIdWithItems(
    orderId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<OrderWithItems | null> {
    const query = Prisma.sql`
      SELECT o.id, o.order_code, o.status, oi.product_name, oi.quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ${orderId} AND o.is_active = true
    `
    const results = await transaction.$queryRaw<unknown[]>(query)
    if (results.length === 0) return null
    return plainToInstance(OrderWithItems, results, { excludeExtraneousValues: true })
  }
}
```

**Rules:**
- Always accept `transaction: Transaction = this.prismaService` as the last parameter
- Use `plainToInstance()` to transform raw results to typed models
- **Return `null`** when not found — never throw from repository
- Use raw SQL (`$queryRaw`) only for complex joins; use Prisma client methods for simple queries
- Separate `XxxRepository` (write) and `XxxReadRepository` (read) in the same file

---

### Step 3 — Create Model (`repositories/models/{entity}.model.ts`)

Models map database results to typed classes using `@Expose`.

```typescript
import { Expose, Type } from 'class-transformer'

export class Order {
  @Expose() id: number
  @Expose() order_code: string
  @Expose() status: string
  @Expose() created_at: Date
  @Expose() is_active: boolean
}

// For read models with nested relations
export class OrderWithItems {
  @Expose() id: number
  @Expose() order_code: string

  @Expose()
  @Type(() => OrderItem)
  items: OrderItem[]
}
```

**Rules:**
- Always use `@Expose()` — models use `excludeExtraneousValues: true`
- Use `@Type()` for nested objects/arrays
- Use `@Transform()` only for encrypted fields or special conversions

---

### Step 4 — Create Service (`services/{feature}.service.ts`)

Services contain **shared/reusable** business logic called by multiple usecases.

**Decision: Service vs Usecase?**
- Will this logic be called from more than one usecase? → **Service**
- Is this logic specific to one API route? → **Usecase**

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private orderReadRepository: OrderReadRepository,
    private orderItemRepository: OrderItemRepository,
    private inventoryService: InventoryService,  // external service
  ) {}

  // Shared: called by both createOrder and importBulkOrders usecases
  async validateAndReserveStock(
    items: OrderItemInput[],
    transaction: Transaction = this.prismaService,
  ): Promise<ReservationResult> {
    // Check stock availability
    // Reserve inventory
    // Return reservation details
    return result
  }
}
```

**Rules:**
- Services call repositories and external services — **never Prisma directly**
- Accept `transaction` parameter to support usecase-level transactions
- Throw `BussinessException` for business rule violations
- Use `customLogger.warn()` for non-fatal anomalies (e.g. missing related data)

---

### Step 5 — Create External Service (`external-services/{name}.service.ts`)

External services handle **all third-party HTTP calls**.

```typescript
@Injectable()
export class PaymentGatewayService {
  private readonly apiUrl: string

  constructor(
    private httpService: HttpService,
    private configService: ConfigService<Configs>,
  ) {
    this.apiUrl = this.configService.get('paymentApiUrl')
  }

  async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
    const response = await lastValueFrom(
      this.httpService
        .post(`${this.apiUrl}/charges`, request, {
          timeout: 30000,
          headers: {
            Authorization: `Bearer ${this.configService.get('paymentApiKey')}`,
          },
        })
        .pipe(map((res) => res.data)),
    )

    // Map third-party error codes to domain errors
    if (response.error_code === 'INSUFFICIENT_FUNDS') throw new PaymentDeclinedError()
    if (response.error_code === 'CARD_EXPIRED') throw new CardExpiredError()
    return response
  }
}

// Define domain errors for external service failures
export class PaymentDeclinedError extends Error {}
export class CardExpiredError extends Error {}
```

**Rules:**
- Inject `ConfigService` for all credentials and URLs — never hardcode
- Use `HttpService` (Axios) with `lastValueFrom` for HTTP calls
- Map third-party error codes/responses to domain-specific error classes
- Define request/response classes in the same file as the service

---

### Step 6 — Create Usecase (`usecases/{feature}.usecase.ts`)

Usecases contain **API-specific orchestration logic** — one method per route.

```typescript
@Injectable()
export class OrderUsecase {
  constructor(
    private ordersService: OrdersService,              // shared service
    private paymentGatewayService: PaymentGatewayService, // external service
    private orderRepository: OrderRepository,
    private orderReadRepository: OrderReadRepository,
    private productReadRepository: ProductReadRepository,
    private prismaService: PrismaService,              // for transactions only
  ) {}

  async createOrder(
    userId: number,
    input: CreateOrderRequest,
  ): Promise<GetOrderResponse> {
    // 1. Validate preconditions
    const product = await this.productReadRepository.findActiveById(input.productId)
    if (!product) throw new BussinessException('Product not found')

    // 2. Load data via repositories
    const [existingOrders, userProfile] = await Promise.all([
      this.orderReadRepository.findPendingByUserId(userId),
      this.userReadRepository.findById(userId),
    ])

    // 3. Delegate shared logic to service
    const reservation = await this.ordersService.validateAndReserveStock(input.items)

    // 4. Use transaction for multi-step writes
    const order = await this.prismaService.$transaction(async (t) => {
      const created = await this.orderRepository.create({ ...input, userId }, t)
      await this.ordersService.finalizeReservation(reservation, created.id, t)
      return created
    })

    // 5. Map result to response DTO
    return this.mapToOrderResponse(order)
  }

  // Private helpers for mapping — keep usecases clean
  private mapToOrderResponse(order: Order): GetOrderResponse {
    const output = new GetOrderResponse()
    // map domain objects → response DTO fields
    return output
  }
}
```

**Rules:**
- One public method per API route — 1:1 mapping with controller
- Always validate inputs early and throw `BussinessException` on failure
- Use `prismaService.$transaction()` when multiple writes must be atomic
- Delegate shared logic to Service; don't duplicate across usecases
- Map results to response DTOs inside the usecase, not in the controller or service
- Use `Promise.all()` for independent parallel queries

---

### Step 7 — Create Controller (`controllers/{client}.{feature}.controller.ts`)

Controllers are thin — route definition, guards, and delegation only.

```typescript
const prefix = 'api/v1/orders'

@ApiTags('Orders')
@Controller(prefix)
@ApiBearerAuth()
export class OrdersController {
  constructor(private orderUsecase: OrderUsecase) {}

  @Post()
  @ApiOperation({ description: 'Create a new order' })
  @SwaggerApiResponse(GetOrderResponse)
  @RequireAuth()   // <-- replace with your project's auth guard
  async createOrder(
    @Headers('x-user-id') userId: string,  // <-- replace with your project's user context extraction
    @Body() body: CreateOrderRequest,
  ): Promise<GetOrderResponse> {
    return this.orderUsecase.createOrder(+userId, body)
  }

  @Get(':id')
  @ApiOperation({ description: 'Get order by ID' })
  @SwaggerApiResponse(GetOrderResponse)
  @RequireAuth()
  async getOrder(
    @Param('id') id: string,
  ): Promise<GetOrderResponse> {
    const idNum = parseInt(id, 10)
    if (isNaN(idNum)) throw new BadRequestException('Invalid order ID')

    return this.orderUsecase.getOrderById(idNum)
  }
}
```

**Rules:**
- Apply auth guards before role guards — order matters
- Parse and validate path params inline (`parseInt` + `isNaN` check) — DTOs only handle query/body
- Pass parsed numbers to usecase — convert with `+` or `parseInt`
- No business logic, no repository calls, no service calls directly
- Use `@ExcludeResponseLogger()` for binary/large responses (e.g. PDF export)

**Guard reference (customize per project):**
| Guard | When to use |
|-------|------------|
| `@RequireAuth()` | Any authenticated route |
| `@RequireRoles(...)` | Routes restricted to specific roles |
| `@RequireTenantAuth()` | Routes scoped to a tenant/organization |

---

### Step 8 — Register in Module (`modules/{client}.{feature}.module.ts`)

Every class used in a feature must be registered in the module's `providers`.

```typescript
@Module({
  controllers: [OrdersController],
  imports: [PrismaModule],
  providers: [
    // Usecases
    OrderUsecase,
    // Services
    OrdersService,
    PaymentGatewayService,
    // Repositories — list ALL repositories used by any usecase or service
    OrderRepository,
    OrderReadRepository,
    OrderItemRepository,
    ProductReadRepository,
  ],
})
export class OrdersModule {}
```

**Rules:**
- If a class is injected anywhere in the module, it must be in `providers`
- If missing: NestJS throws `Nest can't resolve dependencies` at startup
- Import `PrismaModule` — all repositories depend on `PrismaService`

---

## Where to Put Logic — Decision Guide

| Scenario | Where |
|----------|-------|
| Validate input format (type, length, required) | DTO with class-validator |
| Validate path param format (`:id` is a number) | Controller inline |
| Validate business rules (entity exists, status is valid) | Usecase |
| Logic reused by 2+ usecases | Service |
| Database read/write | Repository |
| Third-party API call | External Service |
| Complex multi-step write | Usecase via `prismaService.$transaction()` |
| Shared domain calculation (e.g. pricing, scoring) | Domain class (`domains/*.domain.ts`) |

---

## Error Handling

```typescript
// Business rule violations — use BussinessException (note: typo is intentional, matches codebase)
import { BussinessException } from 'nestjs-custom-module'
if (!order) throw new BussinessException('Order not found')
if (order.status !== 'PENDING') throw new BussinessException('Order is not in pending state')

// Authentication/authorization failures
import { UnauthorizedException } from '@nestjs/common'
throw new UnauthorizedException('Invalid token')

// Input format errors (controller only)
import { BadRequestException } from '@nestjs/common'
if (isNaN(idNum)) throw new BadRequestException('Invalid ID')

// Reusable named errors for common business exceptions
// Place in services/business-errors/index.ts
export class InsufficientStockError extends BussinessException {
  constructor() { super('Insufficient stock for this order', 1001) }
}
```

---

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Controller | `{client}.{feature}.controller.ts` | `api.order.controller.ts` |
| Usecase | `{feature}.usecase.ts` | `order.usecase.ts` |
| Service | `{feature}.service.ts` | `order.service.ts` |
| External Service | `{name}.service.ts` | `payment-gateway.service.ts` |
| Repository | `{feature}.repository.ts` | `order.repository.ts` |
| Model | `{entity}.model.ts` | `order.model.ts` |
| Read Model | `{entity}.read.model.ts` | `order.read.model.ts` |
| DTO | `{client}.{feature}.dto.ts` | `api.order.dto.ts` |
| Domain | `{name}.domain.ts` | `pricing.domain.ts` |
| Module | `{client}.{feature}.module.ts` | `api.order.module.ts` |

---

## Import Conventions

```typescript
// Shared utilities from package
import { BussinessException, SwaggerApiResponse, getUserId, CustomLogger } from 'nestjs-custom-module'

// Guards — use absolute path from src/
import { RequireAuth } from 'src/app-configs/guards/auth.guard'
import { RequireRoles } from 'src/app-configs/guards/roles.guard'
import { Constants } from 'src/app-configs/configs/constant.config'

// Internal — use relative imports
import { OrdersService } from '../services/order.service'
import { OrderRepository } from '../repositories/order.repository'
import { PrismaService, Transaction } from '../../modules/prisma.module'
```

---

## Context Helpers

These request-scoped helpers are available anywhere in the request lifecycle without injection.

### `getUserId()` — Get current authenticated user ID

```typescript
import { getUserId } from 'nestjs-custom-module'

// In usecase: get current user for business logic
const userId = getUserId()

// In repository: set audit fields
const actionBy = +getUserId()
await transaction.orders.update({ data: { updated_by: actionBy } })

// In external service: forward user context to third-party API
headers: { 'x-user-id': getUserId() }
```

### `getLanguage()` — Get current request language (if multi-language is supported)

```typescript
import { getLanguage } from '../../app-configs/middleware/languages.middleware'

// In usecase: localize response fields
const lang = getLanguage()
const name = new Localize({
  [Languages.EN]: item.name_en,
  [Languages.TH]: item.name_th,
}).translate(lang)
```

---

## Localization Pattern

Use `Localize` domain whenever a field has multi-language variants in the database.

```typescript
import { Languages, Localize } from '../domains/localize.domain'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'

// In usecase — translate a single field
const lang = getLanguage()
item.displayName = new Localize({
  [Languages.EN]: record.name_en,
  [Languages.TH]: record.name_th,
}).translate(lang)
```

**Rule:** Never hardcode language-specific strings in usecase. Always use `Localize.translate()`.

---

## Accessing JWT Payload in Controller

When you need role-based branching or tenant context from the JWT claims, inject the request object:

```typescript
import { Role, Roles } from '../domains/roles.domain'

@Get()
@RequireAuth()
@RequireRoles(Roles.ADMIN, Roles.MANAGER)
async listItems(
  @Request() req: ValidAuthRequest,
  @Query() query: GetItemPaginationRequest,
): Promise<GetItemPaginationResponse> {
  const role = Role.try(req.role)
  if (!role) throw new BadRequestException('Invalid role')

  // Branch by role
  if (role.isAdminRole()) return this.itemUsecase.listAll(query)

  // Extract scoped context from JWT claims
  const tenantId = req.tenantId
  return this.itemUsecase.listByTenant(query, tenantId)
}
```

**Rule:** Never pass the entire `req` object to the usecase — extract and pass only what is needed.

---

## Pagination Pattern

### Repository — returns `{ items, total }`

```typescript
async findManyWithPagination(
  page: number,
  pageSize: number,
  search?: string,
  transaction: Transaction = this.prismaService,
): Promise<{ items: ReadItem[]; total: number }> {
  const skip = (page - 1) * pageSize
  const whereConditions: Prisma.Sql[] = []

  // Build dynamic WHERE
  if (search) {
    whereConditions.push(Prisma.sql`t.name LIKE ${`%${search}%`}`)
  }

  const whereClause =
    whereConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`
      : Prisma.empty

  const query = Prisma.sql`
    SELECT t.id, t.name, t.status
    FROM items t
    ${whereClause}
    ORDER BY t.id DESC
    LIMIT ${pageSize} OFFSET ${skip}
  `

  const countQuery = Prisma.sql`
    SELECT COUNT(*) as total FROM items t ${whereClause}
  `

  // Run data + count queries in parallel
  const [rows, countResult] = await Promise.all([
    transaction.$queryRaw<any[]>(query),
    transaction.$queryRaw(countQuery),
  ])

  return {
    items: plainToInstance(ReadItem, rows, { excludeExtraneousValues: true }),
    total: Number(countResult[0]?.total || 0),
  }
}
```

### Usecase — assembles pagination response

```typescript
async getItemsWithPagination(input: GetItemPaginationRequest): Promise<GetItemPaginationResponse> {
  const { items, total } = await this.itemReadRepository.findManyWithPagination(
    input.page,
    input.pageSize,
    input.search,
  )

  const output = new GetItemPaginationResponse()
  output.data = items.map((item) => { /* map to DTO */ })
  output.page = input.page
  output.pageSize = input.pageSize
  output.total = total
  output.totalPages = Math.ceil(total / input.pageSize)
  return output
}
```

---

## Business Errors — Central Error Registry

All reusable business exceptions live in `services/business-errors/index.ts`. Each error has a **unique numeric code**.

```typescript
// services/business-errors/index.ts
import { BussinessException } from 'nestjs-custom-module'
import { BadRequestException, NotFoundException } from '@nestjs/common'

// Subclass BussinessException for domain errors (always include error code)
export class InsufficientStockError extends BussinessException {
  constructor() { super('Insufficient stock for this order', 1001) }
}

export class OrderAlreadyCancelledError extends BussinessException {
  constructor(orderId: number) {
    super(`Order #${orderId} has already been cancelled`, 1002)
  }
}

// Subclass NestJS exceptions for HTTP-semantic errors (404, 400)
export class ProductNotFoundException extends NotFoundException {
  constructor() { super('Product not found.') }
}

export class InvalidQuantityException extends BadRequestException {
  constructor() { super('Quantity must be greater than zero.') }
}
```

**Rules:**
- Register every new named error in `business-errors/index.ts`
- Always assign a unique numeric error code to `BussinessException` subclasses
- Use `NotFoundException` / `BadRequestException` subclasses for HTTP-semantic cases (not found, bad input)
- Use `BussinessException` subclasses for domain rule violations
- Import from `'../services/business-errors'` in usecases/services

---

## Testing Convention — Vitest

Tests live in `test/` mirroring the `src/` structure. Mocks go in `test/mock/`.

### Test File Structure

```typescript
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'

describe('OrderUsecase Unit Test', () => {
  let moduleRef: TestingModule
  let usecase: OrderUsecase
  let orderRepository: Record<keyof OrderRepository, any>
  let orderReadRepository: Record<keyof OrderReadRepository, any>

  beforeEach(async () => {
    vi.clearAllMocks()

    orderRepository = {
      create: vi.fn(),
      updateStatus: vi.fn(),
    }
    orderReadRepository = {
      findByIdWithItems: vi.fn(),
      findManyWithPagination: vi.fn(),
    }

    moduleRef = await Test.createTestingModule({
      providers: [
        OrderUsecase,
        { provide: OrderRepository, useValue: orderRepository },
        { provide: OrderReadRepository, useValue: orderReadRepository },
        { provide: CustomLogger, useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } },
        { provide: PrismaService, useValue: { $transaction: vi.fn((fn) => fn({})) } },
      ],
    }).compile()

    usecase = moduleRef.get<OrderUsecase>(OrderUsecase)
  })

  afterEach(() => {
    moduleRef?.close()
  })

  describe('createOrder()', () => {
    describe('Success Scenarios', () => {
      it('GIVEN valid input WHEN createOrder called THEN should create order and return response', async () => {
        // GIVEN
        const input = { productId: 1, quantity: 5 }
        orderReadRepository.findByIdWithItems.mockResolvedValue(mockOrder)

        // WHEN
        const result = await usecase.createOrder(1, input)

        // THEN
        expect(result).toBeDefined()
        expect(orderRepository.create).toHaveBeenCalledOnce()
      })
    })

    describe('Error Scenarios', () => {
      it('GIVEN non-existent product WHEN createOrder called THEN should throw BussinessException', async () => {
        // GIVEN
        orderReadRepository.findByIdWithItems.mockResolvedValue(null)

        // WHEN & THEN
        await expect(usecase.createOrder(1, input)).rejects.toThrow(BussinessException)
      })
    })
  })
})
```

**Rules:**
- **Naming:** `GIVEN [context] WHEN [action] THEN [expected result]`
- **Mock pattern:** `Record<keyof T, any>` with `vi.fn()` for each method
- **Setup:** `vi.clearAllMocks()` in `beforeEach`, `moduleRef?.close()` in `afterEach`
- **Structure:** Nested `describe()` blocks — `Success Scenarios` / `Error Scenarios`
- **Assertions:** Use `expect().toBeDefined()`, `expect().toHaveBeenCalledOnce()`, `expect().rejects.toThrow()`
- **PrismaService mock:** `$transaction: vi.fn((fn) => fn({}))` to execute the callback immediately

---

## DO NOT — Mandatory Checklist

> Every item below maps to a Core Rule (R1–R14). Violation = code review blocker.

1. **Never** put business logic in Controller — only routing, guards, DTO binding *(R1)*
2. **Never** call Prisma directly from Usecase or Service — always go through Repository *(R3)*
3. **Never** call HTTP directly from Usecase or Service — always go through External Service *(R1)*
4. **Never** throw generic `Error` — use `BussinessException` or named error subclasses *(R8)*
5. **Never** hardcode URLs, keys, or credentials — use `ConfigService` or Domain Enum *(R9, R5)*
6. **Never** put logic that's reused across usecases in a Usecase — move it to Service *(R11)*
7. **Never** omit `transaction` parameter from repository methods — always support it *(R2)*
8. **Never** put `@ApiProperty` before validators in DTOs *(R7)*
9. **Never** pass `req` object to usecase — extract fields (`userId`, `role`, etc.) in controller *(R1)*
10. **Never** inline bilingual string selection — always use `Localize.translate()`
11. **Never** create a new named error inline — add it to `business-errors/index.ts` with a unique code *(R8)*
12. **Never** create a new controller file when the route prefix already has a controller — add methods to the existing one *(R10)*
13. **Never** create a Service for logic used by only one usecase — keep it as a private method in the usecase *(R11)*
14. **Never** put two tables' repositories in the same file — one file per table *(R12)*
15. **Never** aggregate data (SUM, COUNT, GROUP BY) in JS loops — do it in SQL at the repository level *(R4)*
16. **Never** use magic numbers or raw strings for statuses/types — define Domain Enums *(R5)*
17. **Never** use `type` aliases or `as` casting for ReadRepository results — create a class with `@Expose()` in `models/*.read.model.ts` *(R14)*
18. **Never** create a new method without first searching for an existing one that does the same thing *(R6)*
19. **Never** use `deleted_at` for soft deletes — use `is_active: false` and always filter `is_active = true` in reads
20. **Never** forget audit fields (`created_by`, `updated_by`, `created_at`, `updated_at`) on create/update operations
21. **Never** wrap responses manually in usecase — `CustomResponseInterceptor` does it globally
22. **Never** use raw `Date` manipulation (`.getMonth()`, `.setDate()`, etc.) — use `DateUtility` (dayjs-based)
23. **Never** build dynamic WHERE clauses with string concatenation — use `Prisma.sql` / `Prisma.empty` ternary pattern
24. **Never** export Repository from a module — export only Service layer
25. **Never** use bare enums without a wrapper class that has `try()` and helper methods