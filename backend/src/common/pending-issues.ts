import { randomUUID } from 'crypto';

/** 一条遗留问题（内部以 JSON 数组字符串持久化于 pendingIssues 列） */
export interface PendingIssue {
  id: string;
  content: string;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolvedByName: string | null;
}

function newIssue(content: string): PendingIssue {
  return {
    id: randomUUID(),
    content,
    isResolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
  };
}

/**
 * 解析存储串为数组：
 * - 空 / 非法 JSON → []
 * - 以 `[` 开头：尝试 JSON.parse，兼容对象数组 / 纯字符串数组
 * - 其余视为 legacy 纯文本：按行拆成未解决条目
 */
export function parsePendingIssues(raw: string | null | undefined): PendingIssue[] {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((p: any): PendingIssue | null => {
          if (typeof p === 'string') return newIssue(p);
          if (p && typeof p === 'object' && typeof p.content === 'string') {
            return {
              id: typeof p.id === 'string' && p.id ? p.id : randomUUID(),
              content: p.content,
              isResolved: !!p.isResolved,
              resolvedAt: typeof p.resolvedAt === 'string' ? p.resolvedAt : null,
              resolvedBy: typeof p.resolvedBy === 'number' ? p.resolvedBy : null,
              resolvedByName: typeof p.resolvedByName === 'string' ? p.resolvedByName : null,
            };
          }
          return null;
        })
        .filter((p): p is PendingIssue => p !== null);
    } catch {
      return [];
    }
  }
  // legacy 纯文本：按行拆成未解决条目
  return textToIssues(trimmed);
}

export function serializePendingIssues(list: PendingIssue[]): string {
  return list && list.length ? JSON.stringify(list) : '';
}

export function hasUnresolved(list: PendingIssue[]): boolean {
  return list.some(p => !p.isResolved);
}

/** 新建记录时把 textarea 多行文本拆成未解决条目（空行/纯空白行丢弃） */
export function textToIssues(text: string): PendingIssue[] {
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(newIssue);
}

/**
 * 合并核心：把「用户再次提交的 textarea 多行文本」合并进已有 pendingIssues。
 * - 已解决条目全程只读保留：不参与 content 匹配、不可被删除、审计字段不变
 * - 未解决条目按 content 精确匹配逐行消费（used Set 防重复行折叠成一条）
 * - 匹配到 → 保留原 id（resolve 按 id 定位）；未匹配 → 新建；未消费的旧未解决 → 丢弃
 * - 返回：未解决在前，已解决在后
 */
export function mergePendingIssues(
  existingRaw: string | null | undefined,
  submittedText: string | undefined,
): PendingIssue[] {
  const existing = parsePendingIssues(existingRaw);
  const resolved = existing.filter(p => p.isResolved);
  const unresolvedPool = existing.filter(p => !p.isResolved);

  const submittedLines = (submittedText || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const used = new Set<PendingIssue>();
  const kept: PendingIssue[] = submittedLines.map(line => {
    const match = unresolvedPool.find(p => !used.has(p) && p.content === line);
    if (match) {
      used.add(match);
      return match;
    }
    return newIssue(line);
  });

  return [...kept, ...resolved];
}
