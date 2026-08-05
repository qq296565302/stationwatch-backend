import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { UserPayload } from '../../common/types/user-payload';
import { ScopeService } from '../../common/scope/scope.service';

export interface SearchResult {
  type: 'record' | 'item';
  recordId: number;
  recordDate: string;
  itemId?: number;
  businessType?: string;
  title: string;
  snippet: string;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
  ) {}

  search(q: string, user: UserPayload, limit = 20): SearchResult[] {
    if (!q || !q.trim()) return [];
    const pattern = q.trim().toLowerCase();

    let records = this.storage.getRecords();
    // 按角色可见范围过滤：admin 全部、district_admin 本区县、其余本所
    records = this.scope.filterRecordsByStation(records, user);

    const results: SearchResult[] = [];

    // 记录级
    records.forEach(r => {
      const station = this.storage.getStation(r.stationId);
      const matches: string[] = [];
      if (r.otherMatters?.toLowerCase().includes(pattern)) matches.push(r.otherMatters);
      if (r.pendingIssues?.toLowerCase().includes(pattern)) matches.push(r.pendingIssues);
      if (r.weatherLabel?.toLowerCase().includes(pattern)) matches.push(r.weatherLabel);

      if (matches.length > 0) {
        results.push({
          type: 'record',
          recordId: r.id,
          recordDate: r.recordDate,
          title: `${r.recordDate} · ${station?.name ?? ''}`,
          snippet: this.makeSnippet(matches[0], pattern),
        });
      }
    });

    // 工单级
    const items = this.storage.getItems();
    items.forEach(it => {
      const r = records.find(rec => rec.id === it.recordId);
      if (!r) return;
      const fields = [
        it.content, it.businessType, it.customerName, it.customerPhone,
        it.customerAddress, it.handler, it.result,
      ];
      const matched = fields.find(f => f && f.toLowerCase().includes(pattern));
      if (matched) {
        const station = this.storage.getStation(r.stationId);
        results.push({
          type: 'item',
          recordId: r.id,
          recordDate: r.recordDate,
          itemId: it.id,
          businessType: it.businessType,
          title: it.content,
          snippet: this.makeSnippet(
            [it.businessType, it.customerName, station?.name].filter(Boolean).join(' · '),
            pattern,
          ),
        });
      }
    });

    return results.slice(0, limit);
  }

  private makeSnippet(text: string, pattern: string): string {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(pattern);
    if (idx === -1) return text.slice(0, 60);
    const start = Math.max(0, idx - 10);
    const end = Math.min(text.length, idx + pattern.length + 30);
    return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
  }
}
