---
trigger: always_on
---

---
trigger: always_on
---

# NestJS Implementation Rules

## Project Stack
- **Runtime:** Bun
- **Framework:** NestJS with Fastify
- **Database:** Prisma ORM
- **Testing:** Vitest
- **Validation:** class-validator
- **Documentation:** Swagger

## Layer Architecture

Follow this strict layer separation:

```
Controller → Usecase → Service → Repository → Database
                  ↘            ↘ External Service → Third-party API
```

### Controller Layer
- Define routes and HTTP methods
- Apply guard decorators: `@RequireJwtApp()`, `@RequireJwtBackoffice()`, `@RequireFacilityAuth()`, `@RequireRoles()`
- Apply documentation decorators: `@SwaggerApiResponse()`, `@ApiOperation()`
- Validate input using DTO with class-validator
- Delegate ALL business logic to Usecase layer
- Access JWT payload via `@Request() req: ValidJwtAppRequest` or `ValidJwtBackofficeRequest`
- Access facility ID header via `@Headers(Constants.HEADER_FACILITY_ID)`

### Usecase Layer
- Contains API-specific business logic (1:1 mapping with controller routes)
- Coordinates between services and repositories
- Maps data to response DTOs
- Handles transactions via `prismaService.$transaction()`
- Can call multiple services and repositories
- Throw `BussinessException` from `nestjs-custom-module` for errors

### Service Layer
- Contains **shared/reusable** business logic
- Can be used by multiple usecases
- Implements common operations (e.g., `validateDepartmentAccess`, `generateAccessToken`)
- Never call Prisma or HTTP directly - use Repository or External Service
- Throw `BussinessException` for errors

