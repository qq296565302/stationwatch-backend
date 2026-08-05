export class PaginationDto {
  page?: number = 1;
  pageSize?: number = 20;
}

export class PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
