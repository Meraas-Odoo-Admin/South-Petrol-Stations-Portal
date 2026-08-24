// Mirrors apps/api/src/common/dto/pagination-query.dto.ts.
export interface PaginationQuery {
  skip?: number;
  take?: number;
}

export interface PaginatedResponse<T> {
  total: number;
  rows: T[];
}
