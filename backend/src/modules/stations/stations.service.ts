import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { Station } from '../../storage/types';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { Role } from '../../common/types/role.enum';
import { UserPayload } from '../../common/types/user-payload';
import { CreateStationDto, UpdateStationDto } from './dto/stations.dto';

@Injectable()
export class StationsService {
  constructor(private readonly storage: StorageService) {}

  list(): Station[] {
    return this.storage.getStations();
  }

  findOne(id: number): Station {
    const s = this.storage.getStation(id);
    if (!s) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    return s;
  }

  create(dto: CreateStationDto): Station {
    const now = this.storage.now();
    const station: Station = {
      id: this.storage.nextIdOf('station'),
      name: dto.name,
      code: dto.code,
      region: dto.region,
      voltage: dto.voltage,
      feeders: dto.feeders ?? 0,
      transformers: dto.transformers ?? 0,
      maxDutyItemsPerRecord: dto.maxDutyItemsPerRecord ?? 11,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    return this.storage.saveStation(station);
  }

  update(id: number, dto: UpdateStationDto, user: UserPayload): Station {
    // 所长只能编辑本所站点
    if (user.role === Role.SUPERVISOR && id !== user.stationId) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权编辑其他站点信息');
    }
    const s = this.storage.getStation(id);
    if (!s) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    if (dto.name !== undefined) s.name = dto.name;
    if (dto.code !== undefined) s.code = dto.code;
    if (dto.region !== undefined) s.region = dto.region;
    if (dto.voltage !== undefined) s.voltage = dto.voltage;
    if (dto.feeders !== undefined) s.feeders = dto.feeders;
    if (dto.transformers !== undefined) s.transformers = dto.transformers;
    if (dto.maxDutyItemsPerRecord !== undefined) s.maxDutyItemsPerRecord = dto.maxDutyItemsPerRecord;
    if (dto.isActive !== undefined) s.isActive = dto.isActive;
    s.updatedAt = this.storage.now();
    return this.storage.saveStation(s);
  }
}
