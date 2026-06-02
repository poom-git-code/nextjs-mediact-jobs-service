# Notification Service Flow

## Sequence Diagram

```mermaid
sequenceDiagram
    participant ExtService as External Service
    participant API as API Controller
    participant ApiUsecase as API Usecase
    participant MsgBuilder as MessageBuilderService
    participant NotifRepo as NotificationRepository
    participant SQS_R as SQS (Recipient Queue)
    participant RecipientConsumer as Consumer (Recipient)
    participant ConsumerUsecase as ConsumerUsecase
    participant RecipientGen as RecipientGeneratorService
    participant BatchRepo as NotificationBatchRepository
    participant UserReadRepo as UserReadRepository
    participant SQS_D as SQS (Delivery Queue)
    participant DeliveryConsumer as Consumer (Delivery)
    participant DeliverService as NotificationDeliverService
    participant UserNotifRepo as UserNotificationRepository
    participant FCM as Firebase Cloud Messaging
    participant DB as Database

    %% Phase 1: API Request & Message Building
    rect rgb(200, 230, 200)
        Note over ExtService,SQS_R: Phase 1: Message Building
        ExtService->>API: POST /api/send (eventName, payload)
        API->>ApiUsecase: sendNotification(body)
        ApiUsecase->>ApiUsecase: resolvePayload(eventName, payload)
        ApiUsecase->>MsgBuilder: sendSwapRequestToPartnerMessage(payload)
        MsgBuilder->>NotifRepo: create(notification)
        NotifRepo->>DB: INSERT notifications (status: pending)
        DB-->>NotifRepo: notification
        NotifRepo-->>MsgBuilder: notification
        MsgBuilder->>SQS_R: send({notificationId})
        SQS_R-->>MsgBuilder: ack
        MsgBuilder-->>ApiUsecase: void
        ApiUsecase-->>API: PostSendResponse
        API-->>ExtService: 200 OK
    end

    %% Phase 2: Recipient Generation
    rect rgb(200, 200, 230)
        Note over SQS_R,SQS_D: Phase 2: Recipient Generation
        SQS_R->>RecipientConsumer: message (notificationId)
        RecipientConsumer->>ConsumerUsecase: handleRecipientGenerator(retryCount, input)
        
        alt retryCount > MAX_RETRIES
            ConsumerUsecase->>NotifRepo: updateStatus(id, failed)
            ConsumerUsecase-->>RecipientConsumer: return
        end
        
        ConsumerUsecase->>NotifRepo: findOneById(notificationId)
        NotifRepo->>DB: SELECT * FROM notifications
        DB-->>NotifRepo: notification
        NotifRepo-->>ConsumerUsecase: notification
        
        alt notification.status != pending
            ConsumerUsecase-->>RecipientConsumer: skip (idempotency)
        end
        
        ConsumerUsecase->>ConsumerUsecase: $transaction start
        ConsumerUsecase->>RecipientGen: resolveRecipientTargetUsers(notification, tx)
        
        RecipientGen->>BatchRepo: existsByNotificationId(id)
        BatchRepo->>DB: SELECT COUNT(*) FROM notification_batches
        DB-->>BatchRepo: count
        BatchRepo-->>RecipientGen: exists
        
        alt batches exist
            RecipientGen-->>ConsumerUsecase: skip (idempotency)
        end
        
        RecipientGen->>NotifRepo: updateStatus(id, processing)
        NotifRepo->>DB: UPDATE notifications SET status = 'processing'
        
        RecipientGen->>UserReadRepo: findChunkByCriteria(criteria, batchLimit)
        UserReadRepo->>DB: SELECT chunks (user_id ranges)
        DB-->>UserReadRepo: chunks
        UserReadRepo-->>RecipientGen: chunks
        
        alt no chunks
            RecipientGen->>NotifRepo: updateStatus(id, sent)
            RecipientGen-->>ConsumerUsecase: {batchCount: 0}
        end
        
        RecipientGen->>BatchRepo: createMany(notificationId, chunks)
        BatchRepo->>DB: INSERT notification_batches (status: pending)
        DB-->>BatchRepo: batches
        BatchRepo-->>RecipientGen: batches
        
        loop for each batch
            RecipientGen->>SQS_D: send({notificationId, batchId})
            SQS_D-->>RecipientGen: ack
        end
        
        RecipientGen-->>ConsumerUsecase: {batchCount: N}
        ConsumerUsecase->>ConsumerUsecase: $transaction commit
        ConsumerUsecase-->>RecipientConsumer: void
    end

    %% Phase 3: Delivery (per batch)
    rect rgb(230, 200, 200)
        Note over SQS_D,FCM: Phase 3: Delivery (per batch)
        SQS_D->>DeliveryConsumer: message (notificationId, batchId)
        DeliveryConsumer->>ConsumerUsecase: handleDeliveryNotifications(retryCount, input)
        
        alt retryCount > MAX_RETRIES
            ConsumerUsecase->>BatchRepo: updateStatus(batchId, failed)
            ConsumerUsecase-->>DeliveryConsumer: return
        end
        
        ConsumerUsecase->>NotifRepo: findOneById(notificationId)
        ConsumerUsecase->>BatchRepo: findOneById(batchId)
        
        alt batch.status != pending
            ConsumerUsecase-->>DeliveryConsumer: skip (idempotency)
        end
        
        ConsumerUsecase->>ConsumerUsecase: $transaction start
        ConsumerUsecase->>BatchRepo: updateStatus(batchId, processing)
        
        ConsumerUsecase->>UserReadRepo: findWithPushTokenByCriteria(criteria, limit, cursor)
        UserReadRepo->>DB: SELECT user_id, push_token FROM users
        DB-->>UserReadRepo: recipients
        UserReadRepo-->>ConsumerUsecase: recipients
        
        ConsumerUsecase->>DeliverService: sendNotifications(notification, recipients, tx)
        
        DeliverService->>UserNotifRepo: createWithPendingStatus(notificationId, userIds)
        UserNotifRepo->>DB: INSERT user_notifications (push_status: pending)
        DB-->>UserNotifRepo: count
        UserNotifRepo-->>DeliverService: {count}
        
        DeliverService->>FCM: sendToMultipleDevices(tokens, message)
        
        alt FCM success
            FCM-->>DeliverService: success
            DeliverService->>UserNotifRepo: updatePushStatusByNotificationAndUsers(success)
            UserNotifRepo->>DB: UPDATE user_notifications SET push_status = 'success'
            DeliverService-->>ConsumerUsecase: {success: N, failed: 0}
        else FCM failure
            FCM-->>DeliverService: error
            DeliverService->>UserNotifRepo: updatePushStatusByNotificationAndUsers(failed)
            UserNotifRepo->>DB: UPDATE user_notifications SET push_status = 'failed'
            DeliverService-->>ConsumerUsecase: throw error
        end
        
        ConsumerUsecase->>BatchRepo: updateStatus(batchId, sent)
        ConsumerUsecase->>ConsumerUsecase: $transaction commit
        
        %% Batch completion check
        ConsumerUsecase->>ConsumerUsecase: checkAndUpdateNotificationCompletion()
        ConsumerUsecase->>BatchRepo: countByNotificationId(notificationId)
        ConsumerUsecase->>BatchRepo: countByNotificationIdAndStatus(sent)
        ConsumerUsecase->>BatchRepo: countByNotificationIdAndStatus(failed)
        
        alt all batches completed
            ConsumerUsecase->>NotifRepo: updateStatus(id, sent/failed)
            NotifRepo->>DB: UPDATE notifications SET status = 'sent'
        end
        
        ConsumerUsecase-->>DeliveryConsumer: void
    end
```

