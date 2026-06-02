import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import ky from 'ky'
import { Configs } from '../../app-configs/configs/env.config'
import { CustomLogger } from 'nestjs-custom-module'

@Injectable()
export class NotifyService {
  private token: string
  private chatId: string
  constructor(
    private customLogger: CustomLogger,
    private configService: ConfigService<Configs>,
  ) {
    this.token = configService.get('telegramNotifyToken')
    this.chatId = configService.get('telegramChatId')
  }

  async sendNotiIgnoreError(message: string) {
    const body = JSON.stringify({
      chat_id: parseInt(this.chatId),
      text: message,
    })
    await ky
      .post(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        body,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .catch((e) => {
        this.customLogger.error(e)
      })
  }
}
