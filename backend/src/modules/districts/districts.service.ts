import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { District } from '../../storage/types';

@Injectable()
export class DistrictsService {
  constructor(private readonly storage: StorageService) {}

  /** 区县列表：全部启用区县，按 sortOrder 排序 */
  list(): District[] {
    return this.storage
      .getDistricts()
      .filter((d) => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