### Repository Layer
- Handle all database operations via PrismaService
- Use `plainToInstance()` to transform Prisma results to Models
- Return `null` when entity not found (don't throw)
- Support transaction parameter for all methods

### External Service Layer
- Handle all third-party API calls
- Use `ky` for HTTP requests
- Inject `ConfigService` for credentials

## Guards

The project uses 4 main guards for authentication and authorization:

### 1. JWT App Guard (`@RequireJwtApp()`)
- Validates JWT tokens for mobile app users
- Checks `client` claim equals `APPLICATION`
- Populates request with: `userId`, `client`, `email`, `authorizeFacilities`, `role`
- Import: `import { RequireJwtApp, ValidJwtAppRequest } from 'src/app-configs/guards/jwt.app.guard'`

### 2. JWT Backoffice Guard (`@RequireJwtBackoffice()`)
- Validates JWT tokens for backoffice/admin users
- Checks `client` claim equals `BACKOFFICE`
- Populates request with: `userId`, `client`, `email`, `authorizeFacilities`, `role`
- Import: `import { RequireJwtBackoffice, ValidJwtBackofficeRequest } from 'src/app-configs/guards/jwt.backoffice.guard'`

### 3. Facility Guard (`@RequireFacilityAuth()`)
- Validates facility access by comparing header with JWT claims
- Requires `x-facility-id` header
- Checks if header facility ID is in `authorizeFacilities` claim
- Supports: `*` (all facilities), single ID, comma-separated IDs
- Import: `import { RequireFacilityAuth } from 'src/app-configs/guards/facility.guard'`

### 4. Roles Guard (`@RequireRoles()`)
- Validates user role from JWT claims
- Accepts multiple roles: `@RequireRoles(Roles.MEDIACT_ADMIN, Roles.PARTNER_ADMIN)`
- Import: `import { RequireRoles } from 'src/app-configs/guards/roles.guard'`

### Guard Usage Example
```typescript
@Post('/:departmentId/employees')
@RequireJwtBackoffice()
@RequireFacilityAuth()
@RequireRoles(Roles.MEDIACT_ADMIN, Roles.PARTNER_ADMIN)
@ApiOperation({ description: 'Add employee to department' })
@SwaggerApiResponse(PostDepartmentsEmployeesResponse)
async addEmployee(
  @Headers(Constants.HEADER_FACILITY_ID) facilityId: string,
  @Param('departmentId') departmentId: string,
  @Body() body: PostDepartmentsEmployeesRequest,
): Promise<PostDepartmentsEmployeesResponse> {
  return this.departmentUsecase.addNewUserAsEmployeeInToDepartment(+facilityId, +departmentId, body)
}
```

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Controller | `{client}.{feature}.controller.ts` | `backoffice.department.controller.ts` |
| Usecase | `{feature}.usecase.ts` | `department.usecase.ts` |
| Service | `{feature}.service.ts` | `authentication.service.ts` |
| Repository | `{feature}.repository.ts` | `user.repository.ts` |
| DTO | `{client}.{feature}.dto.ts` | `backoffice.department.dto.ts` |
| Model | `{entity}.model.ts` | `user.model.ts` |
| Domain | `{name}.domain.ts` | `access-token-claims.domain.ts` |
| External Service | `{name}.service.ts` | `mail.service.ts` |
| Module | `{client}.{feature}.module.ts` | `backoffice.department.module.ts` |
| Guard | `{name}.guard.ts` | `jwt.app.guard.ts` |

## Import Conventions

```typescript
// Use nestjs-custom-module for shared utilities
import { BussinessException, SwaggerApiResponse } from 'nestjs-custom-module'

// Use src/ path for app-configs
import { RequireJwtBackoffice, ValidJwtBackofficeRequest } from 'src/app-configs/guards/jwt.backoffice.guard'
import { RequireFacilityAuth } from 'src/app-configs/guards/facility.guard'
import { RequireRoles } from 'src/app-configs/guards/roles.guard'
import { Constants } from 'src/app-configs/configs/constant.config'

// Use relative imports for same-layer files
import { UserService } from '../services/user.service'
import { DepartmentUsecase } from '../usecases/department.usecase'
```

## Error Handling

Always use `BussinessException` for business errors:

```typescript
import { BussinessException } from 'nestjs-custom-module'

if (!entity) throw new BussinessException('Entity not found')
if (!authorized) throw new BussinessException('Permission denied')
```

Use `UnauthorizedException` for authentication/authorization errors:

```typescript
import { UnauthorizedException } from '@nestjs/common'

if (!validPassword) throw new UnauthorizedException('Invalid password')
if (!validClient) throw new UnauthorizedException('Invalid client')
```

## Implementation Checklist

When implementing a new feature:

1. Create DTO in `controllers/dto/` with validation decorators
2. Create/update Model in `repositories/models/` with `@Expose` decorators
3. Create Repository in `repositories/` with Prisma queries
4. Create Service in `services/` if shared logic is needed
5. Create Usecase in `usecases/` with API-specific logic
6. Create Controller in `controllers/` with route and decorators
7. Create Module in `modules/` and register all components
8. Add Module to `AppModule` imports
9. Create unit tests following unit-test rules
10. Run `bun run test:cov` to verify tests pass

## DO NOT

1. **Never** put business logic in Controller or Repository
2. **Never** call Prisma directly from Usecase or Service - use Repository
3. **Never** call HTTP directly from Usecase or Service - use External Service
4. **Never** throw generic `Error` - use `BussinessException`
5. **Never** hardcode configuration values - use ConfigService
6. **Never** put shared/reusable logic in Usecase - use Service instead

# DTO Patterns and Rules

## Decorator Order Rule
**CRITICAL:** When creating DTOs, decorators must follow this specific order:
- **Validator decorators FIRST** (from class-validator)
- **@ApiProperty() decorator LAST** (from @nestjs/swagger)

## Request DTO Pattern
```typescript
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class GetFacilityPaginationRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 1, required: false })
  page?: number = 1

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiProperty({ example: 25, required: false })
  pageSize?: number = 25

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'โรงพยาบาลABC', required: false })
  facilityName?: string
}
```

## Response DTO Pattern
```typescript
import { ApiProperty } from '@nestjs/swagger'

export class FacilityListResponseItem {
  @ApiProperty({ example: 1 })
  id: number

  @ApiProperty({ example: 'โรงพยาบาลABC' })
  facilityName: string

  @ApiProperty({ example: 'ABC' })
  abbreviation: string

  @ApiProperty({ example: 'Hospital' })
  facilityTypeName: string

  @ApiProperty({ example: 'จังหวัดตามภาษา' })
  province: string

  @ApiProperty({ example: 'อำเภอตามภาษา' })
  district: string

  @ApiProperty({ example: 'ตำบลตามภาษา' })
  subdistrict: string

  @ApiProperty({ example: '11111' })
  postalCode: string

  @ApiProperty({ example: '11.11' })
  latitude: string

  @ApiProperty({ example: '103.00' })
  longitude: string

  @ApiProperty({ example: '2025-11-09T01:12:53Z' })
  createdAt: string
}
```

## Pagination Response Pattern
```typescript
import { ApiProperty } from '@nestjs/swagger'

export class FacilityListResponse {
  @ApiProperty({ type: [FacilityListResponseItem] })
  data: FacilityListResponseItem[]

  @ApiProperty({ example: 1 })
  page: number

  @ApiProperty({ example: 25 })
  pageSize: number

  @ApiProperty({ example: 100 })
  total: number

  @ApiProperty({ example: 4 })
  totalPages: number
}
```

## Common Validator Decorators
- `@IsOptional()` - Field is optional
- `@IsString()` - Must be a string
- `@IsInt()` - Must be an integer
- `@IsEmail()` - Must be a valid email
- `@IsNotEmpty()` - Cannot be empty
- `@Min(value)` - Minimum value for numbers
- `@Max(value)` - Maximum value for numbers
- `@MinLength(length)` - Minimum string length
- `@MaxLength(length)` - Maximum string length

## Best Practices
1. **Always follow decorator order**: Validators first, @ApiProperty last
2. **Use descriptive examples** in @ApiProperty for documentation
3. **Set required: false** for optional fields in @ApiProperty
4. **Provide default values** for optional query parameters
5. **Use proper TypeScript types** for all properties
6. **Group related properties** together in the DTO

## Wrong vs Right Examples

### ❌ WRONG - @ApiProperty first
```typescript
export class BadExample {
  @ApiProperty({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1
}
```

### ✅ RIGHT - Validators first, @ApiProperty last
```typescript
export class GoodExample {
  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 1, required: false })
  page?: number = 1
}
```