## Status Transitions

### Notification Status Flow
```
pending → processing → sent
                    ↘ failed
```

### Notification Batch Status Flow
```
pending → processing → sent
                    ↘ failed
```

### User Notification Push Status Flow
```
pending → success
       ↘ failed
```

## Key Features

### 1. Idempotency
- **Recipient Generator**: Checks if notification status is `pending` before processing
- **Recipient Generator**: Checks if batches already exist before creating
- **Delivery**: Checks if batch status is `pending` before processing

### 2. Error Handling
- Max retry limits with status updates on failure
- Transaction rollback on errors
- FCM failures are caught and recorded

### 3. Batch Completion Tracking
- After each batch delivery, checks if all batches are complete
- Updates notification status to `sent` only when all batches succeed
- Updates notification status to `failed` if any batch fails

### 4. Proper Status Flow
- `push_status: pending` on insert to `user_notifications`
- `push_status: success/failed` after FCM call
- Notification transitions: `pending → processing → sent/failed`

## Database Tables

| Table | Purpose |
|-------|---------|
| `notifications` | Main notification record with target info |
| `notification_batches` | Batch records for chunked processing |
| `user_notifications` | Per-user delivery records (inbox) |
| `user_devices` | User push tokens |
| `users` | User information |

## Message Queues

| Queue | Purpose |
|-------|---------|
| `SQS_QUEUE_RECIPIENT_NAME` | Recipient generation jobs |
| `SQS_QUEUE_DELIVERY_NAME` | Batch delivery jobs |
