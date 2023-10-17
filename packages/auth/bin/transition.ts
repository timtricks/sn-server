import 'reflect-metadata'

import { OpenTelemetrySDK, OpenTelemetryTracer } from '@standardnotes/domain-events-infra'
import { ServiceIdentifier, RoleName, TransitionStatus } from '@standardnotes/domain-core'

const sdk = new OpenTelemetrySDK({ serviceName: ServiceIdentifier.NAMES.AuthScheduledTask })
sdk.start()

import { Logger } from 'winston'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'

import { ContainerConfigLoader } from '../src/Bootstrap/Container'
import TYPES from '../src/Bootstrap/Types'
import { Env } from '../src/Bootstrap/Env'
import { DomainEventPublisherInterface } from '@standardnotes/domain-events'
import { DomainEventFactoryInterface } from '../src/Domain/Event/DomainEventFactoryInterface'
import { UserRepositoryInterface } from '../src/Domain/User/UserRepositoryInterface'
import { TimerInterface } from '@standardnotes/time'
import { TransitionStatusRepositoryInterface } from '../src/Domain/Transition/TransitionStatusRepositoryInterface'

const inputArgs = process.argv.slice(2)
const startDateString = inputArgs[0]
const endDateString = inputArgs[1]
const forceRunParam = inputArgs[2]

const requestTransition = async (
  transitionStatusRepository: TransitionStatusRepositoryInterface,
  userRepository: UserRepositoryInterface,
  logger: Logger,
  domainEventFactory: DomainEventFactoryInterface,
  domainEventPublisher: DomainEventPublisherInterface,
  timer: TimerInterface,
): Promise<void> => {
  const startDate = new Date(startDateString)
  const endDate = new Date(endDateString)

  const usersCount = await userRepository.countAllCreatedBetween(startDate, endDate)

  const timestamp = timer.getTimestampInMicroseconds()

  logger.info(
    `[TRANSITION ${timestamp}] Found ${usersCount} users created between ${startDateString} and ${endDateString}`,
  )

  let itemTransitionsTriggered = 0
  let revisionTransitionsTriggered = 0
  const forceRun = forceRunParam === 'true'

  const pageLimit = 100
  const totalPages = Math.ceil(usersCount / pageLimit)
  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    const users = await userRepository.findAllCreatedBetween({
      start: startDate,
      end: endDate,
      offset: (currentPage - 1) * pageLimit,
      limit: pageLimit,
    })

    for (const user of users) {
      const itemsTransitionStatus = await transitionStatusRepository.getStatus(user.uuid, 'items')
      const revisionsTransitionStatus = await transitionStatusRepository.getStatus(user.uuid, 'revisions')

      const userRoles = await user.roles

      const userHasTransitionRole = userRoles.some((role) => role.name === RoleName.NAMES.TransitionUser)
      const bothTransitionStatusesAreVerified =
        itemsTransitionStatus?.value === TransitionStatus.STATUSES.Verified &&
        revisionsTransitionStatus?.value === TransitionStatus.STATUSES.Verified

      if (!userHasTransitionRole && bothTransitionStatusesAreVerified) {
        continue
      }

      logger.info(
        `[TRANSITION ${timestamp}] Transition status for user ${user.uuid} - items status: ${itemsTransitionStatus?.value}, revisions status: ${revisionsTransitionStatus?.value}, has transition role: ${userHasTransitionRole}`,
      )

      if (
        itemsTransitionStatus === null ||
        itemsTransitionStatus.value === TransitionStatus.STATUSES.Failed ||
        (itemsTransitionStatus.value === TransitionStatus.STATUSES.InProgress && forceRun)
      ) {
        await transitionStatusRepository.remove(user.uuid, 'items')

        await domainEventPublisher.publish(
          domainEventFactory.createTransitionRequestedEvent({
            userUuid: user.uuid,
            type: 'items',
            timestamp,
          }),
        )

        itemTransitionsTriggered++
      }

      if (
        revisionsTransitionStatus === null ||
        revisionsTransitionStatus.value === TransitionStatus.STATUSES.Failed ||
        (revisionsTransitionStatus.value === TransitionStatus.STATUSES.InProgress && forceRun)
      ) {
        await transitionStatusRepository.remove(user.uuid, 'revisions')

        await domainEventPublisher.publish(
          domainEventFactory.createTransitionRequestedEvent({
            userUuid: user.uuid,
            type: 'revisions',
            timestamp,
          }),
        )

        revisionTransitionsTriggered++
      }
    }
  }

  logger.info(
    `[TRANSITION ${timestamp}] Triggered ${itemTransitionsTriggered} item transitions and ${revisionTransitionsTriggered} revision transitions for users created between ${startDateString} and ${endDateString}`,
  )
}

const container = new ContainerConfigLoader('worker')
void container.load().then((container) => {
  dayjs.extend(utc)

  const env: Env = new Env()
  env.load()

  const logger: Logger = container.get(TYPES.Auth_Logger)

  logger.info(`Starting transition request for users created between ${startDateString} and ${endDateString}`)

  const userRepository: UserRepositoryInterface = container.get(TYPES.Auth_UserRepository)
  const domainEventFactory: DomainEventFactoryInterface = container.get(TYPES.Auth_DomainEventFactory)
  const domainEventPublisher: DomainEventPublisherInterface = container.get(TYPES.Auth_DomainEventPublisher)
  const timer = container.get<TimerInterface>(TYPES.Auth_Timer)
  const transitionStatusRepository = container.get<TransitionStatusRepositoryInterface>(
    TYPES.Auth_TransitionStatusRepository,
  )

  const tracer = new OpenTelemetryTracer()
  tracer.startSpan(ServiceIdentifier.NAMES.AuthScheduledTask, 'transition')

  Promise.resolve(
    requestTransition(
      transitionStatusRepository,
      userRepository,
      logger,
      domainEventFactory,
      domainEventPublisher,
      timer,
    ),
  )
    .then(() => {
      logger.info(`Finished transition request for users created between ${startDateString} and ${endDateString}`)

      tracer.stopSpan()

      process.exit(0)
    })
    .catch((error) => {
      logger.error(
        `Error while requesting transition for users created between ${startDateString} and ${endDateString}: ${error}`,
      )

      tracer.stopSpanWithError(error)

      process.exit(1)
    })
})
