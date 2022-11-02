import {
  HttpStatusCode,
  UserRequestRequestParams,
  UserRequestResponse,
  UserRequestServerInterface,
} from '@standardnotes/api'
import { inject, injectable } from 'inversify'
import TYPES from '../Bootstrap/Types'
import { ProcessUserRequest } from '../Domain/UseCase/ProcessUserRequest/ProcessUserRequest'

@injectable()
export class UserRequestsController implements UserRequestServerInterface {
  constructor(@inject(TYPES.ProcessUserRequest) private processUserRequest: ProcessUserRequest) {}

  async submitUserRequest(params: UserRequestRequestParams): Promise<UserRequestResponse> {
    const result = await this.processUserRequest.execute({
      requestType: params.requestType,
      userEmail: params.userEmail as string,
      userUuid: params.userUuid,
    })

    if (!result.success) {
      return {
        status: HttpStatusCode.BadRequest,
        data: result,
      }
    }

    return {
      status: HttpStatusCode.Success,
      data: result,
    }
  }
}