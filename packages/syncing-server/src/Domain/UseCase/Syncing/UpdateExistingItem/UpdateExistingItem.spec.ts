import { DomainEventInterface, DomainEventPublisherInterface } from '@standardnotes/domain-events'
import { Timer, TimerInterface } from '@standardnotes/time'
import { DomainEventFactoryInterface } from '../../../Event/DomainEventFactoryInterface'
import { Item } from '../../../Item/Item'
import { ItemHash } from '../../../Item/ItemHash'
import { ItemRepositoryInterface } from '../../../Item/ItemRepositoryInterface'
import { UpdateExistingItem } from './UpdateExistingItem'
import { Uuid, ContentType, Dates, Timestamps, UniqueEntityId, Result } from '@standardnotes/domain-core'
import { SharedVaultAssociation } from '../../../SharedVault/SharedVaultAssociation'
import { KeySystemAssociation } from '../../../KeySystem/KeySystemAssociation'

describe('UpdateExistingItem', () => {
  let itemRepository: ItemRepositoryInterface
  let timer: TimerInterface
  let domainEventPublisher: DomainEventPublisherInterface
  let domainEventFactory: DomainEventFactoryInterface
  let itemHash1: ItemHash
  let item1: Item

  const createUseCase = () => new UpdateExistingItem(itemRepository, timer, domainEventPublisher, domainEventFactory, 5)

  beforeEach(() => {
    const timeHelper = new Timer()

    item1 = Item.create(
      {
        userUuid: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        updatedWithSession: null,
        content: 'foobar',
        contentType: ContentType.create(ContentType.TYPES.Note).getValue(),
        encItemKey: null,
        authHash: null,
        itemsKeyId: null,
        duplicateOf: null,
        deleted: false,
        dates: Dates.create(new Date(1616164633241311), new Date(1616164633241311)).getValue(),
        timestamps: Timestamps.create(1616164633241311, 1616164633241311).getValue(),
      },
      new UniqueEntityId('00000000-0000-0000-0000-000000000000'),
    ).getValue()

    itemHash1 = ItemHash.create({
      uuid: '1-2-3',
      user_uuid: '00000000-0000-0000-0000-000000000000',
      key_system_identifier: null,
      shared_vault_uuid: null,
      content: 'asdqwe1',
      content_type: ContentType.TYPES.Note,
      duplicate_of: null,
      enc_item_key: 'qweqwe1',
      auth_hash: 'auth_hash',
      items_key_id: 'asdasd1',
      created_at: timeHelper.formatDate(
        timeHelper.convertMicrosecondsToDate(item1.props.timestamps.createdAt),
        'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
      ),
      updated_at: timeHelper.formatDate(
        new Date(timeHelper.convertMicrosecondsToMilliseconds(item1.props.timestamps.updatedAt) + 1),
        'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
      ),
    }).getValue()

    itemRepository = {} as jest.Mocked<ItemRepositoryInterface>
    itemRepository.save = jest.fn()

    timer = {} as jest.Mocked<TimerInterface>
    timer.getTimestampInMicroseconds = jest.fn().mockReturnValue(123456789)
    timer.convertMicrosecondsToDate = jest.fn().mockReturnValue(new Date(123456789))
    timer.convertStringDateToMicroseconds = jest.fn().mockReturnValue(123456789)
    timer.convertMicrosecondsToSeconds = jest.fn().mockReturnValue(123456789)
    timer.convertStringDateToDate = jest.fn().mockReturnValue(new Date(123456789))

    domainEventPublisher = {} as jest.Mocked<DomainEventPublisherInterface>
    domainEventPublisher.publish = jest.fn()

    domainEventFactory = {} as jest.Mocked<DomainEventFactoryInterface>
    domainEventFactory.createDuplicateItemSyncedEvent = jest
      .fn()
      .mockReturnValue({} as jest.Mocked<DomainEventInterface>)
    domainEventFactory.createItemRevisionCreationRequested = jest
      .fn()
      .mockReturnValue({} as jest.Mocked<DomainEventInterface>)
  })

  it('should update item', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: itemHash1,
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeFalsy()
    expect(itemRepository.save).toHaveBeenCalled()
  })

  it('should return error if session uuid is invalid', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: itemHash1,
      sessionUuid: 'invalid-uuid',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()
  })

  it('should return error if content type is invalid', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        content_type: 'invalid',
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()
  })

  it('should mark item as deleted if item hash is deleted', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        deleted: true,
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeFalsy()
    expect(itemRepository.save).toHaveBeenCalled()
    expect(item1.props.deleted).toBeTruthy()
    expect(item1.props.content).toBeNull()
    expect(item1.props.encItemKey).toBeNull()
    expect(item1.props.authHash).toBeNull()
    expect(item1.props.itemsKeyId).toBeNull()
    expect(item1.props.duplicateOf).toBeNull()
  })

  it('should mark item as duplicate if item hash has duplicate_of', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        duplicate_of: '00000000-0000-0000-0000-000000000001',
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeFalsy()
    expect(itemRepository.save).toHaveBeenCalled()
    expect(item1.props.duplicateOf?.value).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('shuld return error if duplicate uuid is invalid', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        duplicate_of: 'invalid-uuid',
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()
  })

  it('should update item with update timestamps', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        updated_at_timestamp: 123,
        created_at_timestamp: 123,
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeFalsy()
    expect(itemRepository.save).toHaveBeenCalled()
  })

  it('should return error if created at time is not give in any form', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        created_at: undefined,
        created_at_timestamp: undefined,
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()
  })

  it('should return error if dates could not be created from timestamps', async () => {
    const mock = jest.spyOn(Dates, 'create')
    mock.mockImplementation(() => {
      return Result.fail('Oops')
    })

    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        created_at_timestamp: 123,
        updated_at_timestamp: 123,
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()

    mock.mockRestore()
  })

  it('should return error if timestamps could not be created from timestamps', async () => {
    const mock = jest.spyOn(Timestamps, 'create')
    mock.mockImplementation(() => {
      return Result.fail('Oops')
    })

    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: ItemHash.create({
        ...itemHash1.props,
        created_at_timestamp: 123,
        updated_at_timestamp: 123,
      }).getValue(),
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.isFailed()).toBeTruthy()
    mock.mockRestore()
  })

  it('should return error if performing user uuid is invalid', async () => {
    const useCase = createUseCase()

    const result = await useCase.execute({
      existingItem: item1,
      itemHash: itemHash1,
      sessionUuid: '00000000-0000-0000-0000-000000000000',
      performingUserUuid: 'invalid-uuid',
    })
    expect(result.isFailed()).toBeTruthy()
  })

  describe('when item is associated to a shared vault', () => {
    it('should add a shared vault association if item hash represents a shared vault item and the existing item is not already associated to the shared vault', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        shared_vault_uuid: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeFalsy()
      expect(item1.props.sharedVaultAssociation).not.toBeUndefined()
      expect(item1.props.sharedVaultAssociation?.props.sharedVaultUuid.value).toBe(
        '00000000-0000-0000-0000-000000000000',
      )
    })

    it('should not add a shared vault association if item hash represents a shared vault item and the existing item is already associated to the shared vault', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        shared_vault_uuid: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      item1.props.sharedVaultAssociation = SharedVaultAssociation.create({
        itemUuid: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        sharedVaultUuid: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        lastEditedBy: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        timestamps: Timestamps.create(123, 123).getValue(),
      }).getValue()
      const idBefore = item1.props.sharedVaultAssociation?.id.toString()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })

      expect(result.isFailed()).toBeFalsy()

      expect(item1.props.sharedVaultAssociation).not.toBeUndefined()
      expect(item1.props.sharedVaultAssociation.id.toString()).toEqual(idBefore)
    })

    it('should return error if shared vault uuid is invalid', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        shared_vault_uuid: 'invalid-uuid',
      }).getValue()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeTruthy()
    })

    it('should return error if shared vault association could not be created', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        shared_vault_uuid: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      const mock = jest.spyOn(SharedVaultAssociation, 'create')
      mock.mockImplementation(() => {
        return Result.fail('Oops')
      })

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeTruthy()
      mock.mockRestore()
    })
  })

  describe('when item is associated to a key system', () => {
    it('should add a key system association if item hash has a dedicated key system and the existing item is not already associated to the key system', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        key_system_identifier: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeFalsy()
      expect(item1.props.keySystemAssociation).not.toBeUndefined()
      expect(item1.props.keySystemAssociation?.props.keySystemUuid.value).toBe('00000000-0000-0000-0000-000000000000')
    })

    it('should not add a key system association if item hash has a dedicated key system and the existing item is already associated to the key system', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        key_system_identifier: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      item1.props.keySystemAssociation = KeySystemAssociation.create({
        itemUuid: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        keySystemUuid: Uuid.create('00000000-0000-0000-0000-000000000000').getValue(),
        timestamps: Timestamps.create(123, 123).getValue(),
      }).getValue()
      const idBefore = item1.props.keySystemAssociation?.id.toString()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })

      expect(result.isFailed()).toBeFalsy()

      expect(item1.props.keySystemAssociation).not.toBeUndefined()
      expect(item1.props.keySystemAssociation.id.toString()).toEqual(idBefore)
    })

    it('should return error if key system uuid is invalid', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        key_system_identifier: 'invalid-uuid',
      }).getValue()

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeTruthy()
    })

    it('should return error if key system association could not be created', async () => {
      const useCase = createUseCase()

      const itemHash = ItemHash.create({
        ...itemHash1.props,
        key_system_identifier: '00000000-0000-0000-0000-000000000000',
      }).getValue()

      const mock = jest.spyOn(KeySystemAssociation, 'create')
      mock.mockImplementation(() => {
        return Result.fail('Oops')
      })

      const result = await useCase.execute({
        existingItem: item1,
        itemHash,
        sessionUuid: '00000000-0000-0000-0000-000000000000',
        performingUserUuid: '00000000-0000-0000-0000-000000000000',
      })
      expect(result.isFailed()).toBeTruthy()
      mock.mockRestore()
    })
  })
